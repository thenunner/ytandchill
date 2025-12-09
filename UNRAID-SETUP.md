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
   | `/app/backend/cookies.txt` | `/mnt/user/appdata/ytandchill/cookies.txt` | Read/Write (Optional) |
   | `/firefox_profile` | `/mnt/user/appdata/firefox/.mozilla/firefox` | Read Only (Optional) |

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

## YouTube Cookie Authentication (Strongly Recommended)

**As of 2024, YouTube cookies are essential for reliable downloads.** Choose one method:

### Method 1: cookies.txt File

**Setup:**
1. Install browser extension:
   - Chrome/Edge: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"
2. Go to youtube.com (logged in)
3. Click extension and export cookies for youtube.com
4. Save as `/mnt/user/appdata/ytandchill/cookies.txt`
5. Restart container
6. In YT and Chill Settings, select "Cookie Source: cookies.txt"

**Template Configuration:**
- Already configured in template at `/app/backend/cookies.txt`
- Maps to `/mnt/user/appdata/ytandchill/cookies.txt` on host

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
http://YOUR-UNRAID-IP:4099
```

---

## Troubleshooting

### Container won't start
- Check Docker logs in Unraid
- Verify all paths exist and have correct permissions (99:100)
- Ensure port 4099 isn't already in use

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
