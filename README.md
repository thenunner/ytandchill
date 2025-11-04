# YouTube Downloader - Docker Setup for Unraid

A self-hosted YouTube channel video downloader with automatic monitoring and queue management.

## Features

- Monitor YouTube channels for new videos
- Automatic and manual video downloads
- Queue management with drag-and-drop reordering
- Web-based UI for managing channels, videos, and playlists
- SQLite database for tracking videos
- Support for age-restricted content via cookies

## Quick Start on Unraid

### 1. Install via Docker Compose

1. Copy this entire folder to your Unraid server (e.g., `/mnt/user/appdata/youtube-downloader/`)

2. Edit `docker-compose.yml` and update the volume paths to match your Unraid paths:
   ```yaml
   volumes:
     - /mnt/user/appdata/youtube-downloader/data:/app/data
     - /mnt/user/media/YouTube:/app/downloads
     - /mnt/user/appdata/youtube-downloader/logs:/app/logs
   ```

3. Build and start the container:
   ```bash
   cd /mnt/user/appdata/youtube-downloader
   docker-compose up -d
   ```

### 2. Access the Web UI

Open your browser to: `http://YOUR-SERVER-IP:4099`

The WebUI link will also appear in Unraid's Docker tab.

### 3. First-Time Setup

1. Go to **Settings** in the web UI
2. Add your **YouTube API Key** (required for channel scanning)
   - Get one from: https://console.cloud.google.com/apis/credentials
   - Enable the YouTube Data API v3
3. Configure download quality and other preferences
4. Add your first channel from the **Channels** page

## Configuration

### Port Configuration

Default port is `4099`. To change it:

1. Edit `docker-compose.yml`:
   ```yaml
   ports:
     - "8080:4099"  # External:Internal
   ```
2. Or use environment variable:
   ```yaml
   environment:
     - PORT=YOUR_PORT
   ```

### Volume Mounts

| Local Path | Container Path | Purpose |
|------------|---------------|---------|
| `./data` | `/app/data` | SQLite database |
| `./downloads` | `/app/downloads` | Downloaded videos and thumbnails |
| `./logs` | `/app/logs` | Application logs |

### Optional: Age-Restricted Content

To download age-restricted videos:

1. Export your YouTube cookies to `cookies.txt` (use browser extension)
2. Uncomment this line in `docker-compose.yml`:
   ```yaml
   - ./cookies.txt:/app/cookies.txt
   ```

## Migrating Existing Data

If you have an existing installation and want to migrate:

1. Copy your old database file to:
   ```
   yt-docker/data/youtube_downloader.db
   ```

2. Copy your downloads folder to:
   ```
   yt-docker/downloads/
   ```

3. The app will automatically find all existing videos and channels!

Note: You'll need to re-enter your YouTube API key in Settings.

## Usage

### Adding Channels

1. Go to **Channels** → **Add Channel**
2. Enter channel URL or ID
3. Click **Scan** to discover videos
4. Videos appear in the **Videos** page

### Downloading Videos

1. Find videos in the **Videos** page
2. Click **Download** to add to queue
3. Monitor progress in the **Queue** page
4. Drag to reorder queued items
5. Use **Clear Queue** to remove all pending downloads

### Auto-Refresh

Enable in **Settings** to automatically check channels for new videos every 6 hours.

## Unraid-Specific Notes

- Container runs as `nobody:users` (99:100) for proper file permissions
- WebUI integration enabled for easy access from Docker tab
- Compatible with Unraid Community Applications

## Troubleshooting

### Videos aren't downloading
- Check that ffmpeg is installed (included in Docker image)
- Verify YouTube API key in Settings
- Check logs: `docker-compose logs -f`

### Permission errors
- Ensure mounted folders have correct permissions: `chmod -R 99:100`

### Database issues
- Database is in `data/youtube_downloader.db`
- Backup before major changes

## Updating

```bash
cd /path/to/yt-docker
docker-compose pull
docker-compose up -d --build
```

## Support

For issues or questions, check the application logs:
```bash
docker-compose logs -f youtube-downloader
```

Or check the logs folder: `./logs/app.log`
