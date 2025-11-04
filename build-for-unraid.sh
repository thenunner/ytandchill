#!/bin/bash
set -e

echo "=========================================="
echo "YT and Chill - Unraid Build Script"
echo "=========================================="
echo ""

# Build the Docker image
echo "Building Docker image..."
docker-compose build --no-cache

echo ""
echo "Build complete!"
echo ""

# Clean up orphaned images
echo "Cleaning up orphaned/dangling images..."
docker image prune -f

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Copy the template to Unraid:"
echo "   cp /mnt/user/appdata/ytandchill/ytandchill-unraid-template.xml /boot/config/plugins/dockerMan/templates-user/"
echo ""
echo "2. Or manually create the container in Unraid Docker tab using:"
echo "   - Repository: ytandchill:latest"
echo "   - Network Type: Custom - tarantino"
echo "   - Port: 4099"
echo "   - Paths:"
echo "     /app/data -> /mnt/user/appdata/ytandchill/data"
echo "     /app/downloads -> /mnt/user/data/media/youtube/ytandchill"
echo "     /app/logs -> /mnt/user/appdata/ytandchill/logs"
echo "     /app/cookies.txt -> /mnt/user/appdata/ytandchill/cookies.txt"
echo ""
echo "3. Access the WebUI at: http://YOUR-SERVER-IP:4099"
echo "=========================================="
