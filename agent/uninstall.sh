#!/bin/bash
# Warlock Agent Uninstaller

set -e

INSTALL_DIR="/opt/warlock-agent"
CONFIG_DIR="/etc/warlock"
CONFIG_FILE="${CONFIG_DIR}/agent.conf"
SERVICE_FILE="/etc/systemd/system/warlock-agent.service"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Warlock Agent Uninstaller ===${NC}"

if [ "$EUID" -ne 0 ]; then
	echo -e "${RED}Error: This script must be run as root${NC}"
	exit 1
fi

echo "This will remove the Warlock Agent from this system."
read -p "Are you sure? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
	echo "Aborted."
	exit 0
fi

echo -e "\n${GREEN}Stopping service...${NC}"
systemctl stop warlock-agent 2>/dev/null || true

echo -e "${GREEN}Disabling service...${NC}"
systemctl disable warlock-agent 2>/dev/null || true

echo -e "${GREEN}Removing service file...${NC}"
rm -f "${SERVICE_FILE}"

echo -e "${GREEN}Removing installation directory...${NC}"
rm -rf "${INSTALL_DIR}"

echo -e "${GREEN}Removing configuration...${NC}"
rm -f "${CONFIG_FILE}"
rmdir "${CONFIG_DIR}" 2>/dev/null || true

echo -e "${GREEN}Reloading systemd...${NC}"
systemctl daemon-reload

echo -e "\n${GREEN}✓ Warlock Agent has been uninstalled${NC}"
