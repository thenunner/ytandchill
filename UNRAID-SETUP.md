# YT and Chill - Unraid Setup Guide

> **Note:** This guide uses common Unraid paths. Adjust to match your setup:
> - App data: `/mnt/user/appdata/ytandchill`
> - Downloads: `/mnt/user/data/media/youtube/ytandchill`
> - Firefox (optional): `/mnt/user/appdata/firefox/.mozilla/firefox`

## Quick Start

### Option 1: Docker Compose (Recommended)

1. **Clone or copy the repository:**
   ```bash
   cd /mnt/user/appdata
   git clone https://github.com/thenunner/ytandchill.git
   cd ytandchill
   ```

2. **Build and start:**
   ```bash
   docker-compose up -d --build
   ```

3. **Access the web interface:**
   - Open http://YOUR-UNRAID-IP:4099

---

### Option 2: Manual Container Creation

1. **Build the image:**
   ```bash
   cd /mnt/user/appdata/ytandchill
   docker-compose build --no-cache
   ```

2. **Create container manually in Unraid Docker tab:**
   - **Name:** ytandchill
   - **Repository:** ytandchill:latest
   - **Network Type:** bridge (standard network)
   - **WebUI:** http://[IP]:[PORT:4099]
   - **Icon URL:** https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/youtube.png
   - **Extra Parameters:** `--rm` (removes container on stop, cleans up orphaned images)

3. **Port Mappings:**
   - Container Port: Set via `PORT` env variable (default: 4099)
   - Host Port: Your choice (default: 4099)
   - Type: TCP

4. **Path Mappings:**
   | Container Path | Host Path | Access Mode |
   |---------------|-----------|-------------|
   | `/app/data` | `/mnt/user/appdata/ytandchill/data` | Read/Write |
   | `/app/downloads` | `/mnt/user/data/media/youtube/ytandchill` | Read/Write |
   | `/app/logs` | `/mnt/user/appdata/ytandchill/logs` | Read/Write |
   | `/firefox_profile` | `/mnt/user/appdata/firefox/.mozilla/firefox` | Read Only (Optional) |

   > **Note:** Place `cookies.txt` in your data folder (`/mnt/user/appdata/ytandchill/data/cookies.txt`). No separate mount needed.

5. **Environment Variables (Optional):**
   - `PORT=4099`

---

## Directory Structure

**Note:** When using the template (Option 1), Unraid automatically creates the directories when you start the container. Manual creation is only needed for manual setups.

**If you encounter permission errors** after starting the container, run:
```bash
chown -R 99:100 /mnt/user/appdata/ytandchill
chown -R 99:100 /mnt/user/data/media/youtube/ytandchill
```

---

## Non-Unraid Docker Users

The container defaults to UID:GID `99:100` (Unraid's nobody:users). If you're on generic Linux, set your IDs via environment variables in docker-compose.yml:

```yaml
environment:
  - PORT=4099
  - PUID=1000  # Your UID (run 'id -u' to find)
  - PGID=1000  # Your GID (run 'id -g' to find)
```

Then rebuild: `docker-compose up -d --build`

---

## Updating the Container

**If using GitHub Container Registry (templated):**
- In Unraid Docker tab → click **Force Update** on ytandchill container

**If using local docker-compose build:**
```bash
cd /mnt/user/appdata/ytandchill
git pull
docker-compose down
docker-compose up -d --build
```

---

## Auto-Cleanup Feature

The template includes `--rm` flag which:
- Automatically removes the container when stopped
- Cleans up orphaned filesystem layers
- Prevents disk space buildup from old containers

Combined with `docker image prune -f` in the build script, this keeps your Docker environment clean.

---

## YouTube Cookie Authentication (Strongly Recommended)

**YouTube cookies are essential for reliable downloads.** Choose one method:

### Method 1: cookies.txt File

**Setup:**
1. Install browser extension:
   - Chrome/Edge: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"
2. Go to youtube.com (logged in)
3. Click extension and export cookies for youtube.com
4. Save as `/mnt/user/appdata/ytandchill/data/cookies.txt` (inside your data folder)
5. Restart container
6. In YT and Chill Settings, select "Cookie Source: cookies.txt"

### Method 2: Firefox Browser Integration (Recommended)

**Automatically extracts cookies from Firefox - no manual exports needed!**

**Setup:**

1. **If you have a Firefox Docker container:**
   - Ensure Firefox is running with profile at `/mnt/user/appdata/firefox/.mozilla/firefox`
   - Make sure YouTube is logged in Firefox

2. **Configure YT and Chill container:**

   **Using Template:**
   - Edit ytandchill container
   - Scroll to "Firefox Profile (Optional)" in advanced settings
   - Set Host Path: `/mnt/user/appdata/firefox/.mozilla/firefox`
   - Leave Container Path as `/firefox_profile`
   - Set Access Mode: Read Only
   - Apply and restart

   **Manual Setup (if not using template):**
   - Add path mapping:
     - Container: `/firefox_profile`
     - Host: `/mnt/user/appdata/firefox/.mozilla/firefox`
     - Mode: Read Only

3. **Configure in YT and Chill:**
   - Go to Settings
   - Under "Cookie Source", select "Firefox"
   - Status will show:
     - ✅ Green "Firefox Profile" = Working!
     - ⚠️ Yellow "No YouTube Login" = Sign into YouTube in Firefox
     - ❌ Red "Not Mounted" = Check volume mount configuration

**Advantages:**
- No manual cookie exports
- Always up-to-date (reads directly from Firefox)
- Automatic fallback to cookies.txt if extraction fails

**Important:**
- Use a disposable YouTube account, not your personal account
- Cookies expire periodically - re-export or keep Firefox logged in
- Without cookies: expect bot detection errors, rate limiting, and failed downloads

---

## Accessing the Web Interface

After the container starts, access the web interface at:
```
http://YOUR-UNRAID-IP:YOUR-PORT
```

---

## Troubleshooting

### Container won't start
- Check Docker logs in Unraid
- Verify all paths exist and have correct permissions (99:100)
- Ensure your chosen port isn't already in use

### Downloads failing
- Check cookie authentication is configured (see YouTube Cookie Authentication section)
- If using cookies.txt: verify file exists and is properly formatted
- If using Firefox: check Settings shows green "Firefox Profile" status
- Verify download path has write permissions
- Check logs at `/mnt/user/appdata/ytandchill/logs/app.log`

### Firefox cookie extraction not working
- Verify Firefox profile is mounted: `ls /mnt/user/appdata/firefox/.mozilla/firefox`
- Check container has access: In Unraid Docker, click ytandchill → Edit → verify Firefox Profile path
- Ensure YouTube is logged in your Firefox browser
- Check Settings page shows green "Firefox Profile" status
- Try restarting both Firefox and ytandchill containers
- Fallback: Use Method 1 (cookies.txt) instead

### Database errors
- Ensure `/mnt/user/appdata/ytandchill/data` has 99:100 ownership
- Check that `youtube_downloader.db` file is writable

---

## Network Configuration

### Using Bridge Network (Default)
The template uses the standard bridge network:
- Set Network Type to "Bridge"
- Access via: `http://YOUR-UNRAID-IP:YOUR-PORT`

### Using Custom Network (Optional)
If you have a custom Docker network:
- Set Network Type to "Custom: your_network_name"
- Access via: `http://YOUR-UNRAID-IP:YOUR-PORT`

---

## Support

For issues or questions, check the logs:
```bash
cat /mnt/user/appdata/ytandchill/logs/app.log
```

Or view Docker logs in Unraid Docker tab by clicking the container icon.
