# Management API

Applications compatible with Warlock are expected to have the following endpoints:

## Instance Management

* `--instance <INSTANCE_ID>`: (Optional) Specify which instance to operate on. When provided, all commands operate on the specified instance. If not provided, operates on the default instance or all instances depending on the command.

## Backup / Restore Functions

* `--backup`: Backup all player data and store to default location
* `--restore <FILEPATH>`: Restore all player data from a source file
* `--max-backups <NUMBER>`: (Optional) When used with `--backup`, limit the number of stored backups to the specified number

## Update Functions

* `--check-update`: Check for updates
* `--update`: Update the application to the latest version

## Discovery Functions

* `--get-services`: Get all services and their status (JSON data). When used with `--instance`, returns services for that instance only.
* `--get-configs`: Get all game-level configuration options and their values (JSON data). When used with `--instance`, returns configs for that instance.
* `--get-ports`: Get all used ports by the application (JSON data). When used with `--instance`, returns ports for that instance.

## Status Functions

* `--has-players`: Check if this service (or services) has any players currently connected.  Returns 0 (true) if players are connected and 1 (false) if no players
* `--is-running`: Check if the application is currently running.  Returns 0 (true) if running and 1 (false) if not running

## Configuration Functions

* `--set-config <KEY> <VALUE>`: Set a game-level configuration option to a new value. When used with `--instance`, sets config for that instance only.

## Service Management

Additionally, the following service-specific endpoints are expected when used with the `--service <SERVICE>` argument included:

* `--service <SERVICE>`: Specify the service to manage for service-specific tasks
* `--instance <INSTANCE_ID>`: (Optional) Specify which instance the service belongs to

* `--get-configs`: Get the current configuration of the service
* `--set-config <KEY> <VALUE>`: Set an instance-specific configuration option to a new value
* `--pre-stop`: Perform any necessary pre-stop tasks (e.g., warn players, save map, etc.)
* `--post-start`: Perform any necessary post-start tasks (e.g., initialize mods, notify players, etc.)


## Installation Parameters

When installing an application, the following optional parameters can be provided:

* `--instance-id=<UUID>`: Specify a UUID for this installation instance. If not provided, a default instance will be created.
* `--instance-name=<NAME>`: Provide a human-readable name for this instance.


## Application Start/Stop/Restart

The application should support standard start, stop, and restart commands via systemd.
These commands should be handled outside of the application itself, typically via systemd service management commands,
though the management application can assist with functions such as player lookups and warnings on shutdown
or map saves prior to stopping the service.

This functionality can be achieved via standard systemd commands such as:

```bash
sudo systemctl start <service-name>
sudo systemctl stop <service-name>
sudo systemctl restart <service-name>
```


## Application Backup

The `--backup` endpoint should create a local backup of all relevant player data.
Backups should be a compressed archive and stored in `backups/` within the application root.

The exit code should be `0` on success, and non-zero on failure.


## Application Restore

The `--restore <FILEPATH>` endpoint should restore player data from a specified backup file.
The `<FILEPATH>` argument is the path to the backup file to restore from and should be fully qualified.

The exit code should be `0` on success, and non-zero on failure.


## Check for Updates

The `--check-update` endpoint should check if there are any updates available for the application.

The exit code should be `0` if an update is available, `1` if no updates are available, and non-zero on failure.


## Get Services and Status

The `--get-services` endpoint should return a list of all services related to the application along with their current status (running, stopped, etc.).
This return data is JSON formatted for easy parsing.

When `--instance <INSTANCE_ID>` is provided, only services for that instance are returned.

### Example Schema

```json
{
  "vein-server": {
    "service": "vein-server@instance-uuid-here",
    "name": "BitsNBytes VEIN Test",
    "ip": "45.26.230.248",
    "port": 7777,
    "status": "running",
    "player_count": 0,
    "max_players": 16,
    "memory_usage": "9.79 GB",
    "cpu_usage": "28%",
    "game_pid": 726626,
    "service_pid": 726614,
    "instance_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

Each key from the data is a service identifier with the necessary keys for that service.

* service: The system service name (must be registered with systemd, should include instance ID)
* name: The display name of the service (usually operator set)
* ip: The public IP address the service is running on
* port: The port the service is running on
* status: The current status of the service (running, stopped, starting, stopping)
* player_count: The current number of players connected to the service
* max_players: The maximum number of players allowed on the service
* memory_usage: The current memory usage of the service
* cpu_usage: The current CPU usage of the service
* game_pid: The process ID of the game server
* service_pid: The process ID of the service manager
* instance_id: The UUID of this instance (recommended)


## Get Configs

Get configs, (both app-global and per-instance lookups with `--service <SERVICE>`), return the following JSON schema:

```json
[
  {
    "option": "AISpawner", 
    "default": true, 
    "value": true, 
    "type": "bool"
  }, 
  {
    "option": "APIPort", 
    "default": "", 
    "value": 8080, 
    "type": "int"
  }, 
  ...
]
```

Acceptable types are: `bool`, `int`, `float`, and `string`.


## Set Config Option

Configuration options can be set globally or per-instance with the `--service <SERVICE>` argument.
The `--set-config <KEY> <VALUE>` endpoint sets the configuration option specified by `<KEY>` to the new value `<VALUE>`.
The application should validate the type of `<VALUE>` against the expected type for `<KEY>`.
The exit code should be `0` on success, and non-zero on failure.

Values should be fuzzy parsed for boolean types, accepting `true`, `false`, `1`, `0`, `yes`, and `no` (case insensitive).

Empty values generally indicate the service should use default value for that option.
