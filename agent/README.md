# Warlock Agent

WebSocket-based remote management agent for Warlock Panel.

## Features

- **Persistent WebSocket connection** to Warlock Panel
- **Real-time command execution** via secure socket channel
- **System metrics collection** (CPU, memory, disk, network, processes)
- **Auto-reconnection** with exponential backoff
- **File operations** (read, write, list)
- **Service management** (systemctl wrapper)
- **Auto-update capability** from panel
- **Systemd integration** for automatic startup and restart

## Installation

### Automatic (via Warlock Panel)

The agent is automatically installed when you add a new host to the Warlock Panel.

### Manual Installation

```bash
# Download installer
curl -O https://your-panel.com/agent/install.sh
chmod +x install.sh

# Run with panel URL and token
sudo ./install.sh --panel-url https://your-panel.com --token YOUR_TOKEN_HERE
```

## Configuration

Configuration file: `/etc/warlock/agent.conf`

```json
{
  "PANEL_URL": "https://your-panel.com",
  "AGENT_TOKEN": "your-secure-token"
}
```

## Management

```bash
# Check status
systemctl status warlock-agent

# View logs
journalctl -u warlock-agent -f

# Restart
systemctl restart warlock-agent

# Uninstall
./uninstall.sh
```

## Security

- Agent runs as root (required for system management)
- Token-based authentication
- TLS/WSS required in production
- Commands validated on agent side
- Rate limiting per socket connection

## Architecture

1. Agent connects to panel via WebSocket
2. Authenticates using pre-shared token
3. Registers with panel (hostname, version, platform)
4. Listens for commands from panel
5. Executes commands and returns results
6. Pushes metrics every 30 seconds
7. Auto-reconnects on connection loss

## Supported Commands

- `command:exec` - Execute shell command
- `command:stream` - Stream command output
- `metrics:collect` - Collect system metrics
- `file:read` - Read file content
- `file:write` - Write file content
- `file:list` - List directory
- `service:control` - Manage systemd services
- `agent:update` - Update agent version

## Version

1.0.0
