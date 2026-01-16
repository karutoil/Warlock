#!/bin/bash
# Warlock Agent Installer
# Installs and configures the Warlock Agent as a systemd service

set -e

VERSION="1.0.0"
INSTALL_DIR="/opt/warlock-agent"
CONFIG_DIR="/etc/warlock"
CONFIG_FILE="${CONFIG_DIR}/agent.conf"
SERVICE_FILE="/etc/systemd/system/warlock-agent.service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Warlock Agent Installer v${VERSION} ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
	echo -e "${RED}Error: This installer must be run as root${NC}"
	exit 1
fi

# Parse arguments
PANEL_URL=""
AGENT_TOKEN=""

while [[ $# -gt 0 ]]; do
	case $1 in
		--panel-url)
			PANEL_URL="$2"
			shift 2
			;;
		--token)
			AGENT_TOKEN="$2"
			shift 2
			;;
		*)
			echo "Unknown option: $1"
			exit 1
			;;
	esac
done

if [ -z "$PANEL_URL" ] || [ -z "$AGENT_TOKEN" ]; then
	echo -e "${RED}Error: Missing required arguments${NC}"
	echo "Usage: $0 --panel-url <URL> --token <TOKEN>"
	echo "Example: $0 --panel-url https://panel.example.com --token abc123def456"
	exit 1
fi

echo -e "${YELLOW}Panel URL: ${PANEL_URL}${NC}"
echo -e "${YELLOW}Installing to: ${INSTALL_DIR}${NC}"

# Detect OS and install Node.js if needed
echo -e "\n${GREEN}Step 1: Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
	echo "Node.js not found. Installing..."
	
	if [ -f /etc/debian_version ]; then
		# Debian/Ubuntu
		curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
		apt-get install -y nodejs
	elif [ -f /etc/redhat-release ]; then
		# RHEL/CentOS/Rocky/Alma
		curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
		yum install -y nodejs
	elif [ -f /etc/arch-release ]; then
		# Arch Linux
		pacman -S --noconfirm nodejs npm
	else
		echo -e "${RED}Unsupported OS. Please install Node.js 18+ manually.${NC}"
		exit 1
	fi
else
	NODE_VERSION=$(node -v)
	echo "Node.js already installed: ${NODE_VERSION}"
fi

# Create directories
echo -e "\n${GREEN}Step 2: Creating directories...${NC}"
mkdir -p "${INSTALL_DIR}"
mkdir -p "${CONFIG_DIR}"

# Copy agent files
echo -e "\n${GREEN}Step 3: Installing agent files...${NC}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cp "${SCRIPT_DIR}/agent.js" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/package.json" "${INSTALL_DIR}/"

# Install dependencies
echo -e "\n${GREEN}Step 4: Installing dependencies...${NC}"
cd "${INSTALL_DIR}"
npm install --production --no-audit --no-fund

# Create configuration
echo -e "\n${GREEN}Step 5: Creating configuration...${NC}"
cat > "${CONFIG_FILE}" <<EOF
{
	"PANEL_URL": "${PANEL_URL}",
	"AGENT_TOKEN": "${AGENT_TOKEN}"
}
EOF

chmod 600 "${CONFIG_FILE}"
echo "Config saved to: ${CONFIG_FILE}"

# Create systemd service
echo -e "\n${GREEN}Step 6: Creating systemd service...${NC}"

# Detect node path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
	echo -e "${RED}Error: Node.js not found in PATH${NC}"
	exit 1
fi

echo "Using Node.js at: $NODE_PATH"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Warlock Agent - Remote Management Service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=root
ExecStart=${NODE_PATH} ${INSTALL_DIR}/agent.js

# Security hardening
NoNewPrivileges=false
PrivateTmp=false

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=warlock-agent

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo -e "\n${GREEN}Step 7: Enabling and starting service...${NC}"
systemctl daemon-reload
systemctl enable warlock-agent
systemctl start warlock-agent

# Check status
sleep 2
if systemctl is-active --quiet warlock-agent; then
	echo -e "\n${GREEN}✓ Warlock Agent installed and running successfully!${NC}"
	echo -e "${YELLOW}Service status:${NC}"
	systemctl status warlock-agent --no-pager -l | head -n 15
else
	echo -e "\n${RED}✗ Agent failed to start. Check logs:${NC}"
	journalctl -u warlock-agent -n 50 --no-pager
	exit 1
fi

echo -e "\n${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}Useful commands:${NC}"
echo "  - Check status: systemctl status warlock-agent"
echo "  - View logs: journalctl -u warlock-agent -f"
echo "  - Restart: systemctl restart warlock-agent"
echo "  - Uninstall: systemctl stop warlock-agent && systemctl disable warlock-agent && rm -rf ${INSTALL_DIR} ${CONFIG_FILE} ${SERVICE_FILE}"
