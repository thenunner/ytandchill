# YT and Chill

YouTube channel downloader and video library manager. Monitor channels, queue downloads, and manage your local YouTube video library with a modern web interface.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Unraid-lightgrey.svg)

## Features

- **Channel Management**: Subscribe to YouTube channels and automatically track new uploads
- **Playlist Support**: Download and organize entire playlists
- **Smart Downloads**: Queue-based download system with progress tracking
- **Modern Web UI**: Clean, responsive interface built with React
- **Video Library**: Browse, search, and manage your downloaded videos
- **Thumbnail Support**: Automatic thumbnail downloads for easy browsing
- **Age-Restricted Content**: Optional cookie support for age-restricted videos

## Platform Support

YT and Chill works on:
- **Windows** (Native Python - no Docker required)
- **Linux / macOS** (Native Python - no Docker required)
- **Unraid** (Docker template or docker-compose)

## Quick Start

### Windows

**Prerequisites:**
- [Python 3.11+](https://www.python.org/) (check "Add Python to PATH" during install)
- [Node.js 18+](https://nodejs.org/)
- [ffmpeg](https://ffmpeg.org/) (optional but recommended)

**Installation:**

1. Download or clone this repository
2. Open Command Prompt or PowerShell
3. Run the setup script:
   ```cmd
   setup-native-windows.bat
   ```
4. Start the application:
   ```cmd
   start-native-windows.bat
   ```
5. Open http://localhost:4099 in your browser

### Linux / macOS

**Prerequisites:**

```bash
# Ubuntu/Debian
sudo apt install python3 python3-pip nodejs npm ffmpeg

# Fedora
sudo dnf install python3 python3-pip nodejs npm ffmpeg

# macOS (with Homebrew)
brew install python node ffmpeg
```

**Installation:**

1. Clone this repository
2. Run the setup script:
   ```bash
   chmod +x setup-native-linux.sh
   ./setup-native-linux.sh
   ```
3. Start the application:
   ```bash
   ./start-native-linux.sh
   ```
4. Open http://localhost:4099 in your browser

### Unraid

#### Option 1: Using Docker Template (Recommended)

1. Copy `ytandchill-template.xml` to `/boot/config/plugins/dockerMan/templates-user/`
2. Go to Docker tab in Unraid WebUI
3. Click "Add Container" and select "ytandchill"
4. Configure paths and port as needed
5. Click "Apply"

#### Option 2: Using Docker Compose

1. Copy the project to `/mnt/user/appdata/ytandchill/`
2. Run docker-compose:
   ```bash
   docker-compose up -d
   ```

See [UNRAID-SETUP.md](UNRAID-SETUP.md) for detailed Unraid installation instructions.

## Configuration

### Directory Structure

```
ytandchill/
├── data/              # Database and configuration
├── downloads/         # Downloaded videos and thumbnails
├── logs/              # Application logs
└── cookies.txt        # YouTube cookies (optional)
```

### Environment Variables

- `PORT`: Web interface port (default: 4099)

### YouTube API Setup (Required)

YT and Chill requires a YouTube Data API v3 key to scan channels and fetch video information:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **YouTube Data API v3**:
   - Go to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key
5. In YT and Chill web interface:
   - Navigate to **Settings**
   - Paste your API key in the "YouTube API Key" field
   - Click "Save"

**Note**: The free tier provides 10,000 quota units per day, which is sufficient for personal use (scanning ~100-300 channels daily).

### Cookies for Age-Restricted Content (Optional)

To download age-restricted videos, you need to provide YouTube authentication cookies:

**Method 1: Browser Extension (Recommended)**
1. Install a cookie export extension:
   - Chrome/Edge: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"
2. Go to youtube.com and ensure you're logged in
3. Click the extension icon and export cookies for youtube.com
4. Save the exported file as `cookies.txt` in the project directory
5. Restart the container

**Method 2: Manual Export**
1. Open browser DevTools (F12)
2. Go to youtube.com (logged in)
3. Navigate to Application → Cookies → youtube.com
4. Export cookies in Netscape format
5. Save as `cookies.txt`

**Important**:
- The cookies.txt file must be in Netscape HTTP Cookie File format
- Cookies expire periodically - if downloads fail, re-export your cookies
- Never share your cookies.txt file (it contains your authentication)

## Usage

1. **Add Channels**: Navigate to the Channels page and add YouTube channel URLs
2. **Browse Library**: View all tracked channels and playlists
3. **Queue Downloads**: Select videos to download from channel pages
4. **Watch Videos**: Access your downloaded library through the Library tab

## Building from Source

### For Windows/Linux/macOS (Native)

The setup scripts handle everything automatically. To manually rebuild:

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

### For Unraid (Docker)

Pre-built images are available from GitHub Container Registry:
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

## File Organization

### Setup Scripts
- `setup-native-windows.bat` - Windows setup
- `setup-native-linux.sh` - Linux/Mac setup
- `start-native-windows.bat` - Start on Windows
- `start-native-linux.sh` - Start on Linux/Mac

### Unraid Docker Files
- `docker-compose.yml` - Unraid docker-compose configuration
- `ytandchill-template.xml` - Unraid Docker template
- `build-for-unraid.sh` - Build script for Unraid

### Documentation
- `README.md` - This file (quick start guide)
- `PLATFORM-GUIDE.md` - Detailed platform-specific instructions
- `UNRAID-SETUP.md` - Detailed Unraid Docker instructions

## Troubleshooting

### Windows/Linux/macOS (Native)

**Application won't start:**
- Check Python version: `python --version` (need 3.11+)
- Check Node version: `node --version` (need 18+)
- Ensure ffmpeg is installed: `ffmpeg -version`
- Check logs in `logs/app.log`

**Port already in use:**
- Another service is using port 4099
- Change port in `backend/app.py` (line with `port = int(os.environ.get('PORT', 4099))`)

**Downloads failing:**
- Update yt-dlp: `pip install --upgrade yt-dlp`
- Check internet connection
- Check logs for specific errors

**Can't access age-restricted videos:**
- Ensure cookies.txt is properly formatted (Netscape format)
- Re-export cookies if they've expired
- Restart application after adding cookies

### Unraid (Docker)

**Container won't start:**
- Check logs: `docker logs ytandchill`
- Verify volume paths exist and have correct permissions (99:100)
- Ensure port 4099 is not in use

**Force update not working:**
- Manually pull: `docker pull ghcr.io/thenunner/ytandchill:latest`
- Restart container from Unraid Docker tab

## License

MIT License - feel free to use for personal projects

## Credits

- Built with [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Icons from [Dashboard Icons](https://github.com/walkxcode/dashboard-icons)

## Support

For issues and feature requests, please open an issue on GitHub.
