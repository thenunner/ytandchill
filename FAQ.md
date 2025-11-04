# Frequently Asked Questions (FAQ)

## General Questions

### Why are my downloads failing?

The most common causes of download failures are:

1. **Missing or expired cookies** - YouTube has implemented aggressive bot detection as of 2024. See [YouTube Cookies](#youtube-cookies-and-authentication) below.
2. **Outdated yt-dlp** - YouTube frequently changes their systems. Keep yt-dlp updated.
3. **Network issues** - Check your internet connection and firewall settings.
4. **Age-restricted or private videos** - These require valid authentication cookies.

### Do I need a YouTube API key?

Yes, the YouTube Data API v3 key is required for:
- Fast channel scanning
- Fetching video metadata and thumbnails
- Checking for new uploads efficiently

The free tier provides 10,000 quota units per day, sufficient for personal use (scanning ~100-300 channels daily).

### Which YouTube account should I use for cookies?

**IMPORTANT:** It is strongly advised to **NOT use your personal YouTube account** for cookies. Here's why:

- **Risk of temporary ban or timeout** - YouTube may detect automated access and temporarily lock the account
- **Rate limiting** - Excessive API calls or downloads can trigger rate limits on your account
- **Terms of Service** - Automated downloads may violate YouTube's ToS

**Recommendation:** Create a separate, disposable Google account specifically for YT and Chill. This protects your personal account from any potential issues.

## YouTube Cookies and Authentication

### Why do I need cookies.txt?

As of 2024, YouTube cookies are essentially required for reliable downloads. According to [yt-dlp's FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp), YouTube has implemented increasingly aggressive bot detection that makes downloads fail without authentication cookies.

Without cookies, you may experience:
- Bot detection errors (`Sign in to confirm you're not a bot`)
- Rate limiting and IP blocking
- Failed downloads even for public videos
- Inability to access age-restricted content

### How often do I need to update cookies?

YouTube cookies typically expire every few weeks to months. Signs that your cookies have expired:
- Sudden increase in download failures
- "This video is not available" errors for previously working videos
- Bot detection messages in logs

**Solution:** Re-export your cookies using the same method described in the [README](README.md#youtube-cookies-strongly-recommended).

### What cookie format does YT and Chill support?

YT and Chill requires cookies in **Netscape HTTP Cookie File format**. This is the standard format exported by browser extensions like:
- "Get cookies.txt LOCALLY" (Chrome/Edge)
- "cookies.txt" (Firefox)

The file must be named `cookies.txt` and placed in the project root directory.

## Common yt-dlp Errors

### Error: "Video unavailable" or "This video is not available"

**Possible causes:**
1. **Video is geo-blocked** - Content not available in your country
2. **Video is private or deleted** - The uploader removed or restricted access
3. **Expired cookies** - Your authentication cookies need to be refreshed
4. **Age-restricted content** - Requires valid cookies from a logged-in account

**Solutions:**
- Re-export fresh cookies.txt from YouTube
- Use a VPN if content is geo-blocked
- Verify the video is still public and available on YouTube

### Error: "Sign in to confirm you're not a bot"

**Cause:** YouTube's bot detection has flagged your IP or detected automated access.

**Solutions:**
1. **Add/update cookies.txt** - This is the primary fix
2. **Wait before retrying** - YouTube may have rate-limited your IP temporarily
3. **Use a VPN** - Change your IP address
4. **Reduce concurrent downloads** - Lower the number of simultaneous downloads

### Error: "ERROR: unable to download video data: HTTP Error 403: Forbidden"

**Cause:** YouTube is blocking the request, usually due to:
- Missing or invalid cookies
- IP rate limiting
- Geo-restrictions

**Solutions:**
1. Re-export fresh cookies from a logged-in YouTube session
2. Verify cookies.txt is in Netscape format
3. Restart the application after updating cookies
4. Wait 15-30 minutes if rate-limited

### Error: "This video is available to this channel's members on level: X"

**Cause:** The video is restricted to YouTube channel members (paid membership).

**Solution:** YT and Chill cannot download membership-exclusive content. You must be a paying member and use cookies from that account (not recommended - see [Which YouTube account should I use](#which-youtube-account-should-i-use-for-cookies)).

### Error: "Premieres in X hours/days"

**Cause:** The video is a scheduled premiere and not yet available.

**Solution:** Wait until the premiere completes and the video becomes available, then retry the download.

### Error: "Private video"

**Cause:** The video is set to private by the uploader.

**Solution:** Private videos cannot be downloaded unless you have access. If you have access through your YouTube account, ensure you're using cookies from that account.

### Error: "This live event will begin in X minutes"

**Cause:** The video is a scheduled live stream that hasn't started yet.

**Solution:** Wait for the stream to complete. YT and Chill can download live streams after they finish and are converted to VODs (Video on Demand).

### Error: "Video unavailable. This content is not available on this country domain"

**Cause:** The video is geo-blocked in your region.

**Solutions:**
1. Use a VPN to change your apparent location
2. Use a VPN server in a country where the content is available
3. Export cookies while connected to the VPN

## Performance and Optimization

### Downloads are very slow

**Possible causes:**
1. **Network bandwidth limitations** - Your internet connection speed
2. **YouTube throttling** - YouTube may throttle download speeds for automated access
3. **Disk I/O bottleneck** - Slow storage device (especially on network shares)

**Solutions:**
- Limit concurrent downloads (default is 1)
- Ensure adequate network bandwidth
- Download to local storage first, then move to network share
- Use wired connection instead of WiFi

### Why does channel scanning take so long?

**Cause:** Without a YouTube API key, the app must scrape channel pages, which is slow and unreliable.

**Solution:** Add a YouTube Data API v3 key in Settings. This enables fast, efficient channel scanning using YouTube's official API.

### How many channels can I monitor?

With a YouTube API key (10,000 quota units/day):
- Each channel scan costs ~30-100 quota units depending on video count
- You can scan approximately 100-300 channels per day
- Daily auto-refresh is designed for this use case

Without an API key, scanning is limited by rate limiting and is not recommended for more than a few channels.

## Storage and Library

### Where are videos stored?

Videos are stored in the `downloads/` directory by default:
- **Native install:** `ytandchill/downloads/`
- **Docker/Unraid:** The path you mapped to `/app/downloads` (e.g., `/mnt/user/data/media/youtube/ytandchill/`)

Each channel gets its own subdirectory organized by channel name.

### Can I move the downloads directory?

**For Docker/Unraid:**
- Stop the container
- Edit the container settings
- Change the path mapped to `/app/downloads`
- Move your existing files to the new location
- Restart the container

**For Native install:**
- The downloads path is currently hardcoded to `downloads/`
- You can use symbolic links to point to another location

### How do I backup my data?

Backup these directories:
- `data/` - Database and configuration
- `downloads/` - Your video library
- `cookies.txt` - Authentication cookies (if using)

Logs in `logs/` are optional to backup.

## Troubleshooting

### The web interface won't load

**Checks:**
1. Is the application running? Check logs in `logs/app.log`
2. Is the correct port open? Default is 4099
3. Is another service using port 4099?
4. Firewall blocking the port?

**Solutions:**
- Check application logs for errors
- Verify port in browser: `http://localhost:4099`
- Change port in environment variable `PORT` if needed

### FFmpeg errors during download

**Cause:** FFmpeg is not installed or not in PATH.

**Solutions:**
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/) and add to PATH
- **Linux:** `sudo apt install ffmpeg` or `sudo dnf install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Docker/Unraid:** FFmpeg is included in the image

### Database is locked / Database corruption

**Cause:** Multiple processes trying to access SQLite database simultaneously, or unclean shutdown.

**Solutions:**
1. Stop the application completely
2. Backup `data/ytandchill.db`
3. Delete `data/ytandchill.db-shm` and `data/ytandchill.db-wal` if they exist
4. Restart the application

If corruption persists, you may need to rebuild the database (your downloads will remain, but you'll need to re-add channels).

## Updates

### How do I update YT and Chill?

**For Native Windows/Linux/macOS:**
- Pull the latest code: `git pull origin main`
- Re-run setup script: `setup-native-windows.bat` or `./setup-native-linux.sh`
- Restart the application

**For Docker/Unraid:**
- Click "Force Update" in Unraid Docker tab
- Or manually: `docker pull ghcr.io/thenunner/ytandchill:latest` and restart container

### How do I update yt-dlp?

**For Native install:**
```bash
pip install --upgrade yt-dlp
```

**For Docker/Unraid:**
yt-dlp is included in the Docker image. Update the container to get the latest yt-dlp version.

## Still Having Issues?

If your issue isn't covered here:

1. Check the [yt-dlp FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ) for yt-dlp-specific issues
2. Review application logs in `logs/app.log` for error details
3. Open an issue on [GitHub](https://github.com/thenunner/ytandchill/issues) with:
   - Clear description of the problem
   - Relevant log entries (remove sensitive information)
   - Steps to reproduce
   - Your platform (Windows/Linux/Docker/Unraid)
