# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YT and Chill is a YouTube channel downloader and video library manager with a Flask backend and React frontend. It monitors channels, queues downloads using yt-dlp, and manages a local video library with a modern web interface.

## Technology Stack

- **Backend**: Python 3.11+ with Flask, SQLAlchemy, yt-dlp, YouTube Data API v3
- **Frontend**: React with Vite, Tailwind CSS, React Router
- **Database**: SQLite
- **Video Processing**: ffmpeg
- **Deployment**: Native (Windows/Linux/macOS) or Docker (Unraid)

## Development Commands

### Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend runs on port 4099 by default (configurable via `PORT` environment variable).

### Frontend

```bash
cd frontend
npm install
npm run dev        # Development server with hot reload
npm run build      # Production build (outputs to dist/)
```

### Docker

```bash
docker-compose up -d                              # Start container
docker-compose build                              # Rebuild image
docker pull ghcr.io/thenunner/ytandchill:latest  # Pull latest pre-built image
```

## Architecture

### Backend Structure (`/backend`)

- **app.py** (2300+ lines): Main Flask application with all API endpoints
  - YouTube Data API integration for channel scanning
  - Session-based authentication with werkzeug password hashing
  - Download queue management
  - Rate limiting via flask-limiter
  - CORS handling for development and production
  - Single instance enforcement using file locking

- **models.py**: SQLAlchemy ORM models
  - `Channel`: YouTube channel metadata with duration filters and auto-download
  - `Video`: Video metadata with status tracking (discovered, queued, downloading, library, ignored, geoblocked)
  - `Playlist`: User-created playlists (optional category assignment)
  - `Category`: Playlist organization folders
  - `QueueItem`: Download queue with position tracking
  - `PlaylistVideo`: Many-to-many relationship between playlists and videos
  - `Setting`: Key-value configuration store

- **download_worker.py**: Background download thread using yt-dlp
  - Manages queue processing with pause/resume/cancel
  - Exponential backoff for rate limiting (30s → 60s → 90s → 180s)
  - Progress tracking via yt-dlp hooks
  - Automatic thumbnail extraction
  - Timeout handling (30min no-progress timeout, 4hr hard timeout)
  - Geoblocking detection with automatic status updates

- **scheduler.py**: Auto-refresh scheduler for daily channel scans
  - Cron-style scheduling with configurable time
  - Scans all channels sequentially
  - Respects channel duration filters and auto-download settings
  - Auto-resumes download worker if videos are queued

- **logging_config.py**: Centralized logging setup
  - Custom log levels: DEBUG, INFO, WARNING, ERROR, API
  - Rotating file handler (10MB max, 3 backups)
  - Configurable log level via Settings UI

- **utils.py**: Utility functions (ISO 8601 duration parsing, etc.)

### Frontend Structure (`/frontend/src`)

- **App.jsx**: Root component with theme context, routing, and protected routes
- **routes/**: Page components
  - `Channels.jsx`: Channel management with add/edit/scan functionality
  - `ChannelLibrary.jsx`: Individual channel view with video filters
  - `Library.jsx`: Global video library with advanced filtering
  - `Playlist.jsx`: Playlist viewer and management
  - `Queue.jsx`: Download queue with drag-and-drop reordering
  - `Player.jsx`: Video player with playback resume and speed controls
  - `Settings.jsx`: Configuration (auto-scan, cookies, themes, auth, SponsorBlock)
  - `Login.jsx`: Authentication login page
  - `Setup.jsx`: First-run setup wizard

- **components/**: Reusable UI components (not many, most UI is in routes)
- **contexts/**: React contexts (theme management, etc.)
- **api/**: API client functions for backend communication

### Database Schema

Videos have a status field that tracks their lifecycle:
- `discovered`: New video found during channel scan
- `ignored`: Filtered out by duration limits or manually ignored
- `geoblocked`: Cannot be downloaded due to geographic restrictions
- `queued`: Added to download queue
- `downloading`: Currently being downloaded
- `library`: Successfully downloaded and available

## Key Workflows

### Channel Scanning

1. User adds channel via URL (handle, /channel/, or /c/ formats)
2. Backend resolves channel ID via YouTube Data API
3. Fetches channel metadata (title, thumbnail)
4. Downloads channel thumbnail to `downloads/thumbnails/`
5. Scans upload playlist for videos using Data API
6. Filters videos by duration (min/max minutes per channel)
7. Creates Video records with appropriate status (discovered/ignored)
8. Updates `channel.last_scan_at` to latest video upload date
9. Updates `channel.last_scan_time` to current time

### Video Download

1. User queues video (or auto-queued via channel scan with `auto_download=true`)
2. Video status changes from `discovered` → `queued`
3. QueueItem created with position
4. DownloadWorker picks up next queued video
5. Status changes to `downloading`
6. yt-dlp downloads video with progress hooks
7. On success: status → `library`, downloaded_at timestamp set
8. On failure: exponential backoff delay, retries with increasing delays
9. Queue position compacted when items are removed

### Auto-Refresh Scheduler

- Configured in Settings with daily time (HH:MM format)
- When enabled, scans ALL channels at specified time
- For each channel:
  - Incremental scan (50 videos if auto-scan on, 250 if manual)
  - Applies duration filters
  - Auto-queues if `channel.auto_download=true`
- Auto-resumes download worker if videos queued

## Important Implementation Details

### Channel Scanning (yt-dlp)

- Uses yt-dlp's `--flat-playlist --dump-json` for fast metadata extraction
- **No API key required** - no quota limits on channel scanning
- Channel resolution supports @handles, /channel/UC..., /c/, /user/ URLs
- Duration filtering uses seconds (converted from yt-dlp output)
- Incremental scans stop when existing videos are found

### Cookie Authentication

- **Strongly Recommended**: YouTube cookies required for reliable downloads
- Cookie file: `cookies.txt` in Netscape format
- Passed to yt-dlp via `--cookies` flag
- Without cookies: high risk of bot detection and download failures

### Rate Limiting

- Download worker implements exponential backoff (30s, 60s, 90s, 180s cap)
- Rate limit message persists in UI until successful download
- Delays tracked in `download_worker.delay_info`

### Session Management

- Flask sessions with SECRET_KEY stored in database (persistent across restarts)
- Session cookie: HttpOnly, SameSite=Lax, 24hr lifetime
- Authentication required for all `/api/*` endpoints (except `/api/auth/*`)

### Single Instance Protection

- Uses file locking (`app.lock`) to prevent multiple backend instances
- Atomic locking via msvcrt (Windows) or fcntl (Linux/macOS)
- Lock released on clean shutdown via atexit handler

### Startup Recovery

- On startup, resets stuck `downloading` videos → `queued`
- Compacts queue positions to sequential order [1, 2, 3, ...]

### Theme System

- 8 custom themes: ash, chalk, rust, drift, bruise, ember, stain, decay
- Theme stored in Settings, applied via CSS custom properties

## Testing

No formal test suite exists. Manual testing via:
- Channel scanning with various URL formats
- Download queue operations (add, remove, reorder)
- Video playback with resume functionality
- Settings changes (auto-scan, cookies, themes)

## Common Development Tasks

### Adding a New Video Status

1. Add status to Video model `status` field comment in `models.py`
2. Update status filtering in `get_videos()` endpoint in `app.py`
3. Update frontend status badges in `Library.jsx`, `ChannelLibrary.jsx`
4. Add status-specific handling in `download_worker.py` if needed

### Adding a New Setting

1. Add default value in `init_settings()` in `app.py`
2. Add UI control in `Settings.jsx`
3. Handle setting change in `update_settings()` endpoint
4. Use setting value in relevant backend code via `session.query(Setting).filter(Setting.key == 'your_key').first()`

### Modifying yt-dlp Options

Edit `ydl_opts` dictionary in `download_worker.py`:
- Format selection: `format` key
- Output template: `outtmpl` key
- Progress hooks: `progress_hooks` list
- Cookies: `cookiefile` key

### Debugging Download Issues

1. Check logs at `logs/app.log` (or via Settings → Logs tab)
2. Verify cookies.txt exists and is valid
3. Check yt-dlp version: `yt-dlp --version`
4. Test download manually: `yt-dlp --cookies cookies.txt [VIDEO_URL]`
5. Enable DEBUG logging in Settings

## File Paths

- **Database**: `data/youtube_downloader.db`
- **Downloads**: `downloads/[channel_folder]/[video_files]`
- **Thumbnails**: `downloads/thumbnails/[channel_id].jpg`
- **Logs**: `logs/app.log`
- **Cookies**: `cookies.txt` (project root)

## Security Notes

- Path traversal protection in `/api/media/<path>` endpoint via `safe_join()`
- Rate limiting on destructive endpoints (DELETE) via flask-limiter
- Password hashing with werkzeug (pbkdf2:sha256)
- Session cookies are HttpOnly (not accessible via JavaScript)
- CORS configured for development (allows credentials from any origin)

## Platform-Specific Notes

### Windows
- Uses msvcrt for file locking
- Setup script: `setup-native-windows.bat`
- Start script: `start-native-windows.bat`

### Linux/macOS
- Uses fcntl for file locking
- Setup script: `setup-native-linux.sh`
- Start script: `start-native-linux.sh`

### Docker (Unraid)
- Dockerfile builds both frontend and backend
- Static files served from `/app/dist`
- Volume mounts: `/downloads`, `/data`, `/logs`
- Pre-built images: `ghcr.io/thenunner/ytandchill:latest`

## Known Issues & Limitations

- No password recovery mechanism (must manually reset via database)
- Full channel scans can be slow for channels with large video libraries
- Download worker is single-threaded (one download at a time)
- No multi-user support (single authentication credential)
- SQLite database (not suitable for high concurrency)
