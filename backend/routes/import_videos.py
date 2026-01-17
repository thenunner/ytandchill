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
from datetime import datetime
from pathlib import Path
from flask import Blueprint, jsonify, request
import requests

from database import Video, Channel, get_session

logger = logging.getLogger(__name__)

# Create Blueprint
import_bp = Blueprint('import_videos', __name__)

# Module-level references
_session_factory = None
_settings_manager = None

# Supported video extensions
VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.flv'}

# Import state (in-memory for session)
_import_state = {
    'channels': [],  # List of channel info dicts
    'files': [],  # List of file paths
    'pending': [],  # Files needing user selection (multiple matches)
    'imported': [],  # Successfully imported files
    'skipped': [],  # Skipped files with reasons
    'current_channel_idx': 0,
    'status': 'idle',  # idle, fetching, matching, importing, complete
    'progress': 0,
    'message': '',
}


def init_import_routes(session_factory, settings_manager):
    """Initialize the import routes with required dependencies."""
    global _session_factory, _settings_manager
    _session_factory = session_factory
    _settings_manager = settings_manager


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

    # Create if doesn't exist
    os.makedirs(import_folder, exist_ok=True)

    return import_folder


def scan_import_folder():
    """Scan import folder for video files and channels.csv."""
    import_folder = get_import_folder()

    files = []
    csv_channels = []
    csv_found = False

    # Scan for video files
    for filename in os.listdir(import_folder):
        filepath = os.path.join(import_folder, filename)

        if os.path.isfile(filepath):
            ext = os.path.splitext(filename)[1].lower()

            if ext in VIDEO_EXTENSIONS:
                files.append({
                    'name': filename,
                    'path': filepath,
                    'size': os.path.getsize(filepath),
                })
            elif filename.lower() == 'channels.csv':
                csv_found = True
                # Parse CSV (no header - just URLs, one per line)
                with open(filepath, 'r', encoding='utf-8') as f:
                    for line in f:
                        url = line.strip()
                        if url and not url.startswith('#'):
                            csv_channels.append(url)

    return {
        'files': files,
        'count': len(files),
        'csv_found': csv_found,
        'csv_channels': csv_channels,
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
    """Fetch all video metadata from a channel using yt-dlp.

    Uses --flat-playlist to get metadata without downloading.
    No API quota limits!
    """
    try:
        # Build yt-dlp command
        cmd = [
            'yt-dlp',
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            channel_url
        ]

        # Add cookies if configured
        cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
        if os.path.exists(cookies_path):
            cmd.extend(['--cookies', cookies_path])

        logger.info(f"Fetching channel metadata: {channel_url}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout for large channels
        )

        if result.returncode != 0:
            logger.error(f"yt-dlp failed: {result.stderr}")
            return None, result.stderr

        videos = []
        channel_info = None

        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                data = json.loads(line)

                # Extract channel info from first video
                if not channel_info and data.get('channel'):
                    channel_info = {
                        'channel_id': data.get('channel_id'),
                        'channel_title': data.get('channel'),
                        'channel_url': channel_url,
                    }

                videos.append({
                    'id': data.get('id'),
                    'title': data.get('title'),
                    'duration': data.get('duration'),  # seconds
                    'upload_date': data.get('upload_date'),  # YYYYMMDD
                })
            except json.JSONDecodeError:
                continue

        logger.info(f"Fetched {len(videos)} videos from channel")

        return {
            'channel_info': channel_info,
            'videos': videos,
        }, None

    except subprocess.TimeoutExpired:
        logger.error(f"yt-dlp timeout for {channel_url}")
        return None, "Timeout fetching channel data"
    except Exception as e:
        logger.error(f"yt-dlp error: {e}")
        return None, str(e)


def normalize_title(title):
    """Normalize title for comparison."""
    if not title:
        return ''
    # Remove special chars, lowercase, strip whitespace
    return re.sub(r'[^\w\s]', '', title.lower()).strip()


def identify_video_by_id(video_id):
    """Get video metadata directly using yt-dlp.

    Args:
        video_id: YouTube video ID (11 characters)

    Returns:
        dict with video info including channel, or None if not found
    """
    try:
        cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            f'https://youtube.com/watch?v={video_id}'
        ]

        cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
        if os.path.exists(cookies_path):
            cmd.extend(['--cookies', cookies_path])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            return None

        data = json.loads(result.stdout.strip())

        return {
            'id': data.get('id'),
            'title': data.get('title'),
            'duration': data.get('duration'),
            'channel_id': data.get('channel_id'),
            'channel_title': data.get('channel') or data.get('uploader'),
            'channel_url': f"https://youtube.com/channel/{data.get('channel_id')}",
            'upload_date': data.get('upload_date'),
        }
    except Exception as e:
        logger.error(f"Failed to identify video {video_id}: {e}")
        return None


def _execute_youtube_search(search_query, num_results=20):
    """Execute a YouTube search via yt-dlp."""
    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--dump-json',
        '--no-warnings',
        f'ytsearch{num_results}:{search_query}'
    ]

    cookies_path = os.path.join(os.environ.get('DATA_DIR', '/appdata/data'), 'backend', 'cookies.txt')
    if os.path.exists(cookies_path):
        cmd.extend(['--cookies', cookies_path])

    logger.info(f"Searching YouTube for: {search_query}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.returncode != 0:
        logger.error(f"YouTube search failed: {result.stderr}")
        return []

    results = []
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        try:
            data = json.loads(line)
            results.append({
                'id': data.get('id'),
                'title': data.get('title'),
                'duration': data.get('duration'),
                'channel_id': data.get('channel_id'),
                'channel_title': data.get('channel') or data.get('uploader'),
                'upload_date': data.get('upload_date'),
            })
        except json.JSONDecodeError:
            continue

    return results


def search_video_by_title(title, expected_duration=None, num_results=20):
    """Search YouTube for a video by title using yt-dlp.

    Args:
        title: Video title to search for
        expected_duration: Expected duration in seconds (for matching)
        num_results: Number of search results to fetch

    Returns:
        list of matching videos, best matches first
    """
    try:
        # Clean up title for search - keep most chars, just normalize separators
        # YouTube handles special chars fine, only remove things that break shell/URLs
        search_query = re.sub(r'[_\-\.]', ' ', title)  # Treat these as word separators
        search_query = re.sub(r'[\"\`]', '', search_query)  # Remove quotes that break shell
        search_query = re.sub(r'\s+', ' ', search_query).strip()

        # Try full title search first
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

        # Process results and check duration matches
        matches = []
        for data in raw_results:
            video_duration = data.get('duration')

            match_info = {
                'id': data['id'],
                'title': data['title'],
                'duration': video_duration,
                'channel_id': data['channel_id'],
                'channel_title': data['channel_title'],
                'upload_date': data.get('upload_date'),
                'match_type': 'search',
                'duration_match': False,
            }

            # Check duration match (within 5 seconds tolerance for re-encoded videos)
            if expected_duration and video_duration:
                if abs(video_duration - expected_duration) <= 5:
                    match_info['duration_match'] = True
                    match_info['match_type'] = 'search+duration'

            matches.append(match_info)

        # Sort: duration matches first, then by order
        matches.sort(key=lambda x: (not x['duration_match'],))

        logger.info(f"Found {len(matches)} search results, {sum(1 for m in matches if m['duration_match'])} with duration match")
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
        response = requests.get(thumb_url, timeout=10)
        if response.status_code == 200:
            with open(thumb_path, 'wb') as f:
                f.write(response.content)
            return thumb_path

        # Try hqdefault if maxres not available
        thumb_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        response = requests.get(thumb_url, timeout=10)
        if response.status_code == 200:
            with open(thumb_path, 'wb') as f:
                f.write(response.content)
            return thumb_path

    except Exception as e:
        logger.warning(f"Failed to download thumbnail for {video_id}: {e}")

    return None


def execute_import(file_path, video_info, channel_info, match_type):
    """Execute the import for a single file.

    1. Create/get channel in database
    2. Rename file to {video_id}.{ext}
    3. Copy to channel folder
    4. Download thumbnail
    5. Add to database
    6. Delete from import folder
    """
    global _session_factory

    video_id = video_info['id']
    filename = os.path.basename(file_path)
    ext = os.path.splitext(filename)[1]

    with get_session(_session_factory) as session:
        # Get or create channel
        channel = session.query(Channel).filter(
            Channel.channel_id == channel_info['channel_id']
        ).first()

        if not channel:
            # Create channel
            channel = Channel(
                channel_id=channel_info['channel_id'],
                title=channel_info['channel_title'],
                url=channel_info['channel_url'],
            )
            session.add(channel)
            session.commit()
            logger.info(f"Created channel: {channel_info['channel_title']}")

        # Create channel folder
        downloads_folder = get_downloads_folder()
        # Sanitize channel title for folder name
        safe_title = re.sub(r'[<>:"/\\|?*]', '_', channel_info['channel_title'])
        channel_folder = os.path.join(downloads_folder, safe_title)
        os.makedirs(channel_folder, exist_ok=True)

        # New file path
        new_filename = f"{video_id}{ext}"
        new_file_path = os.path.join(channel_folder, new_filename)

        # Copy file (don't move yet - in case of error)
        shutil.copy2(file_path, new_file_path)

        # Download thumbnail
        thumb_path = download_thumbnail(video_id, channel_folder)

        # Parse upload date
        upload_date = None
        if video_info.get('upload_date'):
            try:
                upload_date = datetime.strptime(video_info['upload_date'], '%Y%m%d')
            except ValueError:
                pass

        # Check if video already exists
        existing = session.query(Video).filter(Video.youtube_id == video_id).first()
        if existing:
            logger.warning(f"Video {video_id} already exists in database")
            # Update to library status if not already
            if existing.status != 'library':
                existing.status = 'library'
                existing.file_path = new_file_path
                existing.file_size_bytes = os.path.getsize(new_file_path)
                if thumb_path:
                    existing.thumb_path = thumb_path
                session.commit()
            # Remove source file
            os.remove(file_path)
            return True, existing.id

        # Create video record
        video = Video(
            youtube_id=video_id,
            title=video_info['title'],
            channel_id=channel.id,
            channel_title=channel_info['channel_title'],
            status='library',
            file_path=new_file_path,
            file_size_bytes=os.path.getsize(new_file_path),
            duration_sec=video_info.get('duration'),
            upload_date=upload_date,
            downloaded_at=datetime.utcnow(),
        )

        if thumb_path:
            video.thumb_path = thumb_path

        session.add(video)
        session.commit()

        # Remove source file from import folder
        os.remove(file_path)

        logger.info(f"Imported: {video_info['title']} ({video_id}) via {match_type}")

        return True, video.id


# =============================================================================
# API Endpoints
# =============================================================================

@import_bp.route('/api/import/scan', methods=['GET'])
def scan_folder():
    """Scan import folder and return file list."""
    global _import_state

    result = scan_import_folder()

    # Reset import state
    _import_state = {
        'channels': [],
        'files': result['files'],
        'pending': [],
        'imported': [],
        'skipped': [],
        'current_channel_idx': 0,
        'status': 'idle',
        'progress': 0,
        'message': '',
    }

    return jsonify(result)


@import_bp.route('/api/import/smart-identify', methods=['POST'])
def smart_identify():
    """Identify videos directly without scanning channels.

    This is MUCH faster than channel-by-channel scanning.
    Uses yt-dlp to either:
    1. Get video info directly (if filename is video ID)
    2. Search YouTube by title and match by duration

    Returns ready-to-import matches.
    """
    global _import_state

    if not _import_state['files']:
        return jsonify({'error': 'No files to identify. Run scan first.'}), 400

    results = []
    identified = []
    pending = []  # Multiple matches needing user selection
    failed = []

    for file_info in _import_state['files']:
        file_path = file_info['path']
        filename = file_info['name']
        name_without_ext = os.path.splitext(filename)[0]

        # Get local file duration
        local_duration = get_video_duration(file_path)

        # Method 1: Filename is video ID (11 chars)
        if re.match(r'^[a-zA-Z0-9_-]{11}$', name_without_ext):
            logger.info(f"Identifying by video ID: {name_without_ext}")
            video_info = identify_video_by_id(name_without_ext)

            if video_info:
                identified.append({
                    'file': file_path,
                    'filename': filename,
                    'video': video_info,
                    'match_type': 'video_id',
                    'channel_info': {
                        'channel_id': video_info['channel_id'],
                        'channel_title': video_info['channel_title'],
                        'channel_url': video_info.get('channel_url', f"https://youtube.com/channel/{video_info['channel_id']}"),
                    },
                })
                continue
            else:
                failed.append({
                    'file': file_path,
                    'filename': filename,
                    'reason': 'Video ID not found on YouTube',
                })
                continue

        # Method 2: Search by title
        logger.info(f"Searching by title: {name_without_ext}")
        search_results = search_video_by_title(name_without_ext, expected_duration=local_duration)

        if not search_results:
            failed.append({
                'file': file_path,
                'filename': filename,
                'reason': 'No search results found',
            })
            continue

        # Check for duration matches
        duration_matches = [r for r in search_results if r.get('duration_match')]

        if len(duration_matches) == 1:
            # Single duration match - confident match
            match = duration_matches[0]
            identified.append({
                'file': file_path,
                'filename': filename,
                'video': match,
                'match_type': 'search+duration',
                'channel_info': {
                    'channel_id': match['channel_id'],
                    'channel_title': match['channel_title'],
                    'channel_url': f"https://youtube.com/channel/{match['channel_id']}",
                },
            })
        elif len(duration_matches) > 1:
            # Multiple duration matches - user needs to choose
            pending.append({
                'file': file_path,
                'filename': filename,
                'matches': duration_matches,
                'match_type': 'multiple_duration',
                'local_duration': local_duration,
            })
        elif search_results:
            # No duration match, but have search results - user can choose
            pending.append({
                'file': file_path,
                'filename': filename,
                'matches': search_results[:5],  # Top 5 results
                'match_type': 'search_only',
                'local_duration': local_duration,
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
    """
    global _import_state

    data = request.json
    matches = data.get('matches', [])

    if not matches:
        return jsonify({'error': 'No matches to import'}), 400

    results = []

    for match in matches:
        file_path = match['file']
        video_info = match['video']
        channel_info = match['channel_info']
        match_type = match.get('match_type', 'smart')

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
            logger.error(f"Smart import error for {file_path}: {e}")
            results.append({
                'file': match['filename'],
                'success': False,
                'error': str(e),
            })

    return jsonify({
        'results': results,
        'imported_count': len([r for r in results if r['success']]),
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
        'imported': _import_state['imported'],
        'pending': _import_state['pending'],
        'skipped': _import_state['skipped'],
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
        'current_channel_idx': 0,
        'status': 'idle',
        'progress': 0,
        'message': '',
    }

    return jsonify({'success': True})
