#!/bin/bash

echo "=========================================="
echo "Starting YT and Chill (Native Linux)"
echo "=========================================="
echo ""

# Change to the script's directory (project root)
cd "$(dirname "$0")"

# Create data directory if it doesn't exist
mkdir -p data

echo "Starting backend server on port 4099..."
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run from project root
python3 backend/app.py
