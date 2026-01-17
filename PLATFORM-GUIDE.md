# YT and Chill - Platform-Specific Guide

This guide provides detailed platform-specific instructions for running YT and Chill.

## Table of Contents
- [Windows Setup](#windows-setup)
- [Linux Setup](#linux-setup)
- [macOS Setup](#macos-setup)
- [Unraid Setup (Docker)](#unraid-setup-docker)
- [Common Tasks](#common-tasks)

---

## Windows Setup

### Prerequisites

1. **Python 3.11+**
   - Download from [python.org](https://www.python.org/downloads/)
   - **Important**: During installation, check "Add Python to PATH"
   - Verify: `python --version`

2. **Node.js 18+**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

3. **ffmpeg** (Optional but recommended)
   - Download Windows build from [ffmpeg.org](https://ffmpeg.org/download.html)
   - Extract to `C:\ffmpeg`
   - Add `C:\ffmpeg\bin` to system PATH
   - Verify: `ffmpeg -version`

### Installation

1. Download or clone the repository to your desired location (e.g., `C:\ytandchill`)

2. Open Command Prompt or PowerShell

3. Navigate to the project directory:
   ```cmd
   cd C:\ytandchill
   ```

4. Run the setup script:
   ```cmd
   setup-native-windows.bat
   ```

   This will:
   - Check for Python, Node.js, and ffmpeg
   - Create required directories (data, downloads, logs)
   - Install Python dependencies
   - Install Node.js dependencies
   - Build the frontend
   - Create empty cookies.txt

5. Start the application:
   ```cmd
   start-native-windows.bat
   ```

6. Open your browser to: http://localhost:4099

### Windows-Specific Notes

- **Running in Background**: The app runs in a console window - close the window to stop
- **Auto-start on Boot**: Use Task Scheduler to run `start-native-windows.bat` at startup
- **Updating**: Re-run `setup-native-windows.bat` after pulling new code
- **Data Location**:
  - Database: `C:\ytandchill\data\`
  - Downloads: `C:\ytandchill\downloads\`
  - Logs: `C:\ytandchill\logs\`

### Troubleshooting Windows

**"Python is not recognized":**
- Reinstall Python with "Add to PATH" checked
- Or manually add Python to PATH in System Environment Variables

**"Node is not recognized":**
- Reinstall Node.js
- Restart Command Prompt after installation

**"ffmpeg is not recognized":**
- Add `C:\ffmpeg\bin` to PATH
- Or continue without ffmpeg (some features may not work)

**Port 4099 already in use:**
- Edit `backend\app.py`
- Change line: `port = int(os.environ.get('PORT', 4099))`
- Replace `4099` with your desired port

**Permission errors:**
- Run Command Prompt as Administrator
- Check antivirus isn't blocking Python

---

## Linux Setup

### Prerequisites

Install Python, Node.js, npm, and ffmpeg:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3 python3-pip nodejs npm ffmpeg
```

**Fedora:**
```bash
sudo dnf install python3 python3-pip nodejs npm ffmpeg
```

**Arch Linux:**
```bash
sudo pacman -S python python-pip nodejs npm ffmpeg
```

Verify installations:
```bash
python3 --version
node --version
ffmpeg -version
```

### Installation

1. Clone or download the repository:
   ```bash
   cd ~
   git clone https://github.com/thenunner/ytandchill.git
   cd ytandchill
   ```

2. Run the setup script:
   ```bash
   chmod +x setup-native-linux.sh
   ./setup-native-linux.sh
   ```

   This will:
   - Check for Python, Node.js, and ffmpeg
   - Create required directories
   - Install Python dependencies
   - Install Node.js dependencies
   - Build the frontend
   - Set proper permissions

3. Start the application:
   ```bash
   ./start-native-linux.sh
   ```

4. Open your browser to: http://localhost:4099

### Linux-Specific Notes

- **Running in Background**:
  ```bash
  nohup ./start-native-linux.sh > /dev/null 2>&1 &
  ```

- **Auto-start on Boot**: Create a systemd service (see below)

- **Data Location**:
  - Database: `~/ytandchill/data/`
  - Downloads: `~/ytandchill/downloads/`
  - Logs: `~/ytandchill/logs/`

### Creating a Systemd Service (Auto-start)

1. Create service file:
   ```bash
   sudo nano /etc/systemd/system/ytandchill.service
   ```

2. Add the following (replace `youruser` and paths):
   ```ini
   [Unit]
   Description=YT and Chill
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/home/youruser/ytandchill/backend
   ExecStart=/usr/bin/python3 /home/youruser/ytandchill/backend/app.py
   Restart=on-failure
   User=youruser

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start:
   ```bash
   sudo systemctl enable ytandchill
   sudo systemctl start ytandchill
   sudo systemctl status ytandchill
   ```

### Troubleshooting Linux

**Dependencies missing:**
- Check versions: `python3 --version`, `node --version`, `ffmpeg -version`
- Reinstall missing packages with your package manager

**Permission errors:**
```bash
chmod -R 755 data downloads logs
```

**Port 4099 in use:**
```bash
# Check what's using the port
sudo lsof -i :4099

# Edit backend/app.py to change port
nano backend/app.py
# Change: port = int(os.environ.get('PORT', 4099))
```

**Can't execute scripts:**
```bash
chmod +x setup-native-linux.sh start-native-linux.sh
```

---

## macOS Setup

### Prerequisites

1. **Homebrew** (if not installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install dependencies:**
   ```bash
   brew install python node ffmpeg
   ```

Verify installations:
```bash
python3 --version
node --version
ffmpeg -version
```

### Installation

1. Clone or download the repository:
   ```bash
   cd ~/Documents
   git clone https://github.com/thenunner/ytandchill.git
   cd ytandchill
   ```

2. Run the setup script:
   ```bash
   chmod +x setup-native-linux.sh
   ./setup-native-linux.sh
   ```

3. Start the application:
   ```bash
   ./start-native-linux.sh
   ```

4. Open your browser to: http://localhost:4099

### macOS-Specific Notes

- **Running in Background**:
  ```bash
  nohup ./start-native-linux.sh > /dev/null 2>&1 &
  ```

- **Auto-start**: Create a LaunchAgent (see below)

- **Data Location**:
  - Database: `~/Documents/ytandchill/data/`
  - Downloads: `~/Documents/ytandchill/downloads/`
  - Logs: `~/Documents/ytandchill/logs/`

### Creating a LaunchAgent (Auto-start)

1. Create plist file:
   ```bash
   nano ~/Library/LaunchAgents/com.ytandchill.plist
   ```

2. Add (replace `YourUsername`):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.ytandchill</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/local/bin/python3</string>
           <string>/Users/YourUsername/Documents/ytandchill/backend/app.py</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/Users/YourUsername/Documents/ytandchill/backend</string>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
   </dict>
   </plist>
   ```

3. Load the service:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.ytandchill.plist
   ```

### Troubleshooting macOS

**Homebrew not found:**
- Install Homebrew first (see Prerequisites)

**Permission denied on scripts:**
```bash
chmod +x setup-native-linux.sh start-native-linux.sh
```

**Python/Node not found:**
- Ensure Homebrew installations completed: `brew list`
- Restart Terminal after installation

---

## Unraid Setup (Docker)

YT and Chill uses Docker on Unraid for easy management and updates.

### Method 1: Docker Template (Recommended)

1. Download `ytandchill-template.xml` from the repository

2. Copy to Unraid templates directory:
   ```bash
   cp ytandchill-template.xml /boot/config/plugins/dockerMan/templates-user/
   ```

3. In Unraid WebUI:
   - Go to **Docker** tab
   - Click **Add Container**
   - Select **ytandchill** from template dropdown

4. Configure paths:
   - **WebUI Port**: `4099` (or your preference)
   - **Database Path**: `/mnt/user/appdata/ytandchill/data`
   - **Downloads Path**: `/mnt/user/data/media/youtube/ytandchill`
   - **Logs Path**: `/mnt/user/appdata/ytandchill/logs`
   - **Cookies Path**: `/mnt/user/appdata/ytandchill/cookies.txt`
   - **Network**: `bridge` (or your custom network)

5. Click **Apply**

6. Access at: http://YOUR-SERVER-IP:4099

### Method 2: Docker Compose

1. Copy project to Unraid:
   ```bash
   mkdir -p /mnt/user/appdata/ytandchill
   cd /mnt/user/appdata/ytandchill
   # Copy files here
   ```

2. Create required directories:
   ```bash
   mkdir -p data downloads logs
   chown -R 99:100 data downloads logs
   ```

3. Start with docker-compose:
   ```bash
   docker-compose up -d
   ```

### Unraid-Specific Notes

- **User Permissions**: Container runs as `nobody:users` (99:100)
- **Network**: Uses bridge network (default: "bridge")
- **Updates**: Use "Force Update" in Docker tab to pull latest from GitHub
- **WebUI Integration**: Template includes WebUI link in Docker tab
- **Auto-start**: Configured to restart unless stopped

### Updating on Unraid

**From GitHub Container Registry (Automatic Builds):**
1. Push changes to GitHub main branch
2. GitHub Actions builds new image automatically
3. In Unraid Docker tab, click **Force Update** on ytandchill container
4. Container downloads new image and restarts

**Manual Pull:**
```bash
docker pull ghcr.io/thenunner/ytandchill:latest
docker restart ytandchill
```

**From Local Build:**
```bash
cd /mnt/user/appdata/ytandchill
docker-compose down
docker-compose build
docker-compose up -d
```

### Troubleshooting Unraid

**Container won't start:**
- Check logs: `docker logs ytandchill`
- Verify paths exist and have proper permissions (99:100)
- Ensure port 4099 is not in use: `netstat -tulpn | grep 4099`

**Permission errors:**
```bash
chown -R 99:100 /mnt/user/appdata/ytandchill/data
chown -R 99:100 /mnt/user/appdata/ytandchill/logs
chown -R 99:100 /mnt/user/data/media/youtube/ytandchill
```

**Can't access WebUI:**
- Check container is running: `docker ps`
- Verify network settings in template
- Test port: `curl http://localhost:4099`

**Force Update not pulling new image:**
- Manually pull: `docker pull ghcr.io/thenunner/ytandchill:latest`
- Check GitHub Actions completed successfully
- Clear Docker image cache

See [UNRAID-SETUP.md](UNRAID-SETUP.md) for detailed Unraid instructions.

---

## Common Tasks

### Viewing Logs

**Windows:**
- Check `C:\ytandchill\logs\app.log`
- Or watch in Command Prompt (app logs to console)

**Linux/macOS:**
- Check `logs/app.log`
- Or: `tail -f logs/app.log`

**Unraid:**
```bash
docker logs -f ytandchill
```
Or check: `/mnt/user/appdata/ytandchill/logs/app.log`

### Stopping the Application

**Windows:**
- Close the Command Prompt window running the app
- Or press `Ctrl+C` in the window

**Linux/macOS:**
- Press `Ctrl+C` in the terminal
- Or kill the process: `pkill -f "python.*app.py"`
- If using systemd: `sudo systemctl stop ytandchill`

**Unraid:**
```bash
docker stop ytandchill
```
Or use Unraid Docker tab → Stop button

### Restarting the Application

**Windows:**
```cmd
# Close the running window, then:
start-native-windows.bat
```

**Linux/macOS:**
```bash
# Press Ctrl+C to stop, then:
./start-native-linux.sh

# Or with systemd:
sudo systemctl restart ytandchill
```

**Unraid:**
```bash
docker restart ytandchill
```

### Updating to Latest Version

**Windows/Linux/macOS:**
```bash
# Pull latest code
git pull

# Re-run setup to rebuild
setup-native-windows.bat  # Windows
./setup-native-linux.sh    # Linux/macOS

# Restart the application
```

**Unraid:**
- Push to GitHub → GitHub Actions builds automatically
- In Unraid Docker tab → Force Update

### Changing the Port

**Windows/Linux/macOS:**

Edit `backend/app.py`:
```python
# Change this line:
port = int(os.environ.get('PORT', 4099))

# To your desired port:
port = int(os.environ.get('PORT', 8080))
```

Restart the application.

**Unraid:**

Edit the template or docker-compose:
```yaml
ports:
  - "8080:4099"  # External:Internal
```

Recreate the container.

### Backing Up Data

**Critical files to backup:**

**Windows:**
- Database: `C:\ytandchill\data\youtube_downloader.db`
- Downloads: `C:\ytandchill\downloads\`
- Cookies: `C:\ytandchill\cookies.txt`

**Linux/macOS:**
- Database: `~/ytandchill/data/youtube_downloader.db`
- Downloads: `~/ytandchill/downloads/`
- Cookies: `~/ytandchill/cookies.txt`

**Unraid:**
- Database: `/mnt/user/appdata/ytandchill/data/youtube_downloader.db`
- Downloads: `/mnt/user/data/media/youtube/ytandchill/`
- Cookies: `/mnt/user/appdata/ytandchill/cookies.txt`

### Migrating Between Platforms

1. Stop the application on the old platform
2. Copy the `data/` directory to the new location
3. Copy the `downloads/` directory to the new location
4. Copy `cookies.txt` if using age-restricted downloads
5. Install and start on the new platform

---

## Platform Comparison

| Feature | Windows | Linux | macOS | Unraid |
|---------|---------|-------|-------|--------|
| Installation | Native Python | Native Python | Native Python | Docker |
| Setup Difficulty | Easy | Easy | Easy | Easy |
| Performance | Good | Excellent | Good | Excellent |
| Auto-start | Task Scheduler | Systemd | LaunchAgent | Built-in |
| Resource Usage | Low | Low | Low | Low |
| Updates | Manual (git pull) | Manual (git pull) | Manual (git pull) | Auto (Force Update) |
| Best For | Desktop use | Servers/Desktop | Desktop use | Home servers |

---

## Getting Help

- **Check logs first**: Most issues show up in `logs/app.log`
- **Common issues**: See Troubleshooting sections above
- **GitHub Issues**: https://github.com/thenunner/ytandchill/issues
- **Unraid specifics**: See [UNRAID-SETUP.md](UNRAID-SETUP.md)
