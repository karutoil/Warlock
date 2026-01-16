#!/bin/bash
# WebSocket Agent Verification Script

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PANEL_URL="http://127.0.0.1:3077"
HOST_IP="127.0.0.1"

echo -e "${BLUE}=== Warlock WebSocket Agent Verification ===${NC}"
echo ""

# Test 1: Check if agent service is running
echo -e "${YELLOW}Test 1: Agent Service Status${NC}"
if systemctl is-active --quiet warlock-agent; then
    echo -e "${GREEN}✓ Agent service is running${NC}"
else
    echo -e "${RED}✗ Agent service is NOT running${NC}"
    echo "  Run: systemctl status warlock-agent"
    exit 1
fi
echo ""

# Test 2: Check agent logs for connection
echo -e "${YELLOW}Test 2: Agent Connection Logs${NC}"
if journalctl -u warlock-agent --since "1 minute ago" | grep -q "Connected to panel"; then
    echo -e "${GREEN}✓ Agent connected to panel${NC}"
    journalctl -u warlock-agent --since "1 minute ago" | grep "Connected to panel" | tail -1
else
    echo -e "${YELLOW}⚠ Connection not found in recent logs${NC}"
    echo "  Last 5 log lines:"
    journalctl -u warlock-agent -n 5 --no-pager
fi
echo ""

# Test 3: Check API for agent status
echo -e "${YELLOW}Test 3: API Agent Status Check${NC}"
AGENT_STATUS=$(curl -s "${PANEL_URL}/api/agents/${HOST_IP}" 2>/dev/null)
if echo "$AGENT_STATUS" | grep -q '"connected":true'; then
    echo -e "${GREEN}✓ Panel reports agent is CONNECTED via WebSocket${NC}"
    echo "$AGENT_STATUS" | python3 -m json.tool 2>/dev/null || echo "$AGENT_STATUS"
else
    echo -e "${RED}✗ Panel reports agent is NOT connected${NC}"
    echo "$AGENT_STATUS" | python3 -m json.tool 2>/dev/null || echo "$AGENT_STATUS"
fi
echo ""

# Test 4: Check panel logs for agent connection
echo -e "${YELLOW}Test 4: Panel WebSocket Logs${NC}"
PANEL_PID=$(lsof -ti:3077 2>/dev/null | head -1)
if [ -n "$PANEL_PID" ]; then
    echo "Panel running with PID: $PANEL_PID"
    echo "Recent agent-related logs:"
    journalctl -n 50 --no-pager | grep -i "agent" | tail -5
else
    echo -e "${YELLOW}⚠ Could not find panel process${NC}"
fi
echo ""

# Test 5: Verify agent config
echo -e "${YELLOW}Test 5: Agent Configuration${NC}"
if [ -f /etc/warlock/agent.conf ]; then
    echo -e "${GREEN}✓ Agent config exists${NC}"
    echo "Config contents:"
    cat /etc/warlock/agent.conf | python3 -m json.tool 2>/dev/null
else
    echo -e "${RED}✗ Agent config not found${NC}"
fi
echo ""

# Test 6: Check for active WebSocket connections
echo -e "${YELLOW}Test 6: Active WebSocket Connections${NC}"
WS_CONNECTIONS=$(ss -tn | grep ":3077" | wc -l)
if [ "$WS_CONNECTIONS" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $WS_CONNECTIONS active connection(s) to panel${NC}"
    echo "Connection details:"
    ss -tn | grep ":3077" | head -3
else
    echo -e "${YELLOW}⚠ No active connections found (this may be normal)${NC}"
fi
echo ""

# Test 7: Agent metrics push
echo -e "${YELLOW}Test 7: Metrics Push Test${NC}"
echo "Waiting 5 seconds to observe metrics push..."
sleep 5
if journalctl -u warlock-agent --since "10 seconds ago" | grep -q "metrics"; then
    echo -e "${GREEN}✓ Agent is pushing metrics${NC}"
else
    echo -e "${YELLOW}⚠ No metrics activity detected in recent logs${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}=== Verification Summary ===${NC}"
echo ""
echo "Quick verification steps in browser:"
echo "1. Open: ${PANEL_URL}/hosts"
echo "2. Look for ${HOST_IP} card"
echo "3. Should show: 🟢 'Agent Connected' badge"
echo ""
echo "Advanced browser verification:"
echo "1. Open browser DevTools (F12)"
echo "2. Go to Network tab"
echo "3. Filter by 'WS' (WebSocket)"
echo "4. Refresh page"
echo "5. Should see active WebSocket connection"
echo "6. Click the connection to see messages"
echo ""
echo "Manual log monitoring:"
echo "  Agent logs:  journalctl -u warlock-agent -f"
echo "  Panel logs:  Check terminal running 'npm run dev'"
echo ""

# Final status check
if systemctl is-active --quiet warlock-agent && echo "$AGENT_STATUS" | grep -q '"connected":true'; then
    echo -e "${GREEN}✓✓✓ WebSocket agent is WORKING! ✓✓✓${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some checks failed. Review output above.${NC}"
    exit 1
fi
