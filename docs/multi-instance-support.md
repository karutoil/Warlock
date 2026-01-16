# Multi-Instance Support in Warlock

## Overview

Warlock now supports running multiple instances of the same game on a single host. Each instance operates independently with its own:

- Unique instance ID (UUID)
- Systemd service(s)
- Installation directory
- Configuration files
- Port allocations
- Save data and backups
- Metrics tracking

## Architecture

### Instance Identification

Each instance is identified by a UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`). When no instance ID is specified, the system uses `"default"` as the identifier for backward compatibility.

### Storage

**Database Models:**
- `Metric` model includes `instance_id` field for per-instance metrics
- `ApplicationInstance` model tracks all installed instances with:
  - `instance_id` (primary key)
  - `app_guid` (game type)
  - `host` (IP address)
  - `path` (installation directory)
  - `instance_name` (optional human-readable name)
  - `created_at` (timestamp)

**File System:**
- Registration files: `/var/lib/warlock/<guid>.<instance_id>.app` (or `<guid>.app` for default)
- Each file contains the installation path for that instance

### Caching

All cache keys include instance ID to prevent collisions:
- `services_<guid>_<host>_<instance_id>`
- `service_configs_<guid>_<host>_<instance_id>_<service>`
- `app_configs_<guid>_<host>_<instance_id>`
- `players_<guid>_<host>_<instance_id>_<service>`

## API Usage

### Installation

Install a new instance by providing instance parameters:

```javascript
PUT /api/application/:guid/:host
Body: {
  "options": ["--dir=/opt/game-instance-2"],
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "instance_name": "Production Server 2"
}
```

The installer should:
1. Accept `--instance-id=<UUID>` parameter
2. Accept `--instance-name=<NAME>` parameter
3. Create installation in unique directory
4. Generate systemd services with instance ID in name
5. Register instance with Warlock

### Service Control

Control a specific instance's service:

```javascript
POST /api/service_control/:guid/:host/:service
Body: {
  "action": "restart",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Configuration

Get/set configs for a specific instance:

```javascript
GET /api/application_configs/:guid/:host?instance_id=<UUID>
POST /api/service_configs/:guid/:host/:service
Body: {
  "instance_id": "<UUID>",
  "ConfigKey": "value"
}
```

### Backups

Backup/restore for specific instance:

```javascript
POST /api/application/backup/:guid/:host
Body: { "instance_id": "<UUID>" }

PUT /api/application/backup/:guid/:host
Body: {
  "instance_id": "<UUID>",
  "filename": "backup-file.tar.gz"
}
```

### Metrics

Metrics automatically include instance_id when queried.

## Management Script (manage.py) Integration

### Command Line

All manage.py commands support the `--instance` parameter:

```bash
# Get services for specific instance
./manage.py --instance 550e8400-e29b-41d4-a716-446655440000 --get-services

# Start specific instance's service
./manage.py --instance <UUID> --service game-server --start

# Backup specific instance
./manage.py --instance <UUID> --backup

# Update specific instance
./manage.py --instance <UUID> --update
```

### Python Implementation

The `BaseApp` class now includes `instance_id` attribute:

```python
class MyGame(BaseApp):
    def __init__(self):
        super().__init__()
        # instance_id will be set when --instance parameter is provided
        
    def get_services(self):
        # Filter services based on self.instance_id if set
        # Service names should include instance ID
        if self.instance_id:
            service_name = f"{self.name}@{self.instance_id}"
        else:
            service_name = self.name
        return [MyService(service_name, self)]
```

### JSON Output

Service and metrics endpoints include instance_id:

```json
{
  "game-server": {
    "service": "game-server@550e8400-e29b-41d4-a716-446655440000",
    "name": "Production Server 2",
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "ip": "203.0.113.10",
    "port": 7777,
    "status": "running",
    "player_count": 5,
    "max_players": 16
  }
}
```

## Systemd Service Naming

### Recommended Convention

Use systemd template units for multi-instance support:

```ini
# /etc/systemd/system/myGame@.service
[Unit]
Description=My Game Server (Instance %i)

[Service]
Type=simple
User=steam
WorkingDirectory=/opt/myGame-%i
ExecStart=/opt/myGame-%i/run.sh
```

Then instances can be:
- `myGame@default.service` (default instance)
- `myGame@550e8400-e29b-41d4-a716-446655440000.service` (specific instance)

### Alternative Approaches

1. **Separate service files per instance:**
   - `myGame-instance1.service`
   - `myGame-instance2.service`

2. **Single service with multiple ExecStart:**
   - Less recommended for isolation

## Implementation Checklist for Game Installers

When adding multi-instance support to a game installer:

- [ ] Accept `--instance-id=<UUID>` parameter
- [ ] Accept `--instance-name=<NAME>` parameter  
- [ ] Generate unique instance ID if not provided
- [ ] Create installation in instance-specific directory
- [ ] Include instance ID in systemd service names
- [ ] Allocate unique ports (check for conflicts)
- [ ] Create instance-specific backup directory
- [ ] Register instance in `/var/lib/warlock/<guid>.<instance_id>.app`
- [ ] Set `game.instance_id` in manage.py
- [ ] Filter services by instance in `get_services()`
- [ ] Include instance_id in JSON output
- [ ] Update configuration paths to be instance-specific
- [ ] Test installation of multiple instances
- [ ] Verify port conflict detection
- [ ] Test backup/restore per instance
- [ ] Verify metrics collection per instance

## Testing

Run the instance support test suite:

```bash
node tests/test_instance_support.mjs
```

Tests verify:
- Instance-aware cache key generation
- Separate data storage per instance
- Default instance handling
- UUID validation
- Config cache isolation

## Migration from Single-Instance

Existing single-instance installations are backward compatible:
- They use `"default"` as instance_id
- No changes required to existing installations
- New instances can be added alongside existing ones

## Security Considerations

- Instance IDs should be UUIDs (not user input)
- Port allocations must prevent conflicts
- File permissions must be instance-isolated
- Systemd service names must be unique
- Backup file access should be instance-scoped

## Troubleshooting

### Multiple instances on same port
- Check port allocation in each instance's config
- Ensure `--get-ports` returns unique ports per instance
- Verify firewall rules allow all allocated ports

### Services not starting
- Check systemd service name includes instance ID
- Verify installation directory is instance-specific
- Check file permissions for instance directory

### Metrics not separating
- Ensure `instance_id` is included in JSON output
- Verify cache keys include instance identifier
- Check database Metric records have instance_id

### Cache collisions
- Clear cache: Application cache uses instance-aware keys
- Verify instance_id in hostData object
- Check cache key format matches pattern

## Example: Installing Two Palworld Instances

```bash
# Install first instance (default)
curl -X PUT http://localhost:3077/api/application/palworld-guid/203.0.113.10 \
  -d '{"options": ["--dir=/opt/palworld-1", "--port=8211"]}'

# Install second instance
curl -X PUT http://localhost:3077/api/application/palworld-guid/203.0.113.10 \
  -d '{
    "options": ["--dir=/opt/palworld-2", "--port=8212"],
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "instance_name": "PvP Server"
  }'

# Control second instance
curl -X POST http://localhost:3077/api/service_control/palworld-guid/203.0.113.10/palworld-server \
  -d '{
    "action": "restart",
    "instance_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Future Enhancements

Potential improvements to multi-instance support:

- UI for managing instances (list, create, delete)
- Instance cloning (copy configs to new instance)
- Port auto-allocation with conflict detection
- Instance groups/tags for bulk operations
- Resource limit enforcement per instance
- Cross-instance player transfer tools
- Unified dashboard showing all instances
