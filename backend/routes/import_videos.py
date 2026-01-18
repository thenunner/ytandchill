"""
Import Videos Routes

Handles importing existing video files into ytandchill.
Uses yt-dlp (not YouTube API) to fetch channel metadata - no quota limits.

Endpoints:
- GET /api/import/scan - Scan import folder for video files
- POST /api/import/add-channel - Add a channel URL to process
- POST /api/import/fetch-channel - Fetch video metadata from a channel
- POST /api/import/match - Match files against channel videos
- POST /api/import/execute - Execute import for matched files
- POST /api/import/resolve - Resolve a pending match (user selection)
"""

import os
import re
import json
import shutil
import subprocess
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from flask import Blueprint, jsonify, request
import requests as http_requests
import yt_dlp

from werkzeug.utils import secure_filename

from database import Video, Channel, get_session
from utils import makedirs_777, ensure_channel_thumbnail, sanitize_folder_name

logger = logging.getLogger(__name__)

# Create Blueprint
import_bp = Blueprint('import_videos', __name__)

# Module-level references
_session_factory = None
_settings_manager = None

# Supported video extensions (browser-playable formats only)
VIDEO_EXTENSIONS = {'.mp4', '.webm', '.m4v'}
MKV_EXTENSION = '.mkv'  # Handled conditionally when re-encode enabled

# Import state (in-memory for session)
_import_state = {
    'channels': [],  # List of channel info dicts
    'files': [],  # List of file paths
    'pending': [],  # Files needing user selection (multiple matches)
    'imported': [],  # Successfully imported files
    'skipped': [],  # Skipped files with reasons
    'failed': [],  # Failed files with detailed reasons
    'known_channel_ids': set(),  # Channel IDs from channels.txt for prioritization
    'current_channel_idx': 0,
    'status': 'idle',  # idle, fetching, matching, importing, encoding, complete
    'progress': 0,
    'message': '',
    'encode_progress': None,  # 0-100 when encoding MKV
    'encode_queue': [],  # MKVs waiting to be encoded
    'encode_current': None,  # Currently encoding file info
}

# Lock for thread-safe encode queue operations
_encode_lock = threading.Lock()
_encode_thread = None


def _ensure_state_keys():
    """Ensure _import_state has all required keys.

    This prevents KeyError when state is reset by scan endpoint
    without the encode-related fields.
    """
    global _import_state
    defaults = {
        'encode_queue': [],
        'encode_current': None,
        'encode_progress': 0,
        'failed': [],
        'imported': [],
        'skipped': [],
        'pending': [],
    }
    for key, default in defaults.items():
        if key not in _import_state:
            _import_state[key] = default


def init_import_routes(session_factory, settings_manager):
    """Initialize the import routes with required dependencies."""
    global _session_factory, _settings_manager
    _session_factory = session_factory
    _settings_manager = settings_manager


def _encode_worker():
    """Background worker that processes the encode queue sequentially."""
    global _import_state

    logger.info("Encode worker thread started")

    _ensure_state_keys()

    while True:
        item = None

        with _encode_lock:
            if not _import_state['encode_queue']:
                # Queue empty, exit thread
                _import_state['encode_current'] = None
                _import_state['status'] = 'idle' if not _import_state['pending'] else 'idle'
                logger.info("Encode queue empty, worker exiting")
                break

            # Pop next item from queue
            item = _import_state['encode_queue'].pop(0)
            _import_state['encode_current'] = item
            _import_state['status'] = 'encoding'
            _import_state['encode_progress'] = 0

        if not item:
            break

        try:
            file_path = item['file']
            video_info = item['video']
            channel_info = item['channel_info']
            match_type = item.get('match_type', 'smart')
            filename = os.path.basename(file_path)

            logger.info(f"Encode worker processing: {filename}")

            # Execute the import (which handles MKV re-encoding)
            success, video_id = execute_import(file_path, video_info, channel_info, match_type)

            with _encode_lock:
                if success:
                    _import_state['imported'].append({
                        'file': file_path,
                        'filename': item.get('filename', filename),
                        'video': video_info,
                        'match_type': match_type,
                        'channel': channel_info['channel_title'],
                    })
                else:
                    _import_state['failed'].append({
                        'file': file_path,
                        'filename': item.get('filename', filename),
                        'file_size': item.get('file_size', 0),
                        'reason': 'Encoding failed',
                        'reason_code': 'encode_failed',
                    })

        except Exception as e:
            logger.error(f"Encode worker error for {item.get('filename', 'unknown')}: {e}")
            with _encode_lock:
                _import_state['failed'].append({
                    'file': item.get('file', ''),
                    'filename': item.get('filename', 'unknown'),
                    'file_size': item.get('file_size', 0),
                    'reason': str(e),
                    'reason_code': 'encode_error',
                })

    logger.info("Encode worker thread finished")


def _start_encode_worker():
    """Start the background encode worker thread if not already running."""
    global _encode_thread

    with _encode_lock:
        if _encode_thread is not None and _encode_thread.is_alive():
            logger.debug("Encode worker already running")
            return

        _encode_thread = threading.Thread(target=_encode_worker, daemon=True)
        _encode_thread.start()
        logger.info("Started encode worker thread")


def _queue_for_encoding(match):
    """Add a match to the encode queue (for MKV files)."""
    global _import_state

    _ensure_state_keys()

    with _encode_lock:
        _import_state['encode_queue'].append(match)

    _start_encode_worker()


def get_downloads_folder():
    """Get the downloads folder path.

    Uses DOWNLOADS_DIR env var if set, otherwise defaults to 'downloads'.
    In Docker/Unraid, this is typically /app/downloads (mounted volume).
    """
    return os.environ.get('DOWNLOADS_DIR', 'downloads')


def get_import_folder():
    """Get the import folder path (downloads/imports/).

    Uses the downloads folder path with /imports appended.
    """
    import_folder = os.path.join(get_downloads_folder(), 'imports')

    # Create if doesn't exist with proper permissions
    makedirs_777(import_folder)

    return import_folder


def resolve_channel_id(channel_url):
    """Resolve a channel URL to its channel ID.

    Handles various URL formats:
    - /channel/UCxxxxx - extract directly
    - /@handle or /c/name - use yt-dlp to resolve

    Returns channel_id or None if unable to resolve.
    """
    if not channel_url:
        return None

    # Direct channel ID URL
    match = re.search(r'/channel/(UC[a-zA-Z0-9_-]{22})', channel_url)
    if match:
        return match.group(1)

    # Need to resolve via yt-dlp library
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'playlist_items': '1',  # Just get first video to extract channel
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'{channel_url}/videos', download=False)
            if info:
                # Try to get channel_id from playlist info
                if info.get('channel_id'):
                    return info.get('channel_id')
                # Or from first entry
                if info.get('entries') and len(info['entries']) > 0:
                    first_entry = info['entries'][0]
                    if first_entry and first_entry.get('channel_id'):
                        return first_entry.get('channel_id')

    except Exception as e:
        logger.warning(f"Failed to resolve channel ID for {channel_url}: {e}")

    return None


def scan_import_folder(include_mkv_override=False):
    """Scan import folder for video files and channel URL files.

    Args:
        include_mkv_override: If True, include MKVs regardless of setting (session override)
    """
    import_folder = get_import_folder()

    # Get MKV re-encode setting OR check session override
    reencode_mkv = _settings_manager.get('import_reencode_mkv', 'false') == 'true' or include_mkv_override
    allowed_extensions = VIDEO_EXTENSIONS | ({MKV_EXTENSION} if reencode_mkv else set())

    # Accepted channel file names (one URL per line)
    CHANNEL_FILE_NAMES = {'channels.txt', 'channels.csv', 'channels.list', 'urls.txt', 'urls.csv'}

    files = []
    skipped_mkv = []  # MKV files skipped when re-encode disabled
    csv_channels = []
    csv_found = False
    channel_file_name = None

    # Scan for video files
    for filename in os.listdir(import_folder):
        filepath = os.path.join(import_folder, filename)

        if os.path.isfile(filepath):
            ext = os.path.splitext(filename)[1].lower()

            if ext in allowed_extensions:
                files.append({
                    'name': filename,
                    'path': filepath,
                    'size': os.path.getsize(filepath),
                })
            elif ext == '.mkv' and not reencode_mkv:
                # Track MKV files that are skipped due to re-encode setting
                skipped_mkv.append({
                    'name': filename,
                    'path': filepath,
                    'size': os.path.getsize(filepath),
                    'reason': "MKV files need to be re-encoded for web playback. Go to Settings and enable 'Re-encode MKVs for web'.",
                })
            elif filename.lower() in CHANNEL_FILE_NAMES:
                csv_found = True
                channel_file_name = filename
                # Parse file (one URL per line, # for comments)
                with open(filepath, 'r', encoding='utf-8') as f:
                    for line in f:
                        url = line.strip()
                        if url and not url.startswith('#'):
                            csv_channels.append(url)

    return {
        'files': files,
        'count': len(files),
        'skipped_mkv': skipped_mkv,
        'csv_found': csv_found,
        'csv_channels': csv_channels,
        'channel_file': channel_file_name,
        'import_path': import_folder,
    }


def get_video_duration(file_path):
    """Get video duration in seconds using ffprobe."""
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', file_path
        ], capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            logger.warning(f"ffprobe failed for {file_path}")
            return None

        data = json.loads(result.stdout)
        duration = data.get('format', {}).get('duration')

        if duration:
            return int(float(duration))

        return None
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timeout for {file_path}")
        return None
    except Exception as e:
        logger.error(f"ffprobe error for {file_path}: {e}")
        return None


def fetch_channel_videos_ytdlp(channel_url):
    """Fetch all video metadata from a channel using yt-dlp library.

    Uses extract_flat to get metadata without downloading.
    No API quota limits!
    """
    logger.info(f"Fetching channel metadata: {channel_url}")

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'ignoreerrors': True,
    }

    # Add cookies if configured
    cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
    if os.path.exists(cookies_path) and os.path.getsize(cookies_path) > 0:
        ydl_opts['cookiefile'] = cookies_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(channel_url, download=False)

            if not info:
                return None, "Failed to fetch channel info"

            videos = []
            channel_info = None

            entries = info.get('entries', [])
            for entry in entries:
                if not entry:
                    continue

                # Extract channel info from first video
                if not channel_info and entry.get('channel'):
                    channel_info = {
                        'channel_id': entry.get('channel_id'),
                        'channel_title': entry.get('channel'),
                        'channel_url': channel_url,
                    }

                videos.append({
                    'id': entry.get('id'),
                    'title': entry.get('title'),
                    'duration': entry.get('duration'),
                    'upload_date': entry.get('upload_date'),
                })

            logger.info(f"Fetched {len(videos)} videos from channel")

            return {
                'channel_info': channel_info,
                'videos': videos,
            }, None

    except Exception as e:
        logger.error(f"yt-dlp error: {e}")
        return None, str(e)


def normalize_title(title):
    """Normalize title for comparison.

    - Lowercase
    - Convert underscores/hyphens/dots to spaces (common filename separators)
    - Remove all other special chars (!, ?, ', etc.)
    - Collapse multiple spaces
    """
    if not title:
        return ''
    normalized = title.lower()
    # Convert common filename separators to spaces
    normalized = re.sub(r'[_\-\.]', ' ', normalized)
    # Remove all other special chars
    normalized = re.sub(r'[^\w\s]', '', normalized)
    # Collapse multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized.strip()


def titles_match(filename_title, video_title):
    """Check if titles match after normalizing case and whitespace.

    Handles: "JOE wants some food" == "joe wants some food"
    Does NOT handle extra words like "(Official Video)" - those need manual review.
    """
    if not filename_title or not video_title:
        return False

    norm_file = normalize_title(filename_title)
    norm_video = normalize_title(video_title)

    if not norm_file or not norm_video:
        return False

    return norm_file == norm_video


def titles_match_fuzzy(filename_title, video_title, threshold=0.90):
    """Check if titles match with fuzzy matching (90% similarity by default).

    Handles minor differences like:
    - "dont" vs "don't"
    - Extra spaces
    - An extra letter
    - Minor typos

    Returns (is_match, similarity_ratio)
    """
    if not filename_title or not video_title:
        return False, 0.0

    norm_file = normalize_title(filename_title)
    norm_video = normalize_title(video_title)

    if not norm_file or not norm_video:
        return False, 0.0

    # Use SequenceMatcher for fuzzy comparison
    ratio = SequenceMatcher(None, norm_file, norm_video).ratio()

    return ratio >= threshold, ratio


def identify_video_by_id(video_id):
    """Get video metadata directly using yt-dlp library.

    Args:
        video_id: YouTube video ID (11 characters)

    Returns:
        dict with video info including channel, or None if not found
    """
    logger.info(f"Looking up video by ID: {video_id}")

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
    }

    # Add cookies if available
    cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
    if os.path.exists(cookies_path) and os.path.getsize(cookies_path) > 0:
        ydl_opts['cookiefile'] = cookies_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            url = f'https://youtube.com/watch?v={video_id}'
            data = ydl.extract_info(url, download=False)

            if not data:
                return None

            video_id = data.get('id')
            return {
                'id': video_id,
                'title': data.get('title'),
                'duration': data.get('duration'),
                'channel_id': data.get('channel_id'),
                'channel_title': data.get('channel') or data.get('uploader'),
                'channel_url': f"https://youtube.com/channel/{data.get('channel_id')}",
                'upload_date': data.get('upload_date'),
                'thumb_url': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
            }
    except Exception as e:
        logger.error(f"Failed to identify video {video_id}: {e}")
        return None


def _execute_youtube_search(search_query, num_results=20):
    """Execute a YouTube search via yt-dlp library."""
    logger.info(f"Searching YouTube for: {search_query}")

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,  # Don't download, just get metadata
        'ignoreerrors': True,
    }

    # Add cookies if available
    cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
    if os.path.exists(cookies_path) and os.path.getsize(cookies_path) > 0:
        ydl_opts['cookiefile'] = cookies_path

    results = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            search_url = f'ytsearch{num_results}:{search_query}'
            info = ydl.extract_info(search_url, download=False)

            if info and 'entries' in info:
                for entry in info['entries']:
                    if entry:  # Some entries might be None
                        results.append({
                            'id': entry.get('id'),
                            'title': entry.get('title'),
                            'duration': entry.get('duration'),
                            'channel_id': entry.get('channel_id'),
                            'channel_title': entry.get('channel') or entry.get('uploader'),
                            'uploader_id': entry.get('uploader_id'),  # @handle
                            'upload_date': entry.get('upload_date'),
                        })
    except Exception as e:
        logger.error(f"YouTube search error: {e}")
        return []

    return results


def search_video_by_title(title, expected_duration=None, known_channel_ids=None, known_channel_handles=None, num_results=20):
    """Search YouTube for a video by title using yt-dlp.

    Args:
        title: Video title to search for
        expected_duration: Expected duration in seconds (for matching)
        known_channel_ids: Set of channel IDs (UC...) to prioritize
        known_channel_handles: Set of @handles to prioritize (lowercase)
        num_results: Number of search results to fetch

    Returns:
        list of matching videos, best matches first
    """
    if known_channel_ids is None:
        known_channel_ids = set()
    if known_channel_handles is None:
        known_channel_handles = set()
    try:
        # Clean up title for search - keep most chars, just normalize separators
        # YouTube handles special chars fine, only remove things that break shell/URLs
        search_query = re.sub(r'[_\-\.]', ' ', title)  # Treat these as word separators
        search_query = re.sub(r'[\"\`]', '', search_query)  # Remove quotes that break shell
        search_query = re.sub(r'\s+', ' ', search_query).strip()

        # Normalize the original title for comparison
        normalized_filename = normalize_title(title)

        # Search YouTube (unquoted for broader results)
        raw_results = _execute_youtube_search(search_query, num_results)

        # If no results, try with first 5 words only
        if not raw_results:
            words = search_query.split()[:5]
            if len(words) >= 2:
                short_query = ' '.join(words)
                logger.info(f"No results, trying shorter query: {short_query}")
                raw_results = _execute_youtube_search(short_query, num_results)

        if not raw_results:
            return []

        # Process results and check both title and duration matches
        matches = []
        for data in raw_results:
            video_duration = data.get('duration')
            video_title = data.get('title', '')
            normalized_video_title = normalize_title(video_title)

            # Check if channel matches our known channels (from channels.txt)
            channel_match = False
            uploader_id = data.get('uploader_id', '')  # e.g. "@AtomicShrimp"

            # Check by channel ID (UC...)
            if data.get('channel_id') and data['channel_id'] in known_channel_ids:
                channel_match = True

            # Check by @handle
            if uploader_id and uploader_id.lower() in known_channel_handles:
                channel_match = True

            # Calculate duration difference for sorting
            duration_diff = abs(video_duration - expected_duration) if expected_duration and video_duration else 999

            match_info = {
                'id': data['id'],
                'title': video_title,
                'duration': video_duration,
                'channel_id': data['channel_id'],
                'channel_title': data['channel_title'],
                'uploader_id': uploader_id,
                'upload_date': data.get('upload_date'),
                'match_type': 'search',
                'duration_match': False,
                'duration_diff': duration_diff,
                'title_match': False,
                'title_match_fuzzy': False,
                'title_similarity': 0.0,
                'channel_match': channel_match,
            }

            # Check title match (exact after normalization)
            if titles_match(title, video_title):
                match_info['title_match'] = True
                match_info['title_match_fuzzy'] = True
                match_info['title_similarity'] = 1.0
                match_info['match_type'] = 'search+title'
                logger.info(f"Title match found: '{normalized_filename}' ~ '{normalized_video_title}'")
            else:
                # Check fuzzy title match (90%+ similarity)
                is_fuzzy_match, similarity = titles_match_fuzzy(title, video_title)
                match_info['title_similarity'] = similarity
                if is_fuzzy_match:
                    match_info['title_match_fuzzy'] = True
                    match_info['match_type'] = 'search+title_fuzzy'
                    logger.info(f"Fuzzy title match found: '{normalized_filename}' ~ '{normalized_video_title}' ({similarity:.1%})")

            # Check duration match (allow 3 second tolerance for encoding differences)
            if expected_duration and video_duration:
                if abs(video_duration - expected_duration) <= 3:
                    match_info['duration_match'] = True
                    if match_info['title_match']:
                        match_info['match_type'] = 'search+title+duration'
                    else:
                        match_info['match_type'] = 'search+duration'
                    logger.info(f"Duration match found: {video_duration} ~= {expected_duration} (diff: {abs(video_duration - expected_duration)}s)")

            matches.append(match_info)

            # Log first result for debugging
            if len(matches) == 1:
                logger.info(f"First result - YT title: '{video_title}', normalized: '{normalized_video_title}'")
                logger.info(f"Expected - File title: '{title}', normalized: '{normalized_filename}'")
                logger.info(f"Duration - YT: {video_duration}, Local: {expected_duration}")

        # Sort priority: channel+title+duration > channel+title > channel+duration > title+duration > title > duration > other
        # Channel match is a strong signal when combined with title or duration
        def sort_key(x):
            channel = x.get('channel_match', False)
            title = x.get('title_match', False)
            duration = x.get('duration_match', False)

            if channel and title and duration:
                return (0,)  # Best: all three match
            elif channel and title:
                return (1,)  # Channel + title
            elif channel and duration:
                return (2,)  # Channel + duration
            elif title and duration:
                return (3,)  # Title + duration (no channel)
            elif channel:
                return (4,)  # Channel only
            elif title:
                return (5,)  # Title only
            elif duration:
                return (6,)  # Duration only
            else:
                return (7,)  # No matches

        matches.sort(key=sort_key)

        channel_matches = sum(1 for m in matches if m.get('channel_match'))
        title_matches = sum(1 for m in matches if m['title_match'])
        duration_matches = sum(1 for m in matches if m['duration_match'])
        logger.info(f"Found {len(matches)} results: {channel_matches} channel, {title_matches} title, {duration_matches} duration matches")
        return matches

    except subprocess.TimeoutExpired:
        logger.error("YouTube search timed out")
        return []
    except Exception as e:
        logger.error(f"YouTube search error: {e}")
        return []


def find_match(file_path, filename, local_duration, channel_videos):
    """Match a file to channel videos.

    Priority:
    1. Filename is video ID (11 chars, alphanumeric + dash + underscore)
    2. Title + exact duration match
    3. Exact duration only (may have multiple)
    """
    name = os.path.splitext(filename)[0]

    # Method 1: Filename is video ID (exactly 11 characters)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', name):
        for video in channel_videos:
            if video['id'] == name:
                return [video], 'id'
        # ID format but not found in channel
        return [], 'id_not_found'

    # Method 2 + 3: Title and/or duration matching
    file_title = normalize_title(name)
    matches = []

    for video in channel_videos:
        video_duration = video.get('duration')

        # Exact duration match required
        if video_duration is not None and local_duration is not None:
            if video_duration == local_duration:
                video_title = normalize_title(video.get('title', ''))
                if file_title and video_title and file_title == video_title:
                    matches.append((video, 'title+duration'))
                else:
                    matches.append((video, 'duration'))

    # Prioritize title+duration matches
    title_matches = [m for m in matches if m[1] == 'title+duration']
    if title_matches:
        return [m[0] for m in title_matches], 'title+duration'

    # Fall back to duration-only matches
    duration_matches = [m[0] for m in matches if m[1] == 'duration']
    return duration_matches, 'duration' if duration_matches else 'no_match'


def download_thumbnail(video_id, channel_folder):
    """Download thumbnail for a video."""
    thumb_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
    thumb_path = os.path.join(channel_folder, f"{video_id}.jpg")

    try:
        response = http_requests.get(thumb_url, timeout=10)
        if response.status_code == 200:
            with open(thumb_path, 'wb') as f:
                f.write(response.content)
            return thumb_path

        # Try hqdefault if maxres not available
        thumb_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        response = http_requests.get(thumb_url, timeout=10)
        if response.status_code == 200:
            with open(thumb_path, 'wb') as f:
                f.write(response.content)
            return thumb_path

    except Exception as e:
        logger.warning(f"Failed to download thumbnail for {video_id}: {e}")

    return None


def reencode_mkv_to_mp4(input_path, output_path, total_duration=None):
    """Re-encode MKV to web-compatible MP4 with progress tracking.

    Uses ffmpeg's -progress flag to get machine-readable progress,
    updates _import_state with percentage for frontend polling.
    """
    global _import_state

    filename = os.path.basename(input_path)

    args = [
        'ffmpeg', '-y',
        '-i', input_path,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-progress', 'pipe:1',  # Machine-readable progress to stdout
        output_path
    ]

    try:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        for line in process.stdout:
            if line.startswith('out_time_ms='):
                try:
                    current_ms = int(line.split('=')[1])
                    current_sec = current_ms / 1000000  # Microseconds to seconds
                    if total_duration and total_duration > 0:
                        percent = min(99, int((current_sec / total_duration) * 100))
                        _import_state['message'] = f"Encoding: {filename} ({percent}%)"
                        _import_state['encode_progress'] = percent
                except ValueError:
                    pass

        process.wait()

        if process.returncode != 0:
            stderr = process.stderr.read()
            logger.error(f"FFmpeg error: {stderr}")
            return False

        _import_state['encode_progress'] = 100
        return True

    except Exception as e:
        logger.error(f"Re-encoding failed: {e}")
        return False


def execute_import(file_path, video_info, channel_info, match_type):
    """Execute the import for a single file.

    1. Create/get channel in database
    2. Rename file to {video_id}.{ext}
    3. Copy to channel folder
    4. Download thumbnail
    5. Add to database
    6. Delete from import folder
    """
    global _session_factory, _import_state

    video_id = video_info['id']
    filename = os.path.basename(file_path)
    ext = os.path.splitext(filename)[1]

    logger.info(f"execute_import called: file_path={file_path}, video_id={video_id}, match_type={match_type}")

    # Check if MKV needs re-encoding
    if ext.lower() == '.mkv':
        reencode_enabled = _settings_manager.get('import_reencode_mkv', 'false') == 'true'
        include_mkv_override = _import_state.get('include_mkv_override', False)
        if reencode_enabled or include_mkv_override:
            mp4_path = file_path.rsplit('.', 1)[0] + '.mp4'

            # Get duration for progress tracking (video_info has it from identify phase)
            total_duration = video_info.get('duration') or get_video_duration(file_path)

            # Set encoding state for frontend
            _import_state['status'] = 'encoding'
            _import_state['encode_progress'] = 0
            _import_state['message'] = f"Encoding: {filename} (0%)"
            logger.info(f"Re-encoding MKV to MP4: {filename} (duration: {total_duration}s)")

            if reencode_mkv_to_mp4(file_path, mp4_path, total_duration):
                os.remove(file_path)  # Delete original MKV
                file_path = mp4_path
                ext = '.mp4'
                _import_state['status'] = 'importing'
                _import_state['encode_progress'] = None
                logger.info(f"Re-encoding complete: {mp4_path}")
            else:
                _import_state['status'] = 'idle'
                _import_state['encode_progress'] = None
                raise ValueError(f"Failed to re-encode MKV file: {filename}")

    with get_session(_session_factory) as session:
        # Sanitize channel title for folder name (Windows-safe)
        safe_title = sanitize_folder_name(channel_info['channel_title'])

        # Get or create channel
        channel = session.query(Channel).filter(
            Channel.yt_id == channel_info['channel_id']
        ).first()

        if not channel:
            # Create channel but immediately soft-delete it
            # This way videos appear in Library but channel doesn't show in Channels tab
            channel = Channel(
                yt_id=channel_info['channel_id'],
                title=channel_info['channel_title'],
                folder_name=safe_title,
                deleted_at=datetime.now(timezone.utc),  # Soft-delete immediately
            )
            session.add(channel)
            session.commit()
            logger.info(f"Created soft-deleted channel for import: {channel_info['channel_title']}")

        # Ensure channel thumbnail exists
        downloads_folder = get_downloads_folder()
        if not channel.thumbnail:
            thumb_path = ensure_channel_thumbnail(channel_info['channel_id'], downloads_folder)
            if thumb_path:
                channel.thumbnail = thumb_path
                session.commit()
                logger.info(f"Downloaded channel thumbnail for {channel_info['channel_title']}")

        # Create channel folder with proper permissions
        channel_folder = os.path.join(downloads_folder, channel.folder_name)
        makedirs_777(channel_folder)

        # New file path
        new_filename = f"{video_id}{ext}"
        new_file_path = os.path.join(channel_folder, new_filename)

        # Copy file (don't move yet - in case of error)
        shutil.copy2(file_path, new_file_path)

        # Download thumbnail locally
        download_thumbnail(video_id, channel_folder)

        # Get upload date (keep as string in YYYYMMDD format)
        upload_date = video_info.get('upload_date')

        # Store local relative path for thumb_url (e.g., "ChannelFolder/videoId.jpg")
        thumb_url = f"{channel.folder_name}/{video_id}.jpg"

        # Check if video already exists
        existing = session.query(Video).filter(Video.yt_id == video_id).first()
        if existing:
            logger.warning(f"Video {video_id} already exists in database")
            # Update to library status if not already
            if existing.status != 'library':
                existing.status = 'library'
                existing.file_path = new_file_path
                existing.file_size_bytes = os.path.getsize(new_file_path)
                existing.thumb_url = thumb_url
                session.commit()
            # Remove source file
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Removed source file: {file_path}")
                else:
                    logger.warning(f"Source file not found for removal: {file_path}")
            except OSError as e:
                logger.error(f"Failed to remove source file {file_path}: {e}")
            return True, existing.id

        # Create video record
        video = Video(
            yt_id=video_id,
            title=video_info['title'],
            channel_id=channel.id,
            status='library',
            file_path=new_file_path,
            file_size_bytes=os.path.getsize(new_file_path),
            duration_sec=video_info.get('duration', 0),
            upload_date=upload_date,
            thumb_url=thumb_url,
            downloaded_at=datetime.now(timezone.utc),
        )

        session.add(video)
        session.commit()

        # Remove source file from import folder
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Removed source file: {file_path}")
            else:
                logger.warning(f"Source file not found for removal: {file_path}")
        except OSError as e:
            logger.error(f"Failed to remove source file {file_path}: {e}")

        logger.info(f"Imported: {video_info['title']} ({video_id}) via {match_type}")

        return True, video.id


# =============================================================================
# API Endpoints
# =============================================================================

@import_bp.route('/api/import/scan', methods=['GET'])
def scan_folder():
    """Scan import folder and return file list.

    Query params:
        include_mkv: 'true' to include MKVs regardless of setting (session override)
    """
    global _import_state

    # Check for session-level MKV include override
    include_mkv_override = request.args.get('include_mkv', 'false').lower() == 'true'

    result = scan_import_folder(include_mkv_override=include_mkv_override)

    # Extract channel identifiers from URLs (handles, IDs, custom names)
    # We'll match against these when checking search results
    known_channel_ids = set()  # UC... IDs
    known_channel_handles = set()  # @handles (lowercase for comparison)

    for url in result.get('csv_channels', []):
        url_lower = url.lower()
        # Extract @handle
        handle_match = re.search(r'/@([a-zA-Z0-9_-]+)', url)
        if handle_match:
            known_channel_handles.add('@' + handle_match.group(1).lower())

        # Extract channel ID
        id_match = re.search(r'/channel/(UC[a-zA-Z0-9_-]{22})', url)
        if id_match:
            known_channel_ids.add(id_match.group(1))

        # Extract /c/name or /user/name
        c_match = re.search(r'/(?:c|user)/([a-zA-Z0-9_-]+)', url)
        if c_match:
            known_channel_handles.add(c_match.group(1).lower())

    logger.info(f"Found {len(known_channel_ids)} channel IDs and {len(known_channel_handles)} handles from {len(result.get('csv_channels', []))} URLs")

    # Reset import state
    _import_state = {
        'channels': [],
        'files': result['files'],
        'pending': [],
        'imported': [],
        'skipped': [],
        'failed': [],
        'known_channel_ids': known_channel_ids,
        'known_channel_handles': known_channel_handles,
        'current_channel_idx': 0,
        'status': 'idle',
        'progress': 0,
        'message': '',
        'encode_progress': None,
        'encode_queue': [],
        'encode_current': None,
        'include_mkv_override': include_mkv_override,  # Session-level MKV re-encode override
    }

    return jsonify(result)


@import_bp.route('/api/import/upload', methods=['POST'])
def upload_import_file():
    """Upload a video file to the import folder.

    Accepts multipart form data with a 'file' field.
    Returns the saved filename and size.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Get MKV re-encode setting
    reencode_mkv = _settings_manager.get('import_reencode_mkv', 'false') == 'true'
    allowed_extensions = VIDEO_EXTENSIONS | ({MKV_EXTENSION} if reencode_mkv else set())

    # Check extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        # Specific message for MKV files
        if ext == '.mkv':
            return jsonify({
                'error': "MKV files need to be re-encoded for web playback. Go to Settings and enable 'Re-encode MKVs for web'."
            }), 400
        return jsonify({
            'error': f'Invalid file type: {ext}. Supported: {", ".join(sorted(allowed_extensions))}'
        }), 400

    # Save to import folder
    import_folder = get_import_folder()
    safe_filename_str = secure_filename(file.filename)

    # If secure_filename strips everything (e.g., non-ASCII), use a fallback
    if not safe_filename_str:
        safe_filename_str = f'upload_{datetime.now().strftime("%Y%m%d_%H%M%S")}{ext}'

    filepath = os.path.join(import_folder, safe_filename_str)

    # Handle duplicate filenames
    base, file_ext = os.path.splitext(safe_filename_str)
    counter = 1
    while os.path.exists(filepath):
        safe_filename_str = f"{base}_{counter}{file_ext}"
        filepath = os.path.join(import_folder, safe_filename_str)
        counter += 1

    try:
        file.save(filepath)
        # Set permissions (Unix only - no-op on Windows)
        if os.name != 'nt':
            os.chmod(filepath, 0o777)
        file_size = os.path.getsize(filepath)
        logger.info(f"Uploaded file to import folder: {safe_filename_str} ({file_size} bytes)")

        return jsonify({
            'success': True,
            'filename': safe_filename_str,
            'size': file_size
        })
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        return jsonify({'error': f'Failed to save file: {str(e)}'}), 500


def _process_single_file(file_info, mode, known_channel_ids, known_channel_handles):
    """Process a single file for identification (used by ThreadPoolExecutor).

    Returns a dict with 'type' (identified/pending/failed) and the result data.
    """
    file_path = file_info['path']
    filename = file_info['name']
    file_size = file_info.get('size', 0)
    name_without_ext = os.path.splitext(filename)[0]

    # Get local file duration
    local_duration = get_video_duration(file_path)

    # Method 1: Filename is video ID (11 chars)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', name_without_ext):
        logger.info(f"Identifying by video ID: {name_without_ext}")
        video_info = identify_video_by_id(name_without_ext)

        if video_info:
            return {
                'type': 'identified',
                'data': {
                    'file': file_path,
                    'filename': filename,
                    'file_size': file_size,
                    'video': video_info,
                    'match_type': 'video_id',
                    'channel_info': {
                        'channel_id': video_info['channel_id'],
                        'channel_title': video_info['channel_title'],
                        'channel_url': video_info.get('channel_url', f"https://youtube.com/channel/{video_info['channel_id']}"),
                    },
                }
            }
        else:
            return {
                'type': 'failed',
                'data': {
                    'file': file_path,
                    'filename': filename,
                    'file_size': file_size,
                    'reason': 'Video ID not found on YouTube',
                    'reason_code': 'id_not_found',
                }
            }

    # Method 2: Search by title
    logger.info(f"=== Processing file: {filename} ===")
    logger.info(f"Title to search: '{name_without_ext}'")
    logger.info(f"Local duration: {local_duration} seconds")

    search_results = search_video_by_title(
        name_without_ext,
        expected_duration=local_duration,
        known_channel_ids=known_channel_ids,
        known_channel_handles=known_channel_handles
    )

    if not search_results:
        logger.warning(f"No search results found for: {name_without_ext}")
        return {
            'type': 'failed',
            'data': {
                'file': file_path,
                'filename': filename,
                'file_size': file_size,
                'reason': 'No search results found on YouTube',
                'reason_code': 'no_results',
            }
        }

    logger.info(f"Got {len(search_results)} search results")

    # Check for matches
    channel_title_duration = [r for r in search_results if r.get('channel_match') and r.get('title_match') and r.get('duration_match')]
    title_duration = [r for r in search_results if r.get('title_match') and r.get('duration_match')]

    # Determine if we should auto-import based on mode
    best_match = None
    match_type = None
    should_auto_import = False

    if mode == 'auto':
        if len(channel_title_duration) == 1:
            best_match = channel_title_duration[0]
            match_type = 'channel+title+duration'
            should_auto_import = True
        elif len(title_duration) == 1:
            best_match = title_duration[0]
            match_type = 'title+duration'
            should_auto_import = True

    if should_auto_import and best_match:
        logger.info(f"AUTO-IDENTIFIED: '{filename}' -> '{best_match.get('title')}' (match_type={match_type})")
        return {
            'type': 'identified',
            'data': {
                'file': file_path,
                'filename': filename,
                'file_size': file_size,
                'video': best_match,
                'match_type': match_type,
                'channel_info': {
                    'channel_id': best_match['channel_id'],
                    'channel_title': best_match['channel_title'],
                    'channel_url': f"https://youtube.com/channel/{best_match['channel_id']}",
                },
            }
        }
    else:
        # Need user review
        viable_matches = [r for r in search_results if r.get('duration_match') and r.get('title_match_fuzzy')]

        if viable_matches:
            viable_matches.sort(key=lambda x: (x.get('duration_diff', 999), -x.get('title_similarity', 0)))
            logger.info(f"PENDING: '{filename}' - {mode} mode, {len(viable_matches)} viable options")
            return {
                'type': 'pending',
                'data': {
                    'file': file_path,
                    'filename': filename,
                    'file_size': file_size,
                    'matches': viable_matches[:5],
                    'match_type': 'multiple',
                    'local_duration': local_duration,
                }
            }
        else:
            # Build enhanced failed data with closest match info
            best_result = search_results[0] if search_results else None
            closest_match = None

            if best_result:
                best_similarity = best_result.get('title_similarity', 0)
                best_duration = best_result.get('duration')
                duration_diff = abs(best_duration - local_duration) if best_duration and local_duration else None

                closest_match = {
                    'title': best_result.get('title'),
                    'video_id': best_result.get('id'),
                    'duration': best_duration,
                    'local_duration': local_duration,
                    'duration_diff': duration_diff,
                    'similarity': round(best_similarity * 100),
                }
                reason = f'No match found. Best: "{best_result.get("title", "")[:40]}..." ({best_similarity:.0%} similar)'
            else:
                reason = 'No search results found on YouTube'

            logger.warning(f"FAILED: '{filename}' - no videos match both duration AND title")
            return {
                'type': 'failed',
                'data': {
                    'file': file_path,
                    'filename': filename,
                    'file_size': file_size,
                    'reason': reason,
                    'reason_code': 'no_match',
                    'closest_match': closest_match,
                }
            }


@import_bp.route('/api/import/smart-identify', methods=['POST'])
def smart_identify():
    """Identify videos directly without scanning channels.

    This is MUCH faster than channel-by-channel scanning.
    Uses yt-dlp with PARALLEL lookups (3 at a time) to either:
    1. Get video info directly (if filename is video ID)
    2. Search YouTube by title and match by duration

    Modes:
    - 'auto': Auto-import confident matches (video_id, or title+duration)
    - 'manual': User reviews all matches (except video_id which is 100%)

    Returns ready-to-import matches.
    """
    global _import_state

    # Get mode from request
    data = request.get_json() or {}
    mode = data.get('mode', 'auto')  # 'auto' or 'manual'
    logger.info(f"Smart identify starting in {mode.upper()} mode with PARALLEL processing")

    if not _import_state['files']:
        return jsonify({'error': 'No files to identify. Run scan first.'}), 400

    identified = []
    pending = []
    failed = []

    known_channel_ids = _import_state.get('known_channel_ids', set())
    known_channel_handles = _import_state.get('known_channel_handles', set())
    logger.info(f"Known channels from channels.txt: {len(known_channel_ids)} IDs, {len(known_channel_handles)} handles")

    # Process files in parallel (3 at a time)
    with ThreadPoolExecutor(max_workers=3) as executor:
        # Submit all files for processing
        future_to_file = {
            executor.submit(
                _process_single_file,
                file_info,
                mode,
                known_channel_ids,
                known_channel_handles
            ): file_info
            for file_info in _import_state['files']
        }

        # Collect results as they complete
        for future in as_completed(future_to_file):
            file_info = future_to_file[future]
            try:
                result = future.result()
                if result['type'] == 'identified':
                    identified.append(result['data'])
                elif result['type'] == 'pending':
                    pending.append(result['data'])
                else:  # failed
                    failed.append(result['data'])
            except Exception as e:
                logger.error(f"Error processing {file_info['name']}: {e}")
                failed.append({
                    'file': file_info['path'],
                    'filename': file_info['name'],
                    'file_size': file_info.get('size', 0),
                    'reason': f'Processing error: {str(e)}',
                    'reason_code': 'processing_error',
                })

    # Update import state
    _import_state['pending'] = pending

    return jsonify({
        'identified': identified,
        'pending': pending,
        'failed': failed,
        'summary': {
            'total': len(_import_state['files']),
            'identified': len(identified),
            'pending': len(pending),
            'failed': len(failed),
        }
    })


@import_bp.route('/api/import/execute-smart', methods=['POST'])
def execute_smart_import():
    """Execute import for smart-identified files.

    Expects matches from smart-identify endpoint.

    For MKV files: queues for background encoding (non-blocking)
    For other files: imports directly (blocking)
    """
    global _import_state

    _ensure_state_keys()

    data = request.json
    matches = data.get('matches', [])

    if not matches:
        return jsonify({'error': 'No matches to import'}), 400

    results = []
    queued_for_encoding = 0

    # Check if MKV re-encoding is enabled
    reencode_enabled = _settings_manager.get('import_reencode_mkv', 'false') == 'true'
    include_mkv_override = _import_state.get('include_mkv_override', False)
    allow_mkv = reencode_enabled or include_mkv_override

    for match in matches:
        file_path = match['file']
        filename = match.get('filename', os.path.basename(file_path))
        ext = os.path.splitext(filename)[1].lower()
        video_info = match['video']
        channel_info = match['channel_info']
        match_type = match.get('match_type', 'smart')

        # Check if this is an MKV that needs encoding
        if ext == '.mkv' and allow_mkv:
            # Queue for background encoding instead of blocking
            logger.info(f"Queuing MKV for background encoding: {filename}")
            _queue_for_encoding({
                'file': file_path,
                'filename': filename,
                'file_size': match.get('file_size', 0),
                'video': video_info,
                'channel_info': channel_info,
                'match_type': match_type,
            })
            queued_for_encoding += 1
            results.append({
                'file': filename,
                'success': True,
                'queued': True,  # Indicates queued for encoding, not yet imported
            })
        else:
            # Import non-MKV files directly
            try:
                success, video_id = execute_import(
                    file_path, video_info, channel_info, match_type
                )

                if success:
                    _import_state['imported'].append({
                        'file': file_path,
                        'filename': filename,
                        'video': video_info,
                        'match_type': match_type,
                        'channel': channel_info['channel_title'],
                    })
                    results.append({
                        'file': filename,
                        'success': True,
                        'video_id': video_id,
                    })
                else:
                    results.append({
                        'file': filename,
                        'success': False,
                        'error': 'Import failed',
                    })
            except Exception as e:
                logger.error(f"Smart import error for {file_path}: {e}")
                results.append({
                    'file': filename,
                    'success': False,
                    'error': str(e),
                })

    return jsonify({
        'results': results,
        'imported_count': len([r for r in results if r.get('success') and not r.get('queued')]),
        'queued_count': queued_for_encoding,
    })


@import_bp.route('/api/import/add-channel', methods=['POST'])
def add_channel():
    """Add a channel URL to process."""
    global _import_state

    data = request.json
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Channel URL is required'}), 400

    # Check if already added
    for ch in _import_state['channels']:
        if ch.get('url') == url:
            return jsonify({'error': 'Channel already added'}), 400

    _import_state['channels'].append({
        'url': url,
        'channel_info': None,
        'videos': [],
        'status': 'pending',
    })

    return jsonify({
        'success': True,
        'channels': _import_state['channels'],
    })


@import_bp.route('/api/import/set-channels', methods=['POST'])
def set_channels():
    """Set multiple channel URLs (from CSV or manual input)."""
    global _import_state

    data = request.json
    urls = data.get('urls', [])

    _import_state['channels'] = []

    for url in urls:
        url = url.strip()
        if url and not url.startswith('#'):
            _import_state['channels'].append({
                'url': url,
                'channel_info': None,
                'videos': [],
                'status': 'pending',
            })

    return jsonify({
        'success': True,
        'channels': _import_state['channels'],
    })


@import_bp.route('/api/import/fetch-channel', methods=['POST'])
def fetch_channel():
    """Fetch video metadata from a channel."""
    global _import_state

    data = request.json
    channel_idx = data.get('channel_idx', 0)

    if channel_idx >= len(_import_state['channels']):
        return jsonify({'error': 'Invalid channel index'}), 400

    channel = _import_state['channels'][channel_idx]
    channel['status'] = 'fetching'
    _import_state['status'] = 'fetching'
    _import_state['message'] = f"Fetching metadata for channel..."

    result, error = fetch_channel_videos_ytdlp(channel['url'])

    if error:
        channel['status'] = 'error'
        channel['error'] = error
        return jsonify({'error': error}), 400

    channel['channel_info'] = result['channel_info']
    channel['videos'] = result['videos']
    channel['status'] = 'ready'

    _import_state['status'] = 'idle'
    _import_state['message'] = ''

    return jsonify({
        'success': True,
        'channel_info': result['channel_info'],
        'video_count': len(result['videos']),
    })


@import_bp.route('/api/import/match', methods=['POST'])
def match_files():
    """Match files against channel videos."""
    global _import_state

    data = request.json
    channel_idx = data.get('channel_idx', 0)

    if channel_idx >= len(_import_state['channels']):
        return jsonify({'error': 'Invalid channel index'}), 400

    channel = _import_state['channels'][channel_idx]

    if not channel.get('videos'):
        return jsonify({'error': 'Channel videos not fetched'}), 400

    _import_state['status'] = 'matching'
    _import_state['message'] = 'Matching files...'

    # Get remaining files (not yet imported or pending)
    imported_files = {item['file'] for item in _import_state['imported']}
    pending_files = {item['file'] for item in _import_state['pending']}

    remaining_files = [
        f for f in _import_state['files']
        if f['path'] not in imported_files and f['path'] not in pending_files
    ]

    matches = []
    new_pending = []
    new_skipped = []

    for file_info in remaining_files:
        file_path = file_info['path']
        filename = file_info['name']

        # Get local duration
        local_duration = get_video_duration(file_path)

        # Find matches
        matched_videos, match_type = find_match(
            file_path, filename, local_duration, channel['videos']
        )

        if len(matched_videos) == 1:
            # Single match - can auto-import
            matches.append({
                'file': file_path,
                'filename': filename,
                'video': matched_videos[0],
                'match_type': match_type,
                'channel_idx': channel_idx,
            })
        elif len(matched_videos) > 1:
            # Multiple matches - needs user selection
            new_pending.append({
                'file': file_path,
                'filename': filename,
                'matches': matched_videos,
                'match_type': match_type,
                'channel_idx': channel_idx,
            })
        # If no match, don't add to skipped yet - might match another channel

    _import_state['pending'].extend(new_pending)
    _import_state['status'] = 'idle'
    _import_state['message'] = ''

    return jsonify({
        'matches': matches,
        'pending': new_pending,
        'match_count': len(matches),
        'pending_count': len(new_pending),
    })


@import_bp.route('/api/import/execute', methods=['POST'])
def execute_imports():
    """Execute import for matched files."""
    global _import_state

    data = request.json
    matches = data.get('matches', [])

    if not matches:
        return jsonify({'error': 'No matches to import'}), 400

    _import_state['status'] = 'importing'

    results = []

    for match in matches:
        file_path = match['file']
        video_info = match['video']
        channel_idx = match['channel_idx']
        match_type = match['match_type']

        channel = _import_state['channels'][channel_idx]
        channel_info = channel['channel_info']

        _import_state['message'] = f"Importing: {video_info['title'][:50]}..."

        try:
            success, video_id = execute_import(
                file_path, video_info, channel_info, match_type
            )

            if success:
                _import_state['imported'].append({
                    'file': file_path,
                    'filename': match['filename'],
                    'video': video_info,
                    'match_type': match_type,
                    'channel': channel_info['channel_title'],
                })
                results.append({
                    'file': match['filename'],
                    'success': True,
                    'video_id': video_id,
                })
            else:
                results.append({
                    'file': match['filename'],
                    'success': False,
                    'error': 'Import failed',
                })
        except Exception as e:
            logger.error(f"Import error for {file_path}: {e}")
            results.append({
                'file': match['filename'],
                'success': False,
                'error': str(e),
            })

    _import_state['status'] = 'idle'
    _import_state['message'] = ''

    return jsonify({
        'results': results,
        'imported_count': len([r for r in results if r['success']]),
    })


@import_bp.route('/api/import/resolve', methods=['POST'])
def resolve_pending():
    """Resolve a pending match (user selected which video)."""
    global _import_state

    data = request.json
    file_path = data.get('file')
    video_id = data.get('video_id')
    skip = data.get('skip', False)

    if not file_path:
        return jsonify({'error': 'File path is required'}), 400

    # Find the pending item
    pending_item = None
    pending_idx = None
    for idx, item in enumerate(_import_state['pending']):
        if item['file'] == file_path:
            pending_item = item
            pending_idx = idx
            break

    if not pending_item:
        return jsonify({'error': 'Pending item not found'}), 404

    if skip:
        # User chose to skip
        _import_state['skipped'].append({
            'file': file_path,
            'filename': pending_item['filename'],
            'reason': 'User skipped',
        })
        _import_state['pending'].pop(pending_idx)
        return jsonify({'success': True, 'action': 'skipped'})

    if not video_id:
        return jsonify({'error': 'video_id is required unless skipping'}), 400

    # Find the selected video
    selected_video = None
    for video in pending_item['matches']:
        if video['id'] == video_id:
            selected_video = video
            break

    if not selected_video:
        return jsonify({'error': 'Selected video not found in matches'}), 400

    # Execute import
    channel_idx = pending_item['channel_idx']
    channel = _import_state['channels'][channel_idx]
    channel_info = channel['channel_info']

    try:
        success, db_video_id = execute_import(
            file_path, selected_video, channel_info, 'user_selected'
        )

        if success:
            _import_state['imported'].append({
                'file': file_path,
                'filename': pending_item['filename'],
                'video': selected_video,
                'match_type': 'user_selected',
                'channel': channel_info['channel_title'],
            })
            _import_state['pending'].pop(pending_idx)
            return jsonify({'success': True, 'action': 'imported', 'video_id': db_video_id})
        else:
            return jsonify({'error': 'Import failed'}), 500

    except Exception as e:
        logger.error(f"Import error: {e}")
        return jsonify({'error': str(e)}), 500


@import_bp.route('/api/import/skip-remaining', methods=['POST'])
def skip_remaining():
    """Skip all remaining unmatched files."""
    global _import_state

    # Get all file paths that have been processed
    imported_files = {item['file'] for item in _import_state['imported']}
    pending_files = {item['file'] for item in _import_state['pending']}
    skipped_files = {item['file'] for item in _import_state['skipped']}

    processed = imported_files | pending_files | skipped_files

    # Find unprocessed files
    for file_info in _import_state['files']:
        if file_info['path'] not in processed:
            _import_state['skipped'].append({
                'file': file_info['path'],
                'filename': file_info['name'],
                'reason': 'No match found in any channel',
            })

    return jsonify({'success': True})


@import_bp.route('/api/import/state', methods=['GET'])
def get_state():
    """Get current import state."""
    global _import_state

    return jsonify({
        'status': _import_state['status'],
        'message': _import_state['message'],
        'encode_progress': _import_state.get('encode_progress'),
        'channels': [{
            'url': ch['url'],
            'channel_info': ch.get('channel_info'),
            'video_count': len(ch.get('videos', [])),
            'status': ch.get('status', 'pending'),
        } for ch in _import_state['channels']],
        'files': _import_state['files'],
        'file_count': len(_import_state['files']),
        'imported_count': len(_import_state['imported']),
        'pending_count': len(_import_state['pending']),
        'skipped_count': len(_import_state['skipped']),
        'failed_count': len(_import_state.get('failed', [])),
        'imported': _import_state['imported'],
        'pending': _import_state['pending'],
        'skipped': _import_state['skipped'],
        'failed': _import_state.get('failed', []),
        'encode_queue_count': len(_import_state.get('encode_queue', [])),
        'encode_current': _import_state.get('encode_current'),
    })


@import_bp.route('/api/import/encode-status', methods=['GET'])
def get_encode_status():
    """Get encoding queue status for frontend polling."""
    global _import_state

    _ensure_state_keys()

    with _encode_lock:
        encode_current = _import_state.get('encode_current')
        encode_queue = _import_state.get('encode_queue', [])
        encode_progress = _import_state.get('encode_progress', 0)

        return jsonify({
            'encoding': encode_current is not None,
            'current': {
                'filename': encode_current.get('filename') if encode_current else None,
                'file_size': encode_current.get('file_size', 0) if encode_current else 0,
            } if encode_current else None,
            'progress': encode_progress,
            'queue_count': len(encode_queue),
            'queue': [{
                'filename': item.get('filename'),
                'file_size': item.get('file_size', 0),
            } for item in encode_queue[:5]],  # First 5 in queue
        })


@import_bp.route('/api/import/allowed-extensions', methods=['GET'])
def get_allowed_extensions():
    """Return currently allowed video extensions based on settings."""
    reencode_mkv = _settings_manager.get('import_reencode_mkv', 'false') == 'true'
    extensions = list(VIDEO_EXTENSIONS)
    if reencode_mkv:
        extensions.append(MKV_EXTENSION)
    return jsonify({
        'extensions': sorted(extensions),
        'reencode_mkv': reencode_mkv
    })


@import_bp.route('/api/import/reset', methods=['POST'])
def reset_state():
    """Reset import state."""
    global _import_state

    _import_state = {
        'channels': [],
        'files': [],
        'pending': [],
        'imported': [],
        'skipped': [],
        'failed': [],
        'known_channel_ids': set(),
        'known_channel_handles': set(),
        'current_channel_idx': 0,
        'status': 'idle',
        'progress': 0,
        'message': '',
        'encode_progress': None,
        'encode_queue': [],
        'encode_current': None,
    }

    return jsonify({'success': True})
