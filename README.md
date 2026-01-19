# YT and Chill

YT channel downloader and video library manager. Monitor channels, queue downloads, and manage your local video library. Built with [Claude AI](https://claude.ai) through months of collaborative prompting.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Unraid-lightgrey.svg)

## Features

- **Channel Management** - Subscribe to channels, organize with categories, set per-channel duration filters and auto-download
- **Smart Queue** - Drag-and-drop reordering, pause/resume, real-time progress with speed and ETA
- **Video Library** - Search, filter, sort by download/upload date, bulk actions, watched status with resume playback
- **Smart Import** - Drag-and-drop upload, auto-matching by filename or video ID, results view with Text/CSV export
- **Playlists** - Create custom playlists, organize with categories, shuffle play
- **Video Player** - Playback speed controls, picture-in-picture, keyboard shortcuts, video preview on hover
- **Settings** - Collapsible sections, tooltips, ffmpeg configuration, auto-update system
- **Auto-Scan Scheduler** - Set daily scan times to check for new uploads
- **Toast Notifications** - Non-blocking status updates throughout the app
- **10 Themes** - Kernel, Fatal, Subnet, Archive, Buffer, Gateway, Catppuccin, Online, Pixel, Debug
- **Mobile Support** - Touch-optimized interface with gesture controls
- **Cookie Auth** - cookies.txt or Firefox browser integration for authenticated downloads

## Screenshots

| Channels | Ignored Videos |
|:---:|:---:|
| ![Channels](images/Channels.png) | ![Ignored](images/ignored.png) |

| Library | Playlist |
|:---:|:---:|
| ![Library](images/library.png) | ![Playlist](images/playlist.png) |

| Video Player | Import |
|:---:|:---:|
| ![Video Player](images/video.png) | ![Import](images/import.png) |

| Settings | |
|:---:|:---:|
| ![Settings](images/settings.png) | |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- ffmpeg (recommended)

### Installation

```bash
git clone https://github.com/thenunner/ytandchill.git
cd ytandchill
```

**Windows:**
```cmd
windows-start.bat
```
Select option 3 (Setup) on first run, then option 1 (Start) to launch.

**Linux / macOS:**
```bash
chmod +x linux-start.sh
./linux-start.sh
```
Select option 3 (Setup) on first run, then option 1 (Start) to launch.

**Unraid/Docker:**
See [UNRAID-SETUP.md](UNRAID-SETUP.md)

Access at http://localhost:4099

## Configuration

### YouTube Cookies (Recommended)

Required for reliable downloads due to YouTube's bot detection.

**Option 1: cookies.txt**
1. Install browser extension ("Get cookies.txt LOCALLY" for Chrome, "cookies.txt" for Firefox)
2. Export cookies from youtube.com while logged in
3. Save as `backend/cookies.txt`
4. Select "cookies.txt" in Settings → Cookie Source

**Option 2: Firefox Integration (Docker only)**

Mount your Firefox profile directory to automatically extract cookies:

1. Find your Firefox profile path:
   - **Linux:** `~/.mozilla/firefox`
   - **macOS:** `~/Library/Application Support/Firefox/Profiles`

2. Add volume mount to docker-compose.yml:
   ```yaml
   volumes:
     # ... other volumes ...
     - /home/YOUR_USERNAME/.mozilla/firefox:/firefox_profile:ro
   ```

3. Rebuild container: `docker-compose up -d --build`
4. Select "Firefox" in Settings → Cookie Source

## Importing Existing Videos

Have existing YouTube videos? Import them into your library:

**Option 1: Drag and Drop**
1. Go to Import page in the app
2. Drag video files directly onto the page (supports files up to 50GB)
3. Files upload to the imports folder automatically
4. Click "Smart Import" to identify and add to library

**Option 2: Direct Folder Access**
1. Place video files in `downloads/imports/`
2. Go to Import page in the app
3. Click "Smart Import" (Auto or Manual mode)

**Supported Formats:**
- **Web-ready:** `.mp4`, `.webm`, `.m4v` - import directly
- **Requires re-encoding:** `.mkv` - select "Include MKVs" option on the Import page

**Tips:**
- Add a `channels.txt` file with channel URLs to improve matching accuracy
- Supported channel file formats: `channels.txt`, `channels.csv`, `channels.list`, `urls.txt`, `urls.csv` (one URL per line)

Videos are identified automatically by:
- **Filename = Video ID** (e.g., `dQw4w9WgXcQ.mp4`) → instant match
- **Filename = Title** (e.g., `My Video Title.mp4`) → YouTube search + duration match

**Import Results**: View matched, skipped, and failed imports with video IDs and similarity scores. Export results as Text or CSV.

## Directory Structure

```
ytandchill/
├── data/           # Database
├── downloads/      # Videos and thumbnails
│   └── imports/    # Drop files here for import
├── logs/           # Application logs
└── backend/
    └── cookies.txt # YouTube cookies (optional)
```

## Troubleshooting

- **Downloads failing**: Update yt-dlp (`pip install --upgrade yt-dlp`), check cookies
- **Port in use**: Set `PORT` environment variable
- **Docker issues**: Check logs with `docker logs ytandchill`

See [FAQ.md](FAQ.md) for more help.

## Documentation

| File | Description |
|------|-------------|
| [README.md](README.md) | This file - quick start and overview |
| [FAQ.md](FAQ.md) | Frequently asked questions and troubleshooting |
| [PLATFORM-GUIDE.md](PLATFORM-GUIDE.md) | Detailed platform-specific setup (Windows, Linux, macOS) |
| [UNRAID-SETUP.md](UNRAID-SETUP.md) | Unraid/Docker installation guide |

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Python + Flask + SQLite
- **Downloader**: yt-dlp + ffmpeg

## License

MIT License

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Dashboard Icons](https://github.com/walkxcode/dashboard-icons)
- [Flask](https://github.com/pallets/flask)
- [React](https://github.com/facebook/react)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)
- [Video.js](https://github.com/videojs/video.js)
- [Vite](https://github.com/vitejs/vite)
