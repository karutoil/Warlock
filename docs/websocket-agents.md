# WebSocket Agent Implementation Guide

## Overview

This implementation replaces polling-based server communication with a WebSocket agent architecture. Agents maintain persistent connections to the panel, enabling real-time metrics, instant command execution, and bidirectional communication.

## Architecture

### Components

1. **Remote Agent** (`/agent/`)
   - Node.js application running on remote hosts
   - WebSocket client connecting to panel
   - System metrics collector
   - Command executor
   - Systemd service for auto-start

2. **Panel WebSocket Server** (`app.js`)
   - Socket.IO server handling agent connections
   - Token-based authentication
   - Command routing to agents
   - Metrics aggregation and broadcasting

3. **Frontend Client** (`/public/assets/warlock-socket.js`)
   - Socket.IO client library
   - Real-time event subscriptions
   - Connection status indicator
   - Metrics streaming

4. **Agent Manager Library** (`/libs/agent_manager.mjs`)
   - Agent connection management
   - Installation/uninstallation
   - Health monitoring
   - Token generation

5. **Hybrid Runner** (`/libs/hybrid_runner.mjs`)
   - Automatic WebSocket/SSH fallback
   - Transparent command execution
   - Connection detection

## Installation Flow

### 1. Adding a New Host

When a host is added via `/host/add`:

1. Host is validated via SSH
2. Database record created
3. `hostPostAdd()` is called
4. Agent installation begins automatically:
   - Agent token generated and stored in `AgentConnection` table
   - Install script downloaded via curl
   - Script executes with panel URL and token
   - Agent service started via systemd

### 2. Agent Installation

The agent installer (`agent/install.sh`):

1. Detects OS and installs Node.js if needed
2. Creates directories: `/opt/warlock-agent`, `/etc/warlock`
3. Copies agent files and installs dependencies
4. Creates configuration file with panel URL and token
5. Installs systemd service
6. Starts and enables agent service

### 3. Agent Connection

When agent starts:

1. Reads config from `/etc/warlock/agent.conf`
2. Connects to panel WebSocket server
3. Authenticates with token
4. Registers with hostname, platform, version
5. Begins sending metrics every 30 seconds

## Command Execution

### WebSocket Path (Preferred)

```javascript
// Backend (routes/api/service_control.js example)
const executeOnAgent = req.app.get('executeOnAgent');
const result = await executeOnAgent(hostIp, command, timeout);
```

### SSH Fallback (Automatic)

```javascript
// Using hybrid runner (automatic fallback)
import { hybridRunner } from './libs/hybrid_runner.mjs';
const result = await hybridRunner(command, hostIp, timeout, req.app);
```

### Direct SSH (Manual)

```javascript
// Legacy SSH-only execution
import { cmdRunner } from './libs/cmd_runner.mjs';
const result = await cmdRunner(command, hostIp, timeout);
```

## Real-Time Features

### Metrics Streaming

Agents push metrics every 30 seconds:

```javascript
// Frontend subscription
WarlockSocket.subscribeMetrics('192.168.1.100', (metrics) => {
    console.log('CPU:', metrics.cpu.usage);
    console.log('Memory:', metrics.memory.usage);
    // Update UI
});
```

### Event Broadcasting

Panel broadcasts events to all connected web clients:

```javascript
// Listen for stream events
WarlockEvents.onStream((event) => {
    console.log('Stream event:', event.detail);
});
```

## API Endpoints

### Agent Management

- `GET /api/agents` - List all agent connections
- `GET /api/agents/:ip` - Get agent status for host
- `POST /api/agents/:ip/install` - Install agent on host
- `POST /api/agents/:ip/uninstall` - Remove agent from host
- `POST /api/agents/:ip/health` - Check agent health
- `POST /api/agents/:ip/regenerate-token` - Generate new auth token

### Example Usage

```javascript
// Check if agent is connected
fetch('/api/agents/192.168.1.100')
    .then(r => r.json())
    .then(data => {
        if (data.connected) {
            console.log('Agent online, using WebSocket');
        } else {
            console.log('Agent offline, using SSH fallback');
        }
    });
```

## Database Schema

### AgentConnection Model

```javascript
{
    host_ip: STRING,          // Host IP address (unique)
    socket_id: STRING,        // Current socket ID (null if disconnected)
    agent_token: STRING,      // Authentication token
    agent_version: STRING,    // Agent version
    connected_at: INTEGER,    // Unix timestamp of last connection
    last_ping: INTEGER,       // Unix timestamp of last ping
    status: STRING,           // 'connected', 'disconnected', 'error'
    createdAt: DATE,
    updatedAt: DATE
}
```

## Frontend Integration

### Including WebSocket Client

Add to EJS views:

```html
<%- include('partials/websocket.ejs') %>
```

This includes:
- Socket.IO client library (CDN)
- Warlock WebSocket wrapper

### Using WebSocket Client

```javascript
// Check connection status
if (WarlockSocket.isConnected()) {
    console.log('WebSocket connected');
}

// Subscribe to events
const unsubscribe = WarlockSocket.on('custom:event', (data) => {
    console.log('Event received:', data);
});

// Unsubscribe later
unsubscribe();

// Emit events
WarlockSocket.emit('command:request', { host: '192.168.1.100', cmd: 'uptime' }, (response) => {
    console.log('Response:', response);
});
```

### Connection Status Indicator

Automatically displayed in top-right corner:
- 🟢 Connected - WebSocket active
- 🟡 Connecting... - Reconnecting
- 🔴 Disconnected - No connection

## Security Considerations

### Authentication

- Each agent has a unique token (64-char hex)
- Tokens stored securely in database
- Agents must authenticate on connection
- Invalid tokens rejected immediately

### Command Validation

- Commands executed as root (required for system management)
- Consider implementing command whitelisting on agent side
- Rate limiting per socket connection (TODO)
- TLS/WSS required in production (TODO)

### Token Regeneration

Regenerate token if compromised:

```bash
curl -X POST http://panel.example.com/api/agents/192.168.1.100/regenerate-token
# Then reinstall agent with new token
```

## Monitoring and Debugging

### Agent Logs

```bash
# View agent logs on remote host
journalctl -u warlock-agent -f

# Check agent status
systemctl status warlock-agent

# Restart agent
systemctl restart warlock-agent
```

### Panel Logs

```bash
# Panel logs show agent connections
# Look for:
# - "Agent connected: IP (hostname) vX.X.X"
# - "Agent disconnected: IP - reason"
# - "Agent authentication failed: ..."
```

### Health Checks

```javascript
// Backend health check
const health = await checkAgentHealth(hostIp, agentSockets);
console.log(health);
// { connected: true, latency: 45 }
```

## Migration Guide

### Updating Existing Routes

Before (SSH only):

```javascript
const result = await cmdRunner(command, host);
```

After (WebSocket with fallback):

```javascript
const executeOnAgent = req.app.get('executeOnAgent');
const result = await agentExecuteCommand(host, command, executeOnAgent);
```

Or use hybrid runner:

```javascript
import { hybridRunner } from '../libs/hybrid_runner.mjs';
const result = await hybridRunner(command, host, 30000, req.app);
```

### Updating Frontend Polling

Before (setInterval polling):

```javascript
setInterval(async () => {
    const response = await fetch('/api/services');
    const data = await response.json();
    updateUI(data);
}, 30000);
```

After (WebSocket subscription):

```javascript
WarlockSocket.subscribeMetrics(hostIp, (metrics) => {
    updateUI(metrics);
});

// Still fetch initial data
const response = await fetch('/api/services');
updateUI(await response.json());
```

## Uninstallation

### Remove Agent from Host

```bash
# Via API
curl -X POST http://panel.example.com/api/agents/192.168.1.100/uninstall

# Or manually on host
systemctl stop warlock-agent
systemctl disable warlock-agent
rm -rf /opt/warlock-agent
rm -rf /etc/warlock
rm /etc/systemd/system/warlock-agent.service
systemctl daemon-reload
```

### Remove from Panel

Agent connection records are automatically deleted when uninstalling via API.

## Troubleshooting

### Agent Won't Connect

1. Check firewall allows WebSocket connection to panel
2. Verify panel URL is accessible from remote host
3. Check token matches in database and agent config
4. Review agent logs: `journalctl -u warlock-agent -n 50`

### Commands Failing

1. Check agent status in `/api/agents/:ip`
2. Verify command works via SSH manually
3. Check timeout values (increase if needed)
4. Review agent permissions (must run as root)

### High Latency

1. Check network connection between agent and panel
2. Monitor agent CPU/memory usage
3. Review metrics collection interval (adjust in agent.js)
4. Consider increasing ping timeout

## Performance

### Metrics Collection

- Agent pushes metrics every 30 seconds
- Panel broadcasts to connected web clients
- Database stores historical metrics (existing system)

### Connection Overhead

- Single persistent WebSocket per host
- Minimal bandwidth (keepalive pings)
- Auto-reconnection with exponential backoff

### Scaling

- Socket.IO supports clustering (future enhancement)
- Consider Redis adapter for multi-instance panels
- Agent connections distributed across panel instances

## Future Enhancements

1. **TLS/WSS Support** - Encrypted WebSocket connections
2. **Rate Limiting** - Per-socket command throttling
3. **Command Whitelist** - Restrict agent command execution
4. **Agent Auto-Update** - Push updates from panel
5. **Compression** - Reduce bandwidth for metrics
6. **Clustering** - Multi-panel load balancing
7. **Agent Plugins** - Extensible agent capabilities

## References

- Socket.IO Documentation: https://socket.io/docs/v4/
- Systemd Service Files: https://www.freedesktop.org/software/systemd/man/systemd.service.html
- Node.js Child Process: https://nodejs.org/api/child_process.html
