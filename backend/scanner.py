"""
YouTube Scanner using yt-dlp.

This module provides channel and video scanning without YouTube API quota limits.
Uses yt-dlp's --flat-playlist mode for fast metadata extraction.
"""

import os
import re
import sys
import json
import subprocess
import logging

logger = logging.getLogger(__name__)

# Minimum video duration in seconds (0 = no filter)
# Note: Shorts are on a separate /shorts tab and don't appear in main channel scans
MIN_DURATION_SECONDS = 0


def get_cookies_path():
    """Get the cookies.txt path if it exists."""
    data_dir = os.environ.get('DATA_DIR', '/appdata/data')
    cookies_path = os.path.join(data_dir, 'cookies.txt')
    if os.path.exists(cookies_path):
        return cookies_path
    return None


def _extract_channel_thumbnail(info_dict, include_fallback=False):
    """
    Extract channel thumbnail URL from yt-dlp info dict.

    Args:
        info_dict: Dictionary from yt-dlp containing video/channel metadata
        include_fallback: If True, fall back to video thumbnail when no channel avatar found

    Returns:
        Thumbnail URL string or None
    """
    # Check for channel thumbnails array (preferred)
    thumb_fields = ['channel_thumbnails', 'uploader_thumbnails']
    if include_fallback:
        thumb_fields.append('thumbnails')

    for thumb_field in thumb_fields:
        thumbs = info_dict.get(thumb_field)
        if thumbs and isinstance(thumbs, list):
            # Get the highest quality thumbnail (last in list is usually highest)
            for t in reversed(thumbs):
                if isinstance(t, dict) and t.get('url'):
                    return t['url']

    # Fallback to video thumbnail if requested and no channel avatar found
    if include_fallback:
        video_id = info_dict.get('id')
        if video_id:
            return f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'

    return None


def _run_ytdlp(args, timeout=300):
    """Run yt-dlp with common options and error handling.

    Args:
        args: List of yt-dlp arguments
        timeout: Timeout in seconds (default: 5 minutes)

    Returns:
        tuple: (success, stdout, stderr)
    """
    # Use python -m yt_dlp for cross-platform compatibility (Windows PATH issues)
    cmd = [sys.executable, '-m', 'yt_dlp', '--no-warnings'] + args

    # Add cookies if available
    cookies_path = get_cookies_path()
    if cookies_path:
        cmd.extend(['--cookies', cookies_path])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        logger.error(f'yt-dlp timeout after {timeout}s')
        return False, '', 'Timeout'
    except Exception as e:
        logger.error(f'yt-dlp error: {e}')
        return False, '', str(e)


def scan_channel_videos(channel_url, max_results=250):
    """
    Scan channel videos using yt-dlp (no API quota limits).

    Uses --flat-playlist for fast metadata extraction without downloading.

    Args:
        channel_url: YouTube channel URL (any format: @handle, /channel/UC..., etc.)
        max_results: Maximum number of videos to fetch (default: 250)

    Returns:
        tuple: (channel_info, videos, all_video_ids)
            channel_info: dict with keys: id, title, thumbnail (or None if error)
            videos: list of video dicts with keys: id, title, duration_sec, upload_date, thumbnail
            all_video_ids: set of ALL video IDs found (including shorts) for not_found detection

    Note:
        - Filters out videos under 2 minutes (YouTube Shorts) from the videos list
        - all_video_ids includes shorts so they aren't incorrectly marked as not_found
        - upload_date is in YYYYMMDD format
    """
    logger.info(f'Scanning channel: {channel_url} (max: {max_results})')

    args = [
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', str(max_results),
        channel_url
    ]

    success, stdout, stderr = _run_ytdlp(args)

    if not success:
        logger.error(f'Failed to scan channel {channel_url}: {stderr}')
        return None, [], set()

    videos = []
    all_video_ids = set()  # Track ALL video IDs including shorts
    channel_info = None

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Extract channel info from first video
        if not channel_info and data.get('channel_id'):
            channel_info = {
                'id': data.get('channel_id'),
                'title': data.get('channel') or data.get('uploader'),
                'thumbnail': _extract_channel_thumbnail(data),  # May be None, will fallback to video thumb
            }

        video_id = data.get('id')
        if not video_id:
            continue

        # Track ALL video IDs (including shorts) for not_found detection
        all_video_ids.add(video_id)

        # Get duration (may be None for some entries)
        duration = data.get('duration')
        if duration is None:
            continue

        # Skip shorts (<2 minutes) from the returned videos list
        if duration < MIN_DURATION_SECONDS:
            continue

        # Fallback: Set channel thumbnail from first valid video if no avatar found
        if channel_info and not channel_info['thumbnail']:
            channel_info['thumbnail'] = f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'

        videos.append({
            'id': video_id,
            'title': data.get('title', 'Untitled'),
            'duration_sec': duration,
            'upload_date': data.get('upload_date'),  # YYYYMMDD format
            'thumbnail': f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg',
        })

    logger.info(f'Scanned {len(videos)} videos from channel ({len(all_video_ids)} total including shorts)')
    return channel_info, videos, all_video_ids


def scan_channel_videos_full(channel_url, max_results=50, progress_callback=None):
    """
    Scan channel videos with FULL metadata extraction.

    This is slower than scan_channel_videos() but reliably includes upload_date.
    Use for auto-scan and scan-new where only small batches are needed.

    Process:
    1. Use flat-playlist to quickly discover video IDs
    2. Fetch full metadata for each video (includes upload_date)

    Args:
        channel_url: YouTube channel URL (any format)
        max_results: Maximum number of videos to fetch (default: 50)
        progress_callback: Optional callback(current, total) called after each video

    Returns:
        tuple: (channel_info, videos, all_video_ids) - same format as scan_channel_videos()

    Note:
        Expect ~1-3 seconds per video. For 50 videos = ~1-2 minutes.
    """
    logger.info(f'Full scan of channel: {channel_url} (max: {max_results})')

    # Step 1: Use flat-playlist to quickly get video IDs
    args = [
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', str(max_results),
        channel_url
    ]

    success, stdout, stderr = _run_ytdlp(args)

    if not success:
        logger.error(f'Failed to scan channel {channel_url}: {stderr}')
        return None, [], set()

    # Parse flat-playlist results to get video IDs
    video_ids = []
    all_video_ids = set()
    channel_info = None

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Extract channel info from first entry
        if not channel_info and data.get('channel_id'):
            channel_info = {
                'id': data.get('channel_id'),
                'title': data.get('channel') or data.get('uploader'),
                'thumbnail': _extract_channel_thumbnail(data),
            }

        video_id = data.get('id')
        if not video_id:
            continue

        all_video_ids.add(video_id)

        # Get duration to filter shorts
        duration = data.get('duration')
        if duration is None:
            continue

        # Skip shorts
        if duration < MIN_DURATION_SECONDS:
            continue

        video_ids.append(video_id)

        # Fallback: Set channel thumbnail from first valid video if no avatar found
        if channel_info and not channel_info['thumbnail']:
            channel_info['thumbnail'] = f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'

    logger.info(f'Found {len(video_ids)} videos to fetch full metadata for')

    # Step 2: Fetch full metadata for each video
    videos = []
    total_videos = len(video_ids)
    for idx, video_id in enumerate(video_ids, 1):
        if progress_callback:
            progress_callback(idx, total_videos)
        logger.debug(f'Fetching full metadata [{idx}/{total_videos}]: {video_id}')

        video_info = get_video_info(video_id)
        if video_info:
            # Convert to same format as scan_channel_videos
            videos.append({
                'id': video_info['yt_id'],
                'title': video_info['title'],
                'duration_sec': video_info['duration_sec'],
                'upload_date': video_info['upload_date'],
                'thumbnail': video_info['thumbnail'],
            })

    logger.info(f'Full scan complete: {len(videos)} videos with metadata')
    return channel_info, videos, all_video_ids


def get_channel_info(channel_url):
    """
    Get channel metadata using yt-dlp.

    Args:
        channel_url: YouTube channel URL (any format)

    Returns:
        dict: Channel info with keys: id, title, thumbnail, url
        None: If channel not found or error
    """
    logger.debug(f'Getting channel info: {channel_url}')

    # Get just the first video to extract channel info
    args = [
        '--flat-playlist',
        '--dump-json',
        '--playlist-items', '1',
        channel_url
    ]

    success, stdout, stderr = _run_ytdlp(args, timeout=60)

    if not success or not stdout.strip():
        logger.error(f'Failed to get channel info for {channel_url}: {stderr}')
        return None

    try:
        data = json.loads(stdout.strip().split('\n')[0])

        # Try multiple fields for channel ID (yt-dlp is inconsistent in flat-playlist mode)
        # Valid channel IDs start with "UC" and are 24 characters
        def is_valid_channel_id(cid):
            return cid and cid.startswith('UC') and len(cid) == 24

        # Try these fields in order of preference
        channel_id = None
        for field in ['channel_id', 'playlist_channel_id']:
            value = data.get(field)
            if is_valid_channel_id(value):
                channel_id = value
                break

        # Fallback: extract from URL fields
        if not is_valid_channel_id(channel_id):
            for url_field in ['channel_url', 'uploader_url', 'playlist_channel_url']:
                url_value = data.get(url_field, '')
                match = re.search(r'/channel/(UC[a-zA-Z0-9_-]{22})', url_value)
                if match:
                    channel_id = match.group(1)
                    break

        if not is_valid_channel_id(channel_id):
            logger.warning(f'No valid channel_id in response for {channel_url}. Available keys: {list(data.keys())}')
            return None

        # Get channel title from available fields
        channel_title = data.get('channel') or data.get('playlist_channel') or data.get('uploader') or data.get('playlist_uploader') or 'Unknown'

        # Get channel thumbnail with fallback to video thumbnail
        thumbnail = _extract_channel_thumbnail(data, include_fallback=True)

        return {
            'id': channel_id,
            'title': channel_title,
            'thumbnail': thumbnail,
            'url': f'https://youtube.com/channel/{channel_id}',
        }
    except (json.JSONDecodeError, IndexError) as e:
        logger.error(f'Error parsing channel info for {channel_url}: {e}')
        return None


def resolve_channel_from_url(url):
    """
    Resolve any YouTube URL to channel information.

    Supports:
    - youtube.com/@handle
    - youtube.com/channel/UC...
    - youtube.com/c/customname
    - youtube.com/user/username

    Args:
        url: YouTube URL

    Returns:
        dict: Channel info with keys: id, title, thumbnail, url
        None: If channel not found
    """
    # Normalize URL to channel format
    url = url.strip()

    # Direct channel ID URLs - extract and build canonical URL
    if '/channel/' in url:
        match = re.search(r'/channel/([^/?]+)', url)
        if match:
            channel_id = match.group(1)
            # Verify the channel exists by getting info
            canonical_url = f'https://youtube.com/channel/{channel_id}'
            return get_channel_info(canonical_url)

    # For all other formats (@handle, /c/, /user/), use yt-dlp to resolve
    return get_channel_info(url)


def scan_playlist_videos(playlist_url, max_results=500):
    """
    Fetch all videos from a YouTube playlist.

    Args:
        playlist_url: YouTube playlist URL
        max_results: Maximum number of videos to fetch (default: 500)

    Returns:
        tuple: (playlist_title, videos)
            playlist_title: Name of the YouTube playlist (or None for single videos/channels)
            videos: List of video dicts with keys: yt_id, title, duration_sec, upload_date, thumbnail, channel_title
        Returns (None, []) on error
    """
    logger.info(f'Scanning playlist: {playlist_url}')

    args = [
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', str(max_results),
        playlist_url
    ]

    success, stdout, stderr = _run_ytdlp(args)

    if not success:
        logger.error(f'Failed to scan playlist {playlist_url}: {stderr}')
        return None, []

    videos = []
    # Extract channel info from first video that has it (flat-playlist mode doesn't always include it)
    playlist_channel_title = None
    playlist_channel_id = None
    playlist_title = None

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Capture playlist title from first entry that has it
        if playlist_title is None:
            playlist_title = data.get('playlist_title')

        # Capture channel info from first video that has it
        if not playlist_channel_title:
            playlist_channel_title = data.get('channel') or data.get('uploader') or data.get('playlist_channel')
            playlist_channel_id = data.get('channel_id')

        duration = data.get('duration')
        if duration is None:
            continue

        # Skip shorts (<2 minutes)
        if duration < MIN_DURATION_SECONDS:
            continue

        video_id = data.get('id')
        if not video_id:
            continue

        videos.append({
            'yt_id': video_id,
            'title': data.get('title', 'Untitled'),
            'duration_sec': duration,
            'upload_date': data.get('upload_date'),
            'thumbnail': f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg',
            'channel_id': data.get('channel_id') or playlist_channel_id,
            'channel_title': data.get('channel') or data.get('uploader') or playlist_channel_title or 'Unknown',
        })

    logger.info(f'Playlist scan complete: {len(videos)} videos found (title: {playlist_title})')
    return playlist_title, videos


def extract_playlist_id(url):
    """
    Extract playlist ID from YouTube playlist URL.

    Supports:
    - youtube.com/playlist?list=PLxxxxx
    - youtube.com/watch?v=xxx&list=PLxxxxx

    Args:
        url: YouTube URL containing playlist ID

    Returns:
        str: Playlist ID if found
        None: If playlist ID not found in URL
    """
    match = re.search(r'[?&]list=([^&]+)', url)
    if match:
        return match.group(1)
    return None


def get_video_info(video_id):
    """
    Get metadata for a single video using yt-dlp.

    Args:
        video_id: YouTube video ID (11 characters)

    Returns:
        dict: Video info with keys: yt_id, title, duration_sec, upload_date, thumbnail, channel_title
        None: If video not found or error
    """
    url = f'https://youtube.com/watch?v={video_id}'
    logger.debug(f'Getting video info: {video_id}')

    args = [
        '--dump-json',
        '--no-playlist',
        url
    ]

    success, stdout, stderr = _run_ytdlp(args, timeout=60)

    if not success or not stdout.strip():
        logger.error(f'Failed to get video info for {video_id}: {stderr}')
        return None

    try:
        data = json.loads(stdout.strip())

        duration = data.get('duration')
        if duration is None:
            logger.warning(f'No duration for video {video_id}')
            return None

        return {
            'yt_id': data.get('id', video_id),
            'title': data.get('title', 'Untitled'),
            'duration_sec': duration,
            'upload_date': data.get('upload_date'),
            'thumbnail': f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg',
            'channel_id': data.get('channel_id'),
            'channel_title': data.get('channel') or data.get('uploader') or 'Unknown',
        }
    except json.JSONDecodeError as e:
        logger.error(f'Error parsing video info for {video_id}: {e}')
        return None


def scan_channel_shorts(channel_id):
    """
    Scan a channel's /shorts tab to get all shorts video IDs.

    Args:
        channel_id: YouTube channel ID (starts with UC)

    Returns:
        set: Set of video IDs that are shorts
    """
    shorts_url = f'https://youtube.com/channel/{channel_id}/shorts'
    logger.info(f'Scanning shorts for channel: {channel_id}')

    args = [
        '--flat-playlist',
        '--dump-json',
        '--playlist-end', '500',  # Get up to 500 shorts
        shorts_url
    ]

    success, stdout, stderr = _run_ytdlp(args, timeout=120)

    if not success:
        # Channel may not have shorts - this is not an error
        logger.debug(f'No shorts found for channel {channel_id}: {stderr}')
        return set()

    shorts_ids = set()

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        try:
            data = json.loads(line)
            video_id = data.get('id')
            if video_id:
                shorts_ids.add(video_id)
        except json.JSONDecodeError:
            continue

    logger.info(f'Found {len(shorts_ids)} shorts for channel {channel_id}')
    return shorts_ids
