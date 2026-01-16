#!/bin/bash
# Quick Start Guide for WebSocket Agent Testing

echo "=== Warlock WebSocket Agent - Quick Start ==="
echo ""

# Check if running from project root
if [ ! -f "app.js" ]; then
    echo "❌ Error: Run this script from the Warlock project root"
    exit 1
fi

echo "Step 1: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi
echo "✓ Dependencies installed"
echo ""

echo "Step 2: Setting environment variables..."
export PANEL_URL=${PANEL_URL:-http://$(hostname -I | awk '{print $1}'):3077}
export PORT=${PORT:-3077}
export IP=${IP:-0.0.0.0}

echo "   PANEL_URL: $PANEL_URL"
echo "   PORT: $PORT"
echo "   IP: $IP"
echo ""

echo "Step 3: Starting Warlock..."
echo "   Press Ctrl+C to stop"
echo "   Open browser to: http://localhost:$PORT"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node app.js
