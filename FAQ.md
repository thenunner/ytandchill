# Frequently Asked Questions (FAQ)

## General Questions

### Why are my downloads failing?

The most common causes of download failures are:

1. **Missing or expired cookies** - YT has implemented aggressive bot detection. See [YT Cookies](#youtube-cookies-and-authentication) below.
2. **Outdated yt-dlp** - YT frequently changes their systems. Keep yt-dlp updated.
3. **Network issues** - Check your internet connection and firewall settings.
4. **Age-restricted or private videos** - These require valid authentication cookies.

### Which YT account should I use for cookies?

**IMPORTANT:** It is strongly advised to **NOT use your personal YT account** for cookies. Here's why:

- **Risk of temporary ban or timeout** - YT may detect automated access and temporarily lock the account
- **Rate limiting** - Excessive API calls or downloads can trigger rate limits on your account
- **Terms of Service** - Automated downloads may violate YT's ToS

**Recommendation:** Create a separate, disposable Google account specifically for YT and Chill. This protects your personal account from any potential issues.

## YT Cookies and Authentication

### Why do I need cookies.txt?

YT cookies are essentially required for reliable downloads. According to [yt-dlp's FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp), YT has implemented increasingly aggressive bot detection that makes downloads fail without authentication cookies.

Without cookies, you may experience:
- Bot detection errors (`Sign in to confirm you're not a bot`)
- Rate limiting and IP blocking
- Failed downloads even for public videos
- Inability to access age-restricted content

### How often do I need to update cookies?

YT cookies typically expire every few weeks to months. Signs that your cookies have expired:
- Sudden increase in download failures
- "This video is not available" errors for previously working videos
- Bot detection messages in logs

**Solution:** Re-export your cookies using the same method described in the [README](README.md#youtube-cookies-recommended).

### What cookie format does YT and Chill support?

YT and Chill requires cookies in **Netscape HTTP Cookie File format**. This is the standard format exported by browser extensions like:
- "Get cookies.txt LOCALLY" (Chrome/Edge)
- "cookies.txt" (Firefox)

The file must be named `cookies.txt` and placed in the `data/` directory.

### How do I properly export cookies from YT?

**Best Practice Method (Recommended):**

1. **Choose a browser you don't normally use** (e.g., if you use Chrome daily, use Edge or Firefox for this)
2. **Open ONE incognito/private window** in that browser
   - Chrome/Edge: Ctrl+Shift+N (Windows) or Cmd+Shift+N (Mac)
   - Firefox: Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac)
3. **Important:** Make sure ONLY ONE incognito tab is open
4. **Go to YT and log in** with your disposable YT account (NOT your personal account)
5. **In the same tab**, navigate to `https://www.youtube.com/robots.txt`
   - This ensures the cookies are associated with the youtube.com domain properly
6. **Install the cookie export extension** (if not already installed):
   - Chrome/Edge: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"
7. **Click the extension icon** and export cookies for the current site
8. **Save the file as `cookies.txt`**
9. **Close the incognito window immediately** after exporting
10. **Place `cookies.txt` in your YT and Chill data directory**:
    - Native install: `data/cookies.txt`
    - Docker/Unraid: `/mnt/user/appdata/ytandchill/data/cookies.txt`

**Why this method works best:**
- Incognito mode ensures clean cookies without interference from other sessions
- Using a separate browser prevents conflicts with your daily browsing
- Only one tab prevents duplicate or conflicting cookie entries
- The robots.txt page ensures you're on the base youtube.com domain
- Closing immediately after export keeps the cookies fresh and unmodified

**Common mistakes to avoid:**
- ❌ Having multiple incognito tabs open (creates cookie conflicts)
- ❌ Using your main browser you browse with daily
- ❌ Exporting from a tab other than robots.txt
- ❌ Using your personal YT account (use disposable account instead)

## Common yt-dlp Errors

### Error: "Video unavailable" or "This video is not available"

**Possible causes:**
1. **Video is geo-blocked** - Content not available in your country
2. **Video is private or deleted** - The uploader removed or restricted access
3. **Expired cookies** - Your authentication cookies need to be refreshed
4. **Age-restricted content** - Requires valid cookies from a logged-in account

**Solutions:**
- Re-export fresh cookies.txt from YT
- Use a VPN if content is geo-blocked
- Verify the video is still public and available on YT

### Error: "Sign in to confirm you're not a bot"

**Cause:** YT's bot detection has flagged your IP or detected automated access.

**Solutions:**
1. **Add/update cookies.txt** - This is the primary fix
2. **Wait before retrying** - YT may have rate-limited your IP temporarily
3. **Use a VPN** - Change your IP address
4. **Reduce concurrent downloads** - Lower the number of simultaneous downloads

### Error: "ERROR: unable to download video data: HTTP Error 403: Forbidden"

**Cause:** YT is blocking the request, usually due to:
- Missing or invalid cookies
- IP rate limiting
- Geo-restrictions

**Solutions:**
1. Re-export fresh cookies from a logged-in YT session
2. Verify cookies.txt is in Netscape format
3. Restart the application after updating cookies
4. Wait 15-30 minutes if rate-limited

### Error: "This video is available to this channel's members on level: X"

**Cause:** The video is restricted to YT channel members (paid membership).

**Solution:** YT and Chill cannot download membership-exclusive content. You must be a paying member and use cookies from that account (not recommended - see [Which YT account should I use](#which-youtube-account-should-i-use-for-cookies)).

### Error: "Premieres in X hours/days"

**Cause:** The video is a scheduled premiere and not yet available.

**Solution:** Wait until the premiere completes and the video becomes available, then retry the download.

### Error: "Private video"

**Cause:** The video is set to private by the uploader.

**Solution:** Private videos cannot be downloaded unless you have access. If you have access through your YT account, ensure you're using cookies from that account.

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
2. **YT throttling** - YT may throttle download speeds for automated access
3. **Disk I/O bottleneck** - Slow storage device (especially on network shares)

**Solutions:**
- Limit concurrent downloads (default is 1)
- Ensure adequate network bandwidth
- Download to local storage first, then move to network share
- Use wired connection instead of WiFi

### Why does channel scanning take so long?

Channel scanning uses yt-dlp to fetch video metadata directly from YT. The speed depends on:
- Number of videos in the channel history
- Network connection speed
- YT's response times

For incremental scans (daily auto-refresh), only new videos are fetched, which is much faster than full scans.

### How many channels can I monitor?

YT and Chill uses yt-dlp for all channel scanning, which has **no API quota limits**. You can monitor as many channels as you want without worrying about daily limits.

Practical limits depend on your scanning schedule and network bandwidth rather than API quotas.

## Storage and Library

### Where are videos stored?

Videos are stored in the `downloads/` directory by default:
- **Native install:** `ytandchill/downloads/`
- **Docker/Unraid:** The path you mapped to `/app/downloads` (e.g., `/mnt/user/downloads/ytandchill/`)

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
- `data/` - Database, configuration, and cookies.txt
- `downloads/` - Your video library

Logs in `logs/` are optional to backup.

## Troubleshooting

### The web interface won't load

**Checks:**
1. Is the application running? Check logs in `logs/app.log`
2. Is the correct port open? (default: 4099)
3. Is another service using your chosen port?
4. Firewall blocking the port?

**Solutions:**
- Check application logs for errors
- Verify port in browser: `http://localhost:YOUR-PORT`
- Change port via `PORT` environment variable if needed

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
2. Backup `data/youtube_downloader.db`
3. Delete `data/youtube_downloader.db-shm` and `data/youtube_downloader.db-wal` if they exist
4. Restart the application

If corruption persists, you may need to rebuild the database (your downloads will remain, but you'll need to re-add channels).

## Updates

### How do I update YT and Chill?

**For Native Windows/Linux/macOS:**
- Pull the latest code: `git pull origin main`
- Re-run setup: `windows-start.bat` (select Setup option) or `./linux-start.sh`
- Restart the application

**For Docker/Unraid:**
- If templated from GitHub Container Registry: **Force Update** in Unraid Docker tab
- If local build: `git pull` then `docker-compose up -d --build`

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
