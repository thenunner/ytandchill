"""
YouTube Scanner using yt-dlp.

This module provides channel and video scanning without YouTube API quota limits.
Uses yt-dlp's --flat-playlist mode for fast metadata extraction.
"""

import os
import re
import json
import subprocess
import logging

logger = logging.getLogger(__name__)

# Minimum video duration in seconds (filters out Shorts)
MIN_DURATION_SECONDS = 120


def get_cookies_path():
    """Get the cookies.txt path if it exists."""
    data_dir = os.environ.get('DATA_DIR', '/appdata/data')
    cookies_path = os.path.join(data_dir, 'backend', 'cookies.txt')
    if os.path.exists(cookies_path):
        return cookies_path
    return None


def _run_ytdlp(args, timeout=300):
    """Run yt-dlp with common options and error handling.

    Args:
        args: List of yt-dlp arguments
        timeout: Timeout in seconds (default: 5 minutes)

    Returns:
        tuple: (success, stdout, stderr)
    """
    cmd = ['yt-dlp', '--no-warnings'] + args

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
        tuple: (channel_info, videos)
            channel_info: dict with keys: id, title, thumbnail (or None if error)
            videos: list of video dicts with keys: id, title, duration_sec, upload_date, thumbnail

    Note:
        - Filters out videos under 2 minutes (YouTube Shorts)
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
        return None, []

    videos = []
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
                'thumbnail': None,  # Will be set from first video
            }

        # Get duration (may be None for some entries)
        duration = data.get('duration')
        if duration is None:
            continue

        # Skip shorts (<2 minutes)
        if duration < MIN_DURATION_SECONDS:
            continue

        video_id = data.get('id')
        if not video_id:
            continue

        # Set channel thumbnail from first valid video
        if channel_info and not channel_info['thumbnail']:
            channel_info['thumbnail'] = f'https://img.youtube.com/vi/{video_id}/default.jpg'

        videos.append({
            'id': video_id,
            'title': data.get('title', 'Untitled'),
            'duration_sec': duration,
            'upload_date': data.get('upload_date'),  # YYYYMMDD format
            'thumbnail': f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg',
        })

    logger.info(f'Scanned {len(videos)} videos from channel')
    return channel_info, videos


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

        channel_id = data.get('channel_id')
        if not channel_id:
            logger.warning(f'No channel_id in response for {channel_url}')
            return None

        video_id = data.get('id')
        thumbnail = f'https://img.youtube.com/vi/{video_id}/default.jpg' if video_id else None

        return {
            'id': channel_id,
            'title': data.get('channel') or data.get('uploader') or 'Unknown',
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
        list: List of video dicts with keys: yt_id, title, duration_sec, upload_date, thumbnail, channel_title
        Empty list on error
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
        return []

    videos = []

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

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
            'channel_id': data.get('channel_id'),
            'channel_title': data.get('channel') or data.get('uploader') or 'Unknown',
        })

    logger.info(f'Playlist scan complete: {len(videos)} videos found')
    return videos


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
