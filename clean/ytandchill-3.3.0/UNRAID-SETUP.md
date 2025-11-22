# YT and Chill - Unraid Setup Guide

## Quick Start

### Option 1: Using the Build Script (Recommended)

1. **Build the Docker image:**
   ```bash
   cd /mnt/user/appdata/ytandchill
   ./build-for-unraid.sh
   ```

2. **Copy template to Unraid:**
   ```bash
   cp ytandchill-unraid-template.xml /boot/config/plugins/dockerMan/templates-user/
   ```

3. **Add container in Unraid:**
   - Go to Docker tab in Unraid
   - Click "Add Container"
   - Select "ytandchill" from template dropdown
   - Adjust paths if needed
   - Click "Apply"

---

### Option 2: Manual Container Creation

1. **Build the image:**
   ```bash
   cd /mnt/user/appdata/ytandchill
   docker-compose build --no-cache
   docker image prune -f
   ```

2. **Create container manually in Unraid Docker tab:**
   - **Name:** ytandchill
   - **Repository:** ytandchill:latest
   - **Network Type:** bridge (standard network)
   - **WebUI:** http://[IP]:[PORT:4099]
   - **Icon URL:** https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/youtube.png
   - **Extra Parameters:** `--rm` (removes container on stop, cleans up orphaned images)

3. **Port Mappings:**
   - Container Port: 4099
   - Host Port: 4099
   - Type: TCP

4. **Path Mappings:**
   | Container Path | Host Path | Access Mode |
   |---------------|-----------|-------------|
   | `/app/data` | `/mnt/user/appdata/ytandchill/data` | Read/Write |
   | `/app/downloads` | `/mnt/user/data/media/youtube/ytandchill` | Read/Write |
   | `/app/logs` | `/mnt/user/appdata/ytandchill/logs` | Read/Write |
   | `/app/cookies.txt` | `/mnt/user/appdata/ytandchill/cookies.txt` | Read/Write (Optional) |

5. **Environment Variables (Optional):**
   - `PORT=4099`

---

## Directory Structure

Before creating the container, ensure these directories exist:

```bash
mkdir -p /mnt/user/appdata/ytandchill/data
mkdir -p /mnt/user/appdata/ytandchill/logs
mkdir -p /mnt/user/data/media/youtube/ytandchill/thumbnails
```

Set proper permissions:
```bash
chown -R 99:100 /mnt/user/appdata/ytandchill/data
chown -R 99:100 /mnt/user/appdata/ytandchill/logs
chown -R 99:100 /mnt/user/data/media/youtube/ytandchill
```

---

## Updating the Container

To rebuild and update:

```bash
cd /mnt/user/appdata/ytandchill

# Stop the container in Unraid Docker tab, then:
docker-compose build --no-cache
docker image prune -f

# Start the container again in Unraid Docker tab
```

Or use the build script:
```bash
./build-for-unraid.sh
```

---

## Auto-Cleanup Feature

The template includes `--rm` flag which:
- Automatically removes the container when stopped
- Cleans up orphaned filesystem layers
- Prevents disk space buildup from old containers

Combined with `docker image prune -f` in the build script, this keeps your Docker environment clean.

---

## Optional: YouTube Cookies

For downloading age-restricted content:

1. Export your YouTube cookies using a browser extension
2. Save as `/mnt/user/appdata/ytandchill/cookies.txt`
3. The container will automatically use it

---

## Accessing the Web Interface

After the container starts, access the web interface at:
```
http://YOUR-UNRAID-IP:4099
```

---

## Troubleshooting

### Container won't start
- Check Docker logs in Unraid
- Verify all paths exist and have correct permissions (99:100)
- Ensure port 4099 isn't already in use

### Downloads failing
- Check that cookies.txt is present for age-restricted content
- Verify download path has write permissions
- Check logs at `/mnt/user/appdata/ytandchill/logs/app.log`

### Database errors
- Ensure `/mnt/user/appdata/ytandchill/data` has 99:100 ownership
- Check that `youtube_downloader.db` file is writable

---

## Network Configuration

### Using Bridge Network (Default)
The template uses the standard bridge network:
- Set Network Type to "Bridge"
- Access via: `http://YOUR-UNRAID-IP:4099`

### Using Custom Network (Optional)
If you have a custom Docker network:
- Set Network Type to "Custom: your_network_name"
- Access via: `http://YOUR-UNRAID-IP:4099`

---

## Support

For issues or questions, check the logs:
```bash
cat /mnt/user/appdata/ytandchill/logs/app.log
```

Or view Docker logs in Unraid Docker tab by clicking the container icon.
