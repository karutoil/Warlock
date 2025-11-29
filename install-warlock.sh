#!/usr/bin/env bash
# install-warlock.sh
# Install Warlock as a systemd service in-place (service runs from the directory where this script lives)
# Usage: install-warlock.sh [--user <name>] [--help]

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
INSTALL_DIR="$(dirname "$(readlink -f "$0")")"
NODE_BIN=""
SERVICE_UNIT_PATH="/etc/systemd/system/warlock.service"
ENV_FILE="$INSTALL_DIR/.env"
SERVICE_USER=root

print_help() {
  cat <<EOF
Usage: $SCRIPT_NAME [options]

Options:
  --user <name>        Run the service as <name> (default: root)
  --help               Show this help message

This installer will:
 - Resolve the install directory to the location of this script and run the service from there
 - Detect the node binary and generate a systemd unit at $SERVICE_UNIT_PATH
 - Enable and start the warlock.service via systemd

Note: This script must be run as root to install the systemd unit and write to /etc.
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
	case "$1" in
		--user)
			shift
			if [[ $# -eq 0 ]]; then
				echo "--user requires an argument" >&2
				exit 1
			fi
			SERVICE_USER="$1"
			shift
			;;
		--help)
			print_help
			exit 0
			;;
		*)
			echo "Unknown option: $1" >&2
			print_help
			exit 1
			;;
	esac
done

# Require root
if [[ $(id -u) -ne 0 ]]; then
	echo "This installer must be run as root." >&2
	exit 1
fi

# Locate node
if ! NODE_BIN=$(command -v node); then
	echo "Node.js binary not found in PATH. Install Node.js or make it available in PATH." >&2
	exit 1
fi

if ! which -s nginx; then
	echo "Warning: Nginx not found in PATH. You may need to set up a reverse proxy manually." >&2
fi

VERSION="$(node --version | sed 's:v::' | cut -d '.' -f 1)"
if [[ "$VERSION" -lt 20 ]]; then
	echo "Node.js version 20 or higher is required. Detected version: $VERSION" >&2
	echo "" >&2
	echo "If you are on Ubuntu/Debian, you can use the following to install v20:" >&2
	echo '  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -' >&2
	echo '  sudo apt-get install -y nodejs' >&2
	exit 1
fi

# Install dependencies for this application.
PWD="$(pwd)"
if [ "$PWD" != "$INSTALL_DIR" ]; then
	cd "$INSTALL_DIR"
fi
npm install
if [ "$PWD" != "$INSTALL_DIR" ]; then
	cd -
fi

# Generate unit file
TMP_UNIT=$(mktemp)
cat > "$TMP_UNIT" <<UNIT
[Unit]
Description=Warlock Management App
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/app.js
Restart=on-failure
# Run as the requested user (omit or set to root by default)
User=$SERVICE_USER
# Environment file (optional)
EnvironmentFile=$ENV_FILE
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

chmod 0644 "$TMP_UNIT"
mv "$TMP_UNIT" "$SERVICE_UNIT_PATH"

# Create environment file
if [ ! -e "$ENV_FILE" ]; then
	SECRET="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)"
	cat > "$ENV_FILE" <<ENV
PORT=3077
NODE_ENV=production
SESSION_SECRET=$SECRET
SKIP_AUTHENTICATION=false
ENV
	if [[ "$SERVICE_USER" != "root" ]]; then
		chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
	fi
fi

# Reload systemd and enable/start service
echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Enabling and starting warlock.service..."
if ! systemctl enable --now warlock.service; then
  echo "Failed to enable/start warlock.service. Check 'journalctl -u warlock.service' for details." >&2
  exit 1
fi

# If nginx is installed, generate a simple site config that reverse-proxies to the local app
if command -v nginx >/dev/null 2>&1; then
  echo "Nginx detected: generating nginx site config..."
  NGINX_AVAILABLE="/etc/nginx/sites-available/warlock"
  NGINX_ENABLED="/etc/nginx/sites-enabled/warlock"
  # Backup existing config if present
  if [[ -f "$NGINX_AVAILABLE" ]]; then
    TS=$(date +%s)
    cp -a "$NGINX_AVAILABLE" "${NGINX_AVAILABLE}.bak.$TS" || true
  fi

  TMP_NGINX=$(mktemp)
  cat > "$TMP_NGINX" <<NGINX
server {
    listen 80;
    server_name _;

    # Serve static assets directly from the install directory
    location /assets/ {
        alias $INSTALL_DIR/public/assets/;
        access_log off;
        expires 1d;
    }

    # Proxy all other requests to the local Node.js app
    location / {
        proxy_pass http://127.0.0.1:3077;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  chmod 0644 "$TMP_NGINX"
  mv "$TMP_NGINX" "$NGINX_AVAILABLE"
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"

  # Test nginx config and reload if valid
  if nginx -t >/dev/null 2>&1; then
    echo "Nginx configuration OK — reloading nginx"
    systemctl reload nginx || echo "Warning: failed to reload nginx" >&2
  else
    echo "Warning: generated nginx configuration failed nginx -t. Leaving the file in $NGINX_AVAILABLE for inspection." >&2
  fi
else
  echo "Note: nginx not found; skipping nginx site generation."
fi

# Output quick verification
echo "Service status:"
systemctl --no-pager status warlock.service --lines=10 || true

echo "Recent journal entries (last 50 lines):"
journalctl -u warlock.service -n 50 --no-pager || true

echo "Installation complete. To uninstall, run: sudo ./uninstall-warlock.sh"
