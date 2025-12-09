# YT and Chill

YT channel downloader and video library manager. Monitor channels, queue downloads, and manage your local YT video library with a modern web interface.

Coded mainly via countless sessions with AI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Unraid-lightgrey.svg)

## Table of Contents
- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
  - [Windows](#windows)
  - [Linux / macOS](#linux--macos)
  - [Unraid](#unraid)
- [Basic Configuration](#basic-configuration)
- [Usage](#usage)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)
- [Building from Source](#building-from-source)
- [Additional Documentation](#additional-documentation)

## Features

- **Mobile & Tablet Touchscreen Support**: Full touch-optimized experience with gestures, fullscreen video player with YouTube-style controls, double-tap skip, and responsive layouts
- **Real-Time Progress Tracking**: Live download progress with speed, ETA, and percentage indicators
- **Scan Progress Indicators**: Real-time channel scanning progress with percentage completion
- **8 Custom Themes**: Choose from ash, chalk, rust, drift, bruise, ember, stain, and decay themes
- **Auto-Refresh Scheduler**: Set daily scan times to automatically check for new videos
- **Smart Duration Filters**: Set minimum and maximum video length preferences per channel
- **Channel Management**: Subscribe to YT channels and automatically track new uploads
- **Advanced Video Player**: Built-in player with automatic resume, playback speed controls, and picture-in-picture support
- **Smart Downloads**: Queue-based system with drag-and-drop reordering, pause/resume, and progress tracking
- **Playlist Support**: Create and organize custom playlists
- **Video Library**: Browse, search, and manage videos with flexible filtering and sorting
- **Cookie Authentication**: Support for cookies.txt file or direct Firefox browser integration
- **Session Persistence**: Remember login for 90 days (or 1 year with "Remember Me")
- **Sticky Status Bar**: Always-visible status bar with color-coded log messages
- **First-Run Setup Wizard**: Easy initial username and password configuration

## Screenshots

### Channels View
![Channels](images/Channels.png)

### Library View
![Library](images/library.png)

### Playlist View
![Playlist](images/playlist.png)

### Video Player
![Video Player](images/video.png)

## Quick Start

### Prerequisites

**All Platforms Need:**
- Python 3.11+ ([download](https://www.python.org/)) - check "Add Python to PATH" on Windows
- Node.js 18+ ([download](https://nodejs.org/))
- ffmpeg ([download](https://ffmpeg.org/)) - optional but recommended

**Platform-Specific Install:**
```bash
# Ubuntu/Debian
sudo apt install python3 python3-pip nodejs npm ffmpeg

# Fedora
sudo dnf install python3 python3-pip nodejs npm ffmpeg

# macOS (with Homebrew)
brew install python node ffmpeg
```

### Installation

**1. Get the code:**

Download ZIP from GitHub (green "Code" button) or clone:
```bash
git clone https://github.com/thenunner/ytandchill.git
cd ytandchill
```

**2. Run setup:**

### Windows
```cmd
setup-native-windows.bat
start-native-windows.bat
```

### Linux / macOS
```bash
chmod +x setup-native-linux.sh start-native-linux.sh
./setup-native-linux.sh
./start-native-linux.sh
```

**3. Access:** Open http://localhost:4099 and complete first-run setup

### Unraid

#### Option 1: Docker Template (Recommended)

1. Copy `ytandchill-template.xml` to `/boot/config/plugins/dockerMan/templates-user/`
2. Go to Docker tab → "Add Container" → select "ytandchill"
3. Configure paths and port as needed
4. Click "Apply"
5. Access at `http://YOUR-SERVER-IP:4099`

#### Option 2: Docker Compose

1. Copy project to `/mnt/user/appdata/ytandchill/`
2. Run: `docker-compose up -d`

See [UNRAID-SETUP.md](UNRAID-SETUP.md) for detailed instructions.

## Basic Configuration

### Directory Structure

Created automatically on first run:

```
ytandchill/
├── data/                    # Database and configuration
├── downloads/               # Downloaded videos and thumbnails
├── logs/                    # Application logs
└── backend/
    └── cookies.txt          # YouTube cookies (optional)
```

### Environment Variables

- `PORT`: Web interface port (default: 4099)
- `DATA_PATH`: Optional custom data directory location

## Usage

### Getting Started

1. **Add Channels**: Navigate to Channels page and add YT channel URLs
2. **Configure Settings**: Set up YouTube API key and cookie authentication (see Advanced Configuration)
3. **Queue Downloads**: Select videos to download from channel pages
4. **Watch Videos**: Access your library through the Library tab

### Settings Configuration

#### YouTube Data API Key

Required for channel scanning. See [Advanced Configuration](#advanced-configuration) for setup instructions.

#### Auto-Scan Daily

Enable automatic channel scanning at scheduled times:
- Set specific time (hour and minute) for daily scans
- Toggle ON/OFF to enable/disable
- Best practice: Schedule during off-peak hours (e.g., 03:00 AM)
- Free API tier (10,000 quota/day) supports ~100-300 channels daily

#### Cookie Source

Choose how yt-dlp authenticates with YouTube:

**cookies.txt** - Export cookies manually from browser using extension
**Firefox** - Automatically extract cookies from mounted Firefox profile (Docker only)

See [Advanced Configuration](#advanced-configuration) for setup instructions.

#### Reset User

Change your login credentials:
1. Go to Settings → Click "Reset User"
2. Enter current password
3. Enter new username (min 3 chars) and password (min 3 chars)
4. You'll be logged out and need to log in with new credentials

**Note:** No password recovery available - keep credentials safe!

#### Theme Selection

Choose from 8 color themes: ash (dark gray), chalk (light), rust (red), drift (blue), bruise (purple), ember (orange), stain (yellow), decay (green)

## Advanced Configuration

### YouTube API Setup (Required for Channel Scanning)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **YouTube Data API v3**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3" → Enable
4. Create credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key
5. In YT and Chill:
   - Go to Settings
   - Paste API key in "YouTube API Key" field
   - Click "Save"

**Note:** Free tier provides 10,000 quota units/day (sufficient for personal use)

### YouTube Cookies (Strongly Recommended)

**As of 2024, YouTube cookies are essential for reliable downloads.** YouTube's bot detection makes downloads fail without authentication. Choose one method:

#### Method 1: cookies.txt File (All Platforms)

**Setup:**
1. Install browser extension:
   - Chrome/Edge: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"
2. Go to youtube.com (logged in)
3. Click extension and export cookies for youtube.com
4. Save as `cookies.txt` in `/backend/` folder
5. Restart application/container
6. In Settings, select "Cookie Source: cookies.txt"

#### Method 2: Firefox Browser Integration (Docker/Unraid Only)

**Automatically extracts cookies from your Firefox browser - no manual export needed!**

**Setup:**

1. **Mount Firefox Profile** to your Docker container:

   **Unraid Template:**
   - Edit ytandchill container
   - Add new Path:
     - Container Path: `/firefox_profile`
     - Host Path: `/mnt/user/appdata/firefox/.mozilla/firefox`
     - Access Mode: Read Only
   - Apply and restart

   **Docker Compose:**
   ```yaml
   volumes:
     - /path/to/firefox/.mozilla/firefox:/firefox_profile:ro
   ```

   **Docker Run:**
   ```bash
   -v /path/to/firefox/.mozilla/firefox:/firefox_profile:ro
   ```

2. **Sign into YouTube** in your Firefox browser

3. **Configure YT and Chill:**
   - Go to Settings
   - Under "Cookie Source", select "Firefox"
   - Status will show:
     - Green "Firefox Profile" = Working ✓
     - Yellow "No YouTube Login" = Sign into YouTube in Firefox
     - Red "Not Mounted" = Check volume mount configuration

**Advantages:**
- No manual cookie exports
- Always up-to-date (reads directly from Firefox)
- Automatic fallback to cookies.txt if extraction fails

**Important for Both Methods:**
- Cookies must be in Netscape HTTP Cookie File format (extensions handle this)
- Cookies expire periodically - re-export or keep Firefox logged in
- Never share cookies.txt (contains authentication)
- **Use a disposable YouTube account**, NOT your personal account (see [FAQ.md](FAQ.md))
- **Without cookies:** bot detection errors, rate limiting, and failed downloads

For detailed troubleshooting, see [FAQ.md](FAQ.md).

## Troubleshooting

### Common Issues

**Application won't start:**
- Verify Python 3.11+: `python --version`
- Verify Node 18+: `node --version`
- Check ffmpeg: `ffmpeg -version`
- Review logs in `logs/app.log`

**Port already in use:**
- Change port in `backend/app.py` or set `PORT` environment variable

**Downloads failing:**
- Update yt-dlp: `pip install --upgrade yt-dlp`
- Verify internet connection
- Check cookies are configured (see Advanced Configuration)
- Review logs for specific errors

**Can't access age-restricted videos:**
- Ensure cookies are properly configured
- Re-export cookies if using cookies.txt method
- Verify YouTube is logged in if using Firefox method
- Restart application after cookie changes

### Docker/Unraid Specific

**Container won't start:**
- Check logs: `docker logs ytandchill`
- Verify volume paths exist with correct permissions (99:100)
- Ensure port 4099 is not in use

**Firefox cookies not working:**
- Verify Firefox profile is mounted at `/firefox_profile`
- Check Settings shows "Firefox Profile" status (green)
- Ensure YouTube is logged in your Firefox browser
- Try restarting both Firefox and ytandchill containers

**Force update:**
```bash
docker pull ghcr.io/thenunner/ytandchill:latest
```
Then restart from Unraid Docker tab

**For more help**, see [FAQ.md](FAQ.md) and [PLATFORM-GUIDE.md](PLATFORM-GUIDE.md).

## Building from Source

### Native (Windows/Linux/macOS)

Setup scripts handle everything. To manually rebuild:

**Frontend:**
```bash
cd frontend
npm install
npm run build
```

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```

### Docker (Unraid)

Pre-built images available:
```bash
docker pull ghcr.io/thenunner/ytandchill:latest
```

Or build locally:
```bash
docker-compose build
```

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Python + Flask
- **Downloader**: yt-dlp
- **Database**: SQLite
- **Video Processing**: ffmpeg

## Additional Documentation

- **[FAQ (Frequently Asked Questions)](FAQ.md)** - Common issues and troubleshooting
  - YouTube cookies and authentication
  - Common yt-dlp errors (geo-blocking, bot detection)
  - Download failures and performance issues
  - Account safety recommendations
  - Storage and backup questions
- **[Platform Guide](PLATFORM-GUIDE.md)** - Platform-specific instructions
  - Windows, Linux, macOS, and Unraid setup
  - Auto-start configuration
  - Platform-specific troubleshooting
- **[Unraid Setup Guide](UNRAID-SETUP.md)** - Detailed Unraid Docker instructions

## License

MIT License - feel free to use for personal projects

## Credits

- Built with [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Icons from [Dashboard Icons](https://github.com/walkxcode/dashboard-icons)

## Support

For issues and feature requests, please open an issue on GitHub.
