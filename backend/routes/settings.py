"""
Settings and Authentication Routes

Handles:
- GET/PATCH /api/settings
- GET /api/health
- GET /api/logs
- /api/auth/* endpoints
"""

from flask import Blueprint, jsonify, request, session, current_app
from datetime import timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import subprocess
import shutil
import os
import logging
import requests
import yt_dlp
from database import Setting, Video, Channel, get_session
from sqlalchemy import or_
from utils import update_log_level, get_stored_credentials, check_auth_credentials
from youtube_api import test_api_key
import glob
from events import queue_events

logger = logging.getLogger(__name__)

# Create Blueprint
settings_bp = Blueprint('settings', __name__)

# Module-level references to shared dependencies (set by init_settings_routes)
_session_factory = None
_settings_manager = None
_scheduler = None
_download_worker = None


def init_settings_routes(session_factory, settings_manager, scheduler, download_worker):
    """Initialize the settings routes with required dependencies."""
    global _session_factory, _settings_manager, _scheduler, _download_worker
    _session_factory = session_factory
    _settings_manager = settings_manager
    _scheduler = scheduler
    _download_worker = download_worker


# =============================================================================
# Update Check Function
# =============================================================================

def check_for_app_update():
    """
    Check GitHub for the latest version and store it in settings.
    Called at the end of scan operations (auto-scan, channel scan, import, URL scan).
    Returns the latest version string or None on error.
    """
    try:
        response = requests.get(
            'https://api.github.com/repos/thenunner/ytandchill/releases/latest',
            timeout=10,
            headers={'Accept': 'application/vnd.github.v3+json'}
        )
        if response.status_code == 200:
            data = response.json()
            tag_name = data.get('tag_name', '')
            # Remove leading 'v' if present
            latest_version = tag_name.lstrip('v') if tag_name else None
            if latest_version:
                _settings_manager.set('latest_version', latest_version)
                logger.debug(f"Update check: latest version is {latest_version}")
                return latest_version
    except requests.RequestException as e:
        logger.debug(f"Update check failed: {e}")
    except Exception as e:
        logger.debug(f"Update check error: {e}")
    return None


# =============================================================================
# Authentication Helper Functions
# =============================================================================
# get_stored_credentials and check_auth_credentials moved to utils.py to avoid duplication

def is_authenticated():
    """Check if user is logged in via session"""
    return session.get('authenticated', False)


# =============================================================================
# Settings Endpoints
# =============================================================================

# Keys that should never be exposed to the frontend
SENSITIVE_KEYS = {'auth_username', 'auth_password_hash', 'youtube_api_key', 'anthropic_api_key', 'secret_key'}

@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    with get_session(_session_factory) as db_session:
        settings = db_session.query(Setting).all()
        result = {s.key: s.value for s in settings if s.key not in SENSITIVE_KEYS}
        # Add boolean flags for sensitive keys (without exposing actual values)
        api_key = _settings_manager.get('youtube_api_key')
        result['has_youtube_api_key'] = bool(api_key and api_key.strip())
        return jsonify(result)


@settings_bp.route('/api/settings', methods=['PATCH'])
def update_settings():
    data = request.json

    # Track which scheduler actions need to be taken AFTER commit
    needs_enable = False
    needs_disable = False
    needs_reschedule = False

    with get_session(_session_factory) as db_session:
        for key, value in data.items():
            # Handle log level changes separately (update_log_level manages its own DB session)
            if key == 'log_level':
                update_log_level(value)
                continue

            # Check if auto-refresh settings changed BEFORE updating
            if key == 'auto_refresh_enabled':
                current = _settings_manager.get('auto_refresh_enabled', 'false')
                if value != current:
                    if value == 'true':
                        needs_enable = True
                    else:
                        needs_disable = True

            if key == 'auto_refresh_time':
                current = _settings_manager.get('auto_refresh_time')
                if value != current:
                    needs_reschedule = True

            # Check if auto_refresh_config changed (new multi-scan system)
            if key == 'auto_refresh_config':
                current = _settings_manager.get('auto_refresh_config')
                if value != current:
                    needs_reschedule = True

            _settings_manager.set(key, value)

    # Now execute scheduler actions with committed values
    if needs_enable:
        _scheduler.enable()
    elif needs_disable:
        _scheduler.disable()

    # Only reschedule if time changed but we didn't just enable (enable already uses new time)
    if needs_reschedule and not needs_enable:
        _scheduler.reschedule()

    # Broadcast settings change to all SSE clients for instant sync
    queue_events.emit('settings:changed')

    return jsonify({'success': True})


@settings_bp.route('/api/settings/discoveries-flag', methods=['GET'])
def get_discoveries_flag():
    """Check if there are new discoveries that need user attention"""
    flag = _settings_manager.get('new_discoveries_flag', 'false')
    return jsonify({'new_discoveries': flag == 'true'})


@settings_bp.route('/api/settings/discoveries-flag', methods=['DELETE'])
def clear_discoveries_flag():
    """Clear the new discoveries notification flag"""
    _settings_manager.set('new_discoveries_flag', 'false')
    return jsonify({'status': 'ok'})


@settings_bp.route('/api/settings/test-youtube-api', methods=['POST'])
def test_youtube_api_endpoint():
    """Test if the configured YouTube API key is valid"""
    api_key = _settings_manager.get('youtube_api_key')

    if not api_key:
        return jsonify({
            'valid': False,
            'error': 'No YouTube API key configured'
        }), 400

    is_valid, error = test_api_key(api_key)

    if is_valid:
        logger.info("YouTube API key test: valid")
        return jsonify({'valid': True})
    else:
        logger.warning(f"YouTube API key test failed: {error}")
        return jsonify({
            'valid': False,
            'error': error
        }), 400


def _embed_date_metadata(file_path, upload_date):
    """Embed upload date into video file metadata using ffmpeg.

    Args:
        file_path: Path to video file
        upload_date: Date in YYYYMMDD format

    Returns:
        True if successful, False otherwise
    """
    if not file_path or not os.path.exists(file_path):
        return False

    # Convert YYYYMMDD to YYYY-MM-DD for metadata
    try:
        formatted_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    except (IndexError, TypeError):
        return False

    # Find ffmpeg
    ffmpeg_path = shutil.which('ffmpeg') or shutil.which('ffmpeg.exe')
    if not ffmpeg_path:
        logger.warning("ffmpeg not found, cannot embed metadata")
        return False

    # Create temp output path
    base, ext = os.path.splitext(file_path)
    temp_path = f"{base}_temp{ext}"

    try:
        # On Windows, prevent console window from appearing
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        # Use ffmpeg to copy streams and add date metadata
        result = subprocess.run([
            ffmpeg_path, '-y',
            '-i', file_path,
            '-c', 'copy',  # Copy streams without re-encoding
            '-metadata', f'date={formatted_date}',
            '-metadata', f'creation_time={formatted_date}T00:00:00Z',
            temp_path
        ], capture_output=True, timeout=120, startupinfo=startupinfo)

        if result.returncode == 0 and os.path.exists(temp_path):
            # Replace original with updated file
            os.replace(temp_path, file_path)
            return True
        else:
            logger.warning(f"ffmpeg metadata embed failed: {result.stderr.decode()[:200]}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False

    except subprocess.TimeoutExpired:
        logger.warning(f"ffmpeg timeout embedding metadata for {file_path}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False
    except Exception as e:
        logger.warning(f"Failed to embed metadata: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False


@settings_bp.route('/api/settings/missing-metadata', methods=['GET'])
def get_missing_metadata():
    """Get count of library videos missing upload_date, non-library videos with broken thumbnails,
    channels with missing thumbnail files, and library videos with missing thumbnail files."""
    global _session_factory

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')

    with get_session(_session_factory) as session:
        # Library videos missing upload_date
        videos = session.query(Video).filter(
            Video.status == 'library',
            (Video.upload_date == None) | (Video.upload_date == '')
        ).all()

        # Return video IDs for potential display
        missing_videos = [{
            'id': v.id,
            'yt_id': v.yt_id,
            'title': v.title,
            'channel_title': v.channel.title if v.channel else None
        } for v in videos[:100]]  # Limit to 100 for display

        # Non-library videos with broken thumbnail URLs (null or local paths)
        broken_thumb_videos = session.query(Video).filter(
            Video.status != 'library',
            or_(
                Video.thumb_url.is_(None),
                ~Video.thumb_url.like('http%')  # Local paths don't start with http
            )
        ).all()

        # Channels with missing thumbnail file on disk (all channels in DB)
        # Skip placeholder channels like __singles__ that aren't real YouTube channels
        channels = session.query(Channel).all()
        missing_channel_thumbs = []
        for channel in channels:
            # Skip placeholder/special channel IDs
            if not channel.yt_id or channel.yt_id.startswith('__') or channel.yt_id == 'singles':
                continue
            thumb_path = os.path.join(downloads_folder, 'thumbnails', f'{channel.yt_id}.jpg')
            if not os.path.exists(thumb_path):
                missing_channel_thumbs.append({
                    'id': channel.id,
                    'yt_id': channel.yt_id,
                    'title': channel.title
                })

        # Library videos with missing thumbnail file on disk
        library_videos = session.query(Video).filter(Video.status == 'library').all()
        missing_video_thumbs = []
        for video in library_videos:
            is_missing = False
            if video.thumb_url and not video.thumb_url.startswith('http'):
                thumb_path = os.path.join(downloads_folder, video.thumb_url)
                if not os.path.exists(thumb_path):
                    is_missing = True
            elif video.channel and video.yt_id:
                # Construct expected path if thumb_url not set
                thumb_path = os.path.join(downloads_folder, video.channel.folder_name, f'{video.yt_id}.jpg')
                if not os.path.exists(thumb_path):
                    is_missing = True

            if is_missing:
                missing_video_thumbs.append({
                    'id': video.id,
                    'yt_id': video.yt_id,
                    'title': video.title,
                    'channel_title': video.channel.title if video.channel else None
                })

        return jsonify({
            'count': len(videos),
            'videos': missing_videos,
            'broken_thumbnails': len(broken_thumb_videos),
            'missing_channel_thumbnails': len(missing_channel_thumbs),
            'missing_channel_thumbs_list': missing_channel_thumbs[:50],  # Limit for display
            'missing_video_thumbnails': len(missing_video_thumbs),
            'missing_video_thumbs_list': missing_video_thumbs[:50]  # Limit for display
        })


@settings_bp.route('/api/settings/fix-upload-dates', methods=['POST'])
def fix_upload_dates():
    """Fetch missing upload_date for all library videos using YouTube API (fast) or yt-dlp (fallback)."""
    global _session_factory, _settings_manager
    from youtube_api import fetch_video_dates

    updated_count = 0
    skipped_count = 0
    failed_count = 0
    api_used = False

    with get_session(_session_factory) as session:
        # Get all library videos missing upload_date
        videos = session.query(Video).filter(
            Video.status == 'library',
            (Video.upload_date == None) | (Video.upload_date == '')
        ).all()

        total = len(videos)

        if total > 0:
            logger.info(f"Fixing upload dates for {total} library videos")

        # Build list of video IDs that have yt_id
        videos_with_yt_id = [(v, v.yt_id) for v in videos if v.yt_id]
        videos_without_yt_id = [v for v in videos if not v.yt_id]
        skipped_count += len(videos_without_yt_id)

        # Try YouTube API first (much faster - 50 videos per request)
        api_key = _settings_manager.get('youtube_api_key') if _settings_manager else None
        remaining_videos = []

        if api_key and videos_with_yt_id:
            logger.info(f"Using YouTube API to fetch {len(videos_with_yt_id)} upload dates")
            api_used = True

            # Fetch all dates via API
            yt_ids = [yt_id for _, yt_id in videos_with_yt_id]
            dates = fetch_video_dates(yt_ids, api_key)

            # Update videos with API results
            for video, yt_id in videos_with_yt_id:
                if yt_id in dates:
                    upload_date = dates[yt_id]
                    video.upload_date = upload_date
                    updated_count += 1

                    # Embed in file metadata
                    if video.file_path and os.path.exists(video.file_path):
                        _embed_date_metadata(video.file_path, upload_date)
                else:
                    # API didn't return this video - add to fallback list
                    remaining_videos.append((video, yt_id))

            session.commit()
            logger.info(f"YouTube API updated {updated_count} videos, {len(remaining_videos)} remaining")
        else:
            remaining_videos = videos_with_yt_id

        # Fallback to yt-dlp for remaining videos (slower but works without API key)
        if remaining_videos:
            logger.info(f"Using yt-dlp fallback for {len(remaining_videos)} videos")

            fix_data_dir = os.environ.get('DATA_DIR', 'data')
            cookies_path = os.path.join(fix_data_dir, 'cookies.txt')

            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'noplaylist': True,
            }
            if os.path.exists(cookies_path) and os.path.getsize(cookies_path) > 0:
                ydl_opts['cookiefile'] = cookies_path

            for video, yt_id in remaining_videos:
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        url = f'https://youtube.com/watch?v={yt_id}'
                        data = ydl.extract_info(url, download=False)

                        if data and data.get('upload_date'):
                            upload_date = data['upload_date']
                            video.upload_date = upload_date
                            session.commit()

                            if video.file_path and os.path.exists(video.file_path):
                                _embed_date_metadata(video.file_path, upload_date)

                            updated_count += 1
                        else:
                            skipped_count += 1

                except Exception as e:
                    logger.warning(f"yt-dlp failed for {yt_id}: {e}")
                    failed_count += 1

        # Fix broken thumbnail URLs for non-library videos
        broken_thumb_videos = session.query(Video).filter(
            Video.status != 'library',
            or_(
                Video.thumb_url.is_(None),
                ~Video.thumb_url.like('http%')  # Local paths don't start with http
            )
        ).all()

        thumbnails_fixed = 0
        for video in broken_thumb_videos:
            video.thumb_url = f"https://img.youtube.com/vi/{video.yt_id}/hqdefault.jpg"
            thumbnails_fixed += 1

        if thumbnails_fixed > 0:
            session.commit()
            logger.info(f"Fixed {thumbnails_fixed} broken thumbnail URLs")

        # Fix missing channel thumbnail files (all channels in DB, not just active)
        from utils import ensure_channel_thumbnail, download_thumbnail

        downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')
        channels = session.query(Channel).all()
        channel_thumbs_fixed = 0

        # Get API key for faster thumbnail fetching
        channel_api_key = _settings_manager.get('youtube_api_key') if _settings_manager else None

        for channel in channels:
            # Skip placeholder/special channel IDs
            if not channel.yt_id or channel.yt_id.startswith('__') or channel.yt_id == 'singles':
                continue
            thumb_path = os.path.join(downloads_folder, 'thumbnails', f'{channel.yt_id}.jpg')
            expected_db_path = os.path.join('thumbnails', f'{channel.yt_id}.jpg')

            if os.path.exists(thumb_path):
                # File exists - ensure DB has correct local path
                if channel.thumbnail != expected_db_path:
                    channel.thumbnail = expected_db_path
                    channel_thumbs_fixed += 1
                    logger.info(f"Fixed channel thumbnail path in DB for {channel.title}")
            else:
                # File missing - download it
                result = ensure_channel_thumbnail(channel.yt_id, downloads_folder, api_key=channel_api_key)
                if result:
                    channel.thumbnail = result  # Update database with local path
                    channel_thumbs_fixed += 1
                    logger.info(f"Downloaded channel thumbnail for {channel.title}")
                else:
                    logger.warning(f"Failed to download channel thumbnail for {channel.title} ({channel.yt_id})")

        # Fix missing library video thumbnail files
        library_videos = session.query(Video).filter(Video.status == 'library').all()
        video_thumbs_fixed = 0

        for video in library_videos:
            # Determine expected thumbnail path
            if video.thumb_url and not video.thumb_url.startswith('http'):
                thumb_path = os.path.join(downloads_folder, video.thumb_url)
            elif video.channel and video.yt_id:
                thumb_path = os.path.join(downloads_folder, video.channel.folder_name, f'{video.yt_id}.jpg')
            else:
                continue

            if not os.path.exists(thumb_path):
                # Download thumbnail from YouTube
                thumb_url = f"https://img.youtube.com/vi/{video.yt_id}/maxresdefault.jpg"
                if download_thumbnail(thumb_url, thumb_path):
                    video_thumbs_fixed += 1
                    logger.info(f"Downloaded video thumbnail for {video.title}")
                else:
                    # Fallback to hqdefault if maxresdefault fails
                    thumb_url = f"https://img.youtube.com/vi/{video.yt_id}/hqdefault.jpg"
                    if download_thumbnail(thumb_url, thumb_path):
                        video_thumbs_fixed += 1
                        logger.info(f"Downloaded video thumbnail (fallback) for {video.title}")

        if channel_thumbs_fixed > 0 or video_thumbs_fixed > 0:
            logger.info(f"Fixed {channel_thumbs_fixed} channel thumbnails, {video_thumbs_fixed} video thumbnails")

    return jsonify({
        'success': True,
        'updated': updated_count,
        'skipped': skipped_count,
        'failed': failed_count,
        'total': total,
        'method': 'api' if api_used else ('yt-dlp' if total > 0 else 'none'),
        'thumbnails_fixed': thumbnails_fixed,
        'channel_thumbnails_fixed': channel_thumbs_fixed,
        'video_thumbnails_fixed': video_thumbs_fixed
    })


@settings_bp.route('/api/settings/missing-sponsorblock-chapters', methods=['GET'])
def get_missing_sponsorblock_chapters():
    """Get count of library videos that need SponsorBlock processing.

    Video states:
    - sponsorblock_segments is NULL or '' → Never checked, needs API fetch
    - sponsorblock_segments is '[]' → Already checked, no data exists (skip)
    - sponsorblock_segments has data → Check if file has chapters embedded
    """
    global _session_factory, _settings_manager
    import subprocess
    import json as json_module

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')

    # Check if SponsorBlock is enabled
    sponsorblock_categories = _settings_manager.get_sponsorblock_categories()
    if not sponsorblock_categories:
        return jsonify({
            'count': 0,
            'videos': [],
            'never_checked': 0,
            'no_data_available': 0,
            'needs_chapters': 0,
            'already_done': 0,
            'message': 'SponsorBlock is not enabled in Settings'
        })

    with get_session(_session_factory) as session:
        # Get all library videos with files
        all_library_videos = session.query(Video).filter(
            Video.status == 'library',
            Video.file_path.isnot(None),
            Video.yt_id.isnot(None)
        ).all()

        never_checked_list = []      # NULL or '' - need to fetch from API
        no_data_available_count = 0  # '[]' - already checked, no SponsorBlock data
        needs_chapters_list = []     # Has segments but file missing chapters
        already_done_count = 0       # Has segments and file has chapters

        for video in all_library_videos:
            segments_value = video.sponsorblock_segments

            # State 1: Never checked (NULL or empty string)
            if not segments_value or segments_value == '':
                never_checked_list.append({
                    'id': video.id,
                    'yt_id': video.yt_id,
                    'title': video.title,
                    'channel_title': video.channel.title if video.channel else None,
                    'needs': 'fetch'
                })
                continue

            # State 2: Already checked, no data exists
            if segments_value == '[]':
                no_data_available_count += 1
                continue

            # State 3: Has segment data - check if file has chapters
            file_path = video.file_path
            if not os.path.isabs(file_path):
                file_path = os.path.join(downloads_folder, file_path)

            if not os.path.exists(file_path):
                continue

            try:
                result = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_chapters', file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0:
                    probe_data = json_module.loads(result.stdout)
                    chapters = probe_data.get('chapters', [])
                    if len(chapters) == 0:
                        needs_chapters_list.append({
                            'id': video.id,
                            'yt_id': video.yt_id,
                            'title': video.title,
                            'channel_title': video.channel.title if video.channel else None,
                            'needs': 'chapters'
                        })
                    else:
                        already_done_count += 1
            except Exception as e:
                logger.warning(f"Failed to probe {video.title}: {e}")

        # Only count videos that need work
        all_videos = never_checked_list + needs_chapters_list
        total_count = len(all_videos)

        return jsonify({
            'count': total_count,
            'videos': all_videos[:100],
            'never_checked': len(never_checked_list),
            'no_data_available': no_data_available_count,
            'needs_chapters': len(needs_chapters_list),
            'already_done': already_done_count
        })


@settings_bp.route('/api/settings/fix-sponsorblock-chapters', methods=['POST'])
def fix_sponsorblock_chapters():
    """Fetch SponsorBlock segments and embed as chapter markers into video files.

    Video states:
    - sponsorblock_segments is NULL or '' → Fetch from API
    - sponsorblock_segments is '[]' → Already checked, no data (skip entirely)
    - sponsorblock_segments has data → Check file for chapters, embed if needed
    """
    global _session_factory, _settings_manager
    import subprocess
    import json as json_module
    import tempfile

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')

    segments_fetched = 0
    chapters_embedded = 0
    no_segments_available = 0  # Videos where SponsorBlock has no data (from this run)
    already_had_no_data = 0    # Videos already marked as no data from previous runs
    skipped_has_chapters = 0   # Videos that already have chapters embedded
    failed_count = 0
    errors = []

    # Check if SponsorBlock is enabled
    sponsorblock_categories = _settings_manager.get_sponsorblock_categories()
    if not sponsorblock_categories:
        return jsonify({
            'success': False,
            'error': 'SponsorBlock is not enabled in Settings'
        })

    # Category display names for chapter titles
    category_names = {
        'sponsor': 'Sponsor',
        'selfpromo': 'Self-promotion',
        'interaction': 'Interaction',
        'intro': 'Intro',
        'outro': 'Outro',
        'preview': 'Preview',
        'filler': 'Filler',
        'music_offtopic': 'Non-music'
    }

    with get_session(_session_factory) as session:
        # Get all library videos
        videos = session.query(Video).filter(
            Video.status == 'library',
            Video.file_path.isnot(None),
            Video.yt_id.isnot(None)
        ).all()

        logger.info(f"Processing {len(videos)} library videos for SponsorBlock chapters")

        for video in videos:
            segments_value = video.sponsorblock_segments

            # State 1: Already checked previously, no data exists - skip entirely
            if segments_value == '[]':
                already_had_no_data += 1
                continue

            # State 2: Never checked (NULL or empty) - fetch from API
            if not segments_value or segments_value == '':
                try:
                    url = f"https://sponsor.ajay.app/api/skipSegments?videoID={video.yt_id}&categories={json_module.dumps(sponsorblock_categories)}"
                    response = requests.get(url, timeout=10)

                    if response.status_code == 200:
                        api_segments = response.json()
                        segments = [
                            {
                                "start": seg["segment"][0],
                                "end": seg["segment"][1],
                                "category": seg["category"]
                            }
                            for seg in api_segments
                        ]
                        if segments:
                            video.sponsorblock_segments = json_module.dumps(segments)
                            session.commit()
                            segments_fetched += 1
                            logger.info(f"Fetched {len(segments)} SponsorBlock segments for {video.title}")
                            # Continue to embed chapters below
                        else:
                            # API returned 200 but no matching segments
                            video.sponsorblock_segments = '[]'
                            session.commit()
                            no_segments_available += 1
                            continue  # No segments to embed
                    elif response.status_code == 404:
                        # No segments available - mark as checked
                        video.sponsorblock_segments = '[]'
                        session.commit()
                        no_segments_available += 1
                        continue  # No segments to embed
                    else:
                        logger.warning(f"SponsorBlock API returned {response.status_code} for {video.title}")
                        continue
                except Exception as e:
                    logger.warning(f"Failed to fetch segments for {video.title}: {e}")
                    continue

            # State 3: Has segment data - check if file needs chapters embedded
            # (Either we just fetched segments above, or video already had them)
            # Build full file path
            file_path = video.file_path
            if not os.path.isabs(file_path):
                file_path = os.path.join(downloads_folder, file_path)

            if not os.path.exists(file_path):
                continue

            # Check if file already has chapters
            try:
                result = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_chapters', file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0:
                    probe_data = json_module.loads(result.stdout)
                    existing_chapters = probe_data.get('chapters', [])
                    if len(existing_chapters) > 0:
                        # Already has chapters, skip
                        skipped_has_chapters += 1
                        continue
            except Exception as e:
                logger.warning(f"Failed to probe {video.title}: {e}")
                failed_count += 1
                continue

            # Parse sponsorblock segments from DB (may have just been fetched above)
            try:
                segments = json_module.loads(video.sponsorblock_segments)
                if not segments:
                    continue  # Shouldn't happen but safety check
            except Exception as e:
                logger.warning(f"Failed to parse segments for {video.title}: {e}")
                failed_count += 1
                continue

            logger.info(f"Embedding {len(segments)} chapter(s) in {video.title}")

            # Get video duration for the final chapter
            try:
                duration_result = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                duration = float(json_module.loads(duration_result.stdout).get('format', {}).get('duration', 0))
            except:
                duration = video.duration_sec or 0

            # Generate ffmetadata content
            metadata_lines = [';FFMETADATA1']

            # Sort segments by start time
            segments = sorted(segments, key=lambda x: x.get('start', 0))

            for seg in segments:
                start_ms = int(seg.get('start', 0) * 1000)
                end_ms = int(seg.get('end', 0) * 1000)
                category = seg.get('category', 'sponsor')
                title = f"[SponsorBlock]: {category_names.get(category, category.title())}"

                metadata_lines.append('')
                metadata_lines.append('[CHAPTER]')
                metadata_lines.append('TIMEBASE=1/1000')
                metadata_lines.append(f'START={start_ms}')
                metadata_lines.append(f'END={end_ms}')
                metadata_lines.append(f'title={title}')

            metadata_content = '\n'.join(metadata_lines)

            # Write metadata to temp file and run ffmpeg
            try:
                with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as meta_file:
                    meta_file.write(metadata_content)
                    meta_path = meta_file.name

                # Create temp output file
                temp_output = file_path + '.tmp.mp4'

                # Run ffmpeg to embed chapters
                ffmpeg_result = subprocess.run(
                    ['ffmpeg', '-y', '-i', file_path, '-f', 'ffmetadata', '-i', meta_path,
                     '-map_metadata', '1', '-c', 'copy', temp_output],
                    capture_output=True,
                    text=True,
                    timeout=120
                )

                # Clean up metadata file
                os.remove(meta_path)

                if ffmpeg_result.returncode == 0 and os.path.exists(temp_output):
                    # Replace original with new file
                    os.replace(temp_output, file_path)
                    chapters_embedded += 1
                    logger.info(f"Embedded SponsorBlock chapters in {video.title}")
                else:
                    failed_count += 1
                    errors.append(f"{video.title}: ffmpeg failed")
                    if os.path.exists(temp_output):
                        os.remove(temp_output)

            except Exception as e:
                failed_count += 1
                errors.append(f"{video.title}: {str(e)}")
                logger.warning(f"Failed to embed chapters in {video.title}: {e}")

    logger.info(f"SponsorBlock fix complete: {segments_fetched} fetched, {chapters_embedded} embedded, {no_segments_available} no data, {skipped_has_chapters} already done, {already_had_no_data} previously checked")

    return jsonify({
        'success': True,
        'segments_fetched': segments_fetched,
        'chapters_embedded': chapters_embedded,
        'no_segments_available': no_segments_available,
        'already_had_no_data': already_had_no_data,
        'skipped_has_chapters': skipped_has_chapters,
        'failed': failed_count,
        'errors': errors[:10]  # Limit errors for response
    })


@settings_bp.route('/api/settings/sponsorblock-cut-check', methods=['GET'])
def get_sponsorblock_cut_check():
    """Get count of library videos eligible for SponsorBlock segment cutting.

    Video states:
    - sponsorblock_segments is NULL or '' → Never checked, needs API fetch
    - sponsorblock_segments is '[]' → No data exists (skip)
    - sponsorblock_segments has data → Can be cut
    - sponsorblock_segments is 'cut' → Already cut (skip)
    """
    global _session_factory, _settings_manager
    import json as json_module

    # Check if SponsorBlock is enabled
    sponsorblock_categories = _settings_manager.get_sponsorblock_categories()
    if not sponsorblock_categories:
        return jsonify({
            'count': 0,
            'videos': [],
            'never_checked': 0,
            'can_cut': 0,
            'already_cut': 0,
            'no_data': 0,
            'message': 'SponsorBlock is not enabled in Settings'
        })

    with get_session(_session_factory) as session:
        all_library_videos = session.query(Video).filter(
            Video.status == 'library',
            Video.file_path.isnot(None),
            Video.yt_id.isnot(None)
        ).all()

        never_checked_list = []
        can_cut_list = []
        already_cut_count = 0
        no_data_count = 0

        for video in all_library_videos:
            segments_value = video.sponsorblock_segments

            # Never checked
            if not segments_value or segments_value == '':
                never_checked_list.append({
                    'id': video.id,
                    'yt_id': video.yt_id,
                    'title': video.title,
                    'channel_title': video.channel.title if video.channel else None,
                    'needs': 'fetch'
                })
                continue

            # No data
            if segments_value == '[]':
                no_data_count += 1
                continue

            # Already cut
            if segments_value == 'cut':
                already_cut_count += 1
                continue

            # Has segment data - can be cut
            try:
                segments = json_module.loads(segments_value)
                if segments and isinstance(segments, list):
                    total_cut_time = sum(seg.get('end', 0) - seg.get('start', 0) for seg in segments)
                    can_cut_list.append({
                        'id': video.id,
                        'yt_id': video.yt_id,
                        'title': video.title,
                        'channel_title': video.channel.title if video.channel else None,
                        'needs': 'cut',
                        'segment_count': len(segments),
                        'cut_seconds': round(total_cut_time)
                    })
            except Exception:
                continue

        all_videos = never_checked_list + can_cut_list
        total_count = len(all_videos)

        return jsonify({
            'count': total_count,
            'videos': all_videos[:100],
            'never_checked': len(never_checked_list),
            'can_cut': len(can_cut_list),
            'already_cut': already_cut_count,
            'no_data': no_data_count
        })


@settings_bp.route('/api/settings/sponsorblock-cut-segments', methods=['POST'])
def cut_sponsorblock_segments():
    """Cut SponsorBlock segments from selected video files using ffmpeg stream copy.

    Expects JSON body: { "video_ids": [1, 2, 3] }
    """
    global _session_factory, _settings_manager
    import json as json_module
    import tempfile

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')

    # Check if SponsorBlock is enabled
    sponsorblock_categories = _settings_manager.get_sponsorblock_categories()
    if not sponsorblock_categories:
        return jsonify({
            'success': False,
            'error': 'SponsorBlock is not enabled in Settings'
        })

    data = request.get_json() or {}
    video_ids = data.get('video_ids', [])
    if not video_ids:
        return jsonify({
            'success': False,
            'error': 'No videos selected'
        })

    segments_fetched = 0
    segments_cut = 0
    no_data_count = 0
    failed_count = 0
    errors = []

    with get_session(_session_factory) as session:
        videos = session.query(Video).filter(
            Video.id.in_(video_ids),
            Video.status == 'library',
            Video.file_path.isnot(None),
            Video.yt_id.isnot(None)
        ).all()

        logger.info(f"Processing {len(videos)} videos for SponsorBlock segment cutting")

        for video in videos:
            segments_value = video.sponsorblock_segments

            # Skip already cut
            if segments_value == 'cut':
                continue

            # Skip no data
            if segments_value == '[]':
                no_data_count += 1
                continue

            # Fetch from API if never checked
            if not segments_value or segments_value == '':
                try:
                    url = f"https://sponsor.ajay.app/api/skipSegments?videoID={video.yt_id}&categories={json_module.dumps(sponsorblock_categories)}"
                    response = requests.get(url, timeout=10)

                    if response.status_code == 200:
                        api_segments = response.json()
                        segments = [
                            {
                                "start": seg["segment"][0],
                                "end": seg["segment"][1],
                                "category": seg["category"]
                            }
                            for seg in api_segments
                        ]
                        if segments:
                            video.sponsorblock_segments = json_module.dumps(segments)
                            session.commit()
                            segments_fetched += 1
                        else:
                            video.sponsorblock_segments = '[]'
                            session.commit()
                            no_data_count += 1
                            continue
                    elif response.status_code == 404:
                        video.sponsorblock_segments = '[]'
                        session.commit()
                        no_data_count += 1
                        continue
                    else:
                        logger.warning(f"SponsorBlock API returned {response.status_code} for {video.title}")
                        continue
                except Exception as e:
                    logger.warning(f"Failed to fetch segments for {video.title}: {e}")
                    continue

            # Parse segments
            try:
                segments = json_module.loads(video.sponsorblock_segments)
                if not segments:
                    continue
            except Exception as e:
                logger.warning(f"Failed to parse segments for {video.title}: {e}")
                failed_count += 1
                continue

            # Resolve file path
            file_path = video.file_path
            if not os.path.isabs(file_path):
                file_path = os.path.join(downloads_folder, file_path)

            if not os.path.exists(file_path):
                failed_count += 1
                errors.append(f"{video.title}: file not found")
                continue

            # Cut segments using ffmpeg stream copy
            try:
                new_size, new_duration = _cut_segments_from_file(file_path, segments)
                if new_size:
                    video.file_size_bytes = new_size
                    if new_duration:
                        video.duration_sec = new_duration
                    video.sponsorblock_segments = 'cut'
                    session.commit()
                    segments_cut += 1
                    logger.info(f"Cut SponsorBlock segments from {video.title}")
                else:
                    failed_count += 1
                    errors.append(f"{video.title}: cutting failed")
            except Exception as e:
                failed_count += 1
                errors.append(f"{video.title}: {str(e)}")
                logger.warning(f"Failed to cut segments from {video.title}: {e}")

    logger.info(f"SponsorBlock cut complete: {segments_fetched} fetched, {segments_cut} cut, {no_data_count} no data, {failed_count} failed")

    return jsonify({
        'success': True,
        'segments_fetched': segments_fetched,
        'segments_cut': segments_cut,
        'no_data': no_data_count,
        'failed': failed_count,
        'errors': errors[:10]
    })


def _cut_segments_from_file(video_file_path, segments):
    """Cut SponsorBlock segments from a video file using ffmpeg stream copy (no re-encoding).

    Extracts non-sponsor portions and concatenates them back together.
    Falls back to keeping the original file if anything fails.

    Args:
        video_file_path: Absolute path to the video file
        segments: List of dicts with 'start' and 'end' keys (seconds)

    Returns:
        tuple: (new_file_size, new_duration_sec) or (None, None) if cutting failed
    """
    if not segments or not os.path.exists(video_file_path):
        return None, None

    # Sort segments by start time and compute "keep" ranges
    sorted_segments = sorted(segments, key=lambda s: s['start'])
    keep_ranges = []
    current = 0.0

    for seg in sorted_segments:
        if seg['start'] > current:
            keep_ranges.append((current, seg['start']))
        current = max(current, seg['end'])

    # Add final segment (from last sponsor end to video end)
    keep_ranges.append((current, None))

    # Filter out tiny ranges (< 0.5s) that would produce empty files
    keep_ranges = [(s, e) for s, e in keep_ranges if e is None or e - s >= 0.5]

    if not keep_ranges:
        logger.warning('SponsorBlock cut: No content would remain after cutting, skipping')
        return None, None

    file_dir = os.path.dirname(video_file_path)
    file_base = os.path.splitext(os.path.basename(video_file_path))[0]
    file_ext = os.path.splitext(video_file_path)[1]
    part_files = []

    try:
        # Step 1: Extract each "keep" segment with stream copy
        for i, (start, end) in enumerate(keep_ranges):
            part_path = os.path.join(file_dir, f'{file_base}_cutpart_{i}{file_ext}')
            part_files.append(part_path)

            cmd = ['ffmpeg', '-y', '-ss', str(start)]
            if end is not None:
                cmd.extend(['-to', str(end)])
            cmd.extend([
                '-i', video_file_path,
                '-c', 'copy',
                '-avoid_negative_ts', 'make_zero',
                part_path
            ])

            logger.debug(f'SponsorBlock cut: Extracting part {i+1}/{len(keep_ranges)} ({start:.1f}s - {end if end else "end"})')
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                logger.error(f'SponsorBlock cut: ffmpeg extract failed for part {i}: {result.stderr.decode()[-500:]}')
                raise Exception(f'ffmpeg extract failed for part {i}')

        # Step 2: Create concat demuxer list
        concat_list_path = os.path.join(file_dir, f'{file_base}_cutlist.txt')
        with open(concat_list_path, 'w') as f:
            for part_path in part_files:
                f.write(f"file '{os.path.basename(part_path)}'\n")

        # Step 3: Concatenate all parts with stream copy
        output_path = os.path.join(file_dir, f'{file_base}_cut{file_ext}')
        concat_cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_list_path,
            '-c', 'copy',
            '-movflags', '+faststart',
            output_path
        ]

        logger.debug(f'SponsorBlock cut: Concatenating {len(part_files)} parts')
        result = subprocess.run(concat_cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            logger.error(f'SponsorBlock cut: ffmpeg concat failed: {result.stderr.decode()[-500:]}')
            raise Exception('ffmpeg concat failed')

        # Step 4: Remux to fix container metadata (duration) after concat
        remux_path = os.path.join(file_dir, f'{file_base}_remux{file_ext}')
        remux_cmd = [
            'ffmpeg', '-y',
            '-i', output_path,
            '-c', 'copy',
            '-movflags', '+faststart',
            remux_path
        ]

        logger.debug('SponsorBlock cut: Remuxing to fix container metadata')
        result = subprocess.run(remux_cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.exists(remux_path) and os.path.getsize(remux_path) > 0:
            os.replace(remux_path, output_path)
        else:
            logger.warning('SponsorBlock cut: Remux failed, using concat output as-is')
            if os.path.exists(remux_path):
                os.remove(remux_path)

        # Step 5: Replace original with cut version
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            os.replace(output_path, video_file_path)
            new_size = os.path.getsize(video_file_path)
            total_cut = sum(seg['end'] - seg['start'] for seg in sorted_segments)
            logger.info(f'SponsorBlock cut: Removed ~{total_cut:.0f}s of segments from video ({len(segments)} segments)')

            # Get actual duration of cut file via ffprobe
            new_duration = None
            try:
                probe_cmd = [
                    'ffprobe', '-v', 'error',
                    '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1',
                    video_file_path
                ]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
                if probe_result.returncode == 0:
                    new_duration = int(float(probe_result.stdout.strip()))
            except Exception as probe_error:
                logger.warning(f'SponsorBlock cut: Failed to probe duration: {probe_error}')

            return new_size, new_duration
        else:
            logger.error('SponsorBlock cut: Output file is empty or missing')
            raise Exception('Output file empty')

    except Exception as e:
        logger.warning(f'SponsorBlock cut failed, keeping original file: {e}')
        return None, None

    finally:
        # Clean up temp files
        for part_path in part_files:
            if os.path.exists(part_path):
                os.remove(part_path)
        concat_list_path = os.path.join(file_dir, f'{file_base}_cutlist.txt')
        if os.path.exists(concat_list_path):
            os.remove(concat_list_path)
        output_path = os.path.join(file_dir, f'{file_base}_cut{file_ext}')
        if os.path.exists(output_path):
            os.remove(output_path)
        remux_path = os.path.join(file_dir, f'{file_base}_remux{file_ext}')
        if os.path.exists(remux_path):
            os.remove(remux_path)


# =============================================================================
# Health & Logs Endpoints
# =============================================================================

def detect_server_platform():
    """Detect the server's platform (docker, windows, or linux).

    Returns the platform where the server is actually running,
    not the client's browser platform.
    """
    # Check for Docker container (presence of /.dockerenv or cgroup info)
    if os.path.exists('/.dockerenv'):
        return 'docker'
    try:
        with open('/proc/1/cgroup', 'r') as f:
            if 'docker' in f.read():
                return 'docker'
    except (FileNotFoundError, PermissionError):
        pass

    # Check for Windows
    if os.name == 'nt':
        return 'windows'

    # Default to Linux
    return 'linux'


@settings_bp.route('/api/health', methods=['GET'])
def health_check():
    # Detect server platform
    server_platform = detect_server_platform()

    # Check ffmpeg (cross-platform)
    ffmpeg_available = False
    ffmpeg_path = shutil.which('ffmpeg') or shutil.which('ffmpeg.exe')
    if ffmpeg_path:
        try:
            # On Windows, prevent console window from appearing
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE

            result = subprocess.run([ffmpeg_path, '-version'], capture_output=True, timeout=5, startupinfo=startupinfo)
            ffmpeg_available = result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # Check yt-dlp version
    ytdlp_version = yt_dlp.version.__version__

    # Check auto-refresh status
    auto_refresh_enabled = _settings_manager.get_bool('auto_refresh_enabled')
    auto_refresh_time = _settings_manager.get('auto_refresh_time', '03:00')
    auto_refresh_config = _settings_manager.get('auto_refresh_config')

    # Check cookies.txt (in data folder)
    data_dir = os.environ.get('DATA_DIR', 'data')
    cookies_path = os.path.join(data_dir, 'cookies.txt')
    cookies_available = os.path.exists(cookies_path)

    # Check Firefox profile availability at /firefox_profile mount
    firefox_profile_path = '/firefox_profile'
    firefox_profile_mounted = os.path.exists(firefox_profile_path)

    # Check if Firefox profile has YouTube cookies
    firefox_has_cookies = False
    if firefox_profile_mounted:
        try:
            # Look for profiles.ini to find default profile
            profiles_ini = os.path.join(firefox_profile_path, 'profiles.ini')
            if os.path.exists(profiles_ini):
                # Check for any .default or .default-release profile
                for profile_dir in os.listdir(firefox_profile_path):
                    if profile_dir.endswith('.default') or profile_dir.endswith('.default-release'):
                        profile_path = os.path.join(firefox_profile_path, profile_dir)
                        cookies_db = os.path.join(profile_path, 'cookies.sqlite')
                        if os.path.exists(cookies_db) and os.path.getsize(cookies_db) > 0:
                            firefox_has_cookies = True
                            break
        except Exception as e:
            logger.debug(f'Error checking Firefox cookies: {e}')

    # Calculate total storage size of downloads directory
    total_storage_bytes = 0
    downloads_path = os.environ.get('DOWNLOADS_DIR', 'downloads')
    if os.path.exists(downloads_path):
        for dirpath, dirnames, filenames in os.walk(downloads_path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_storage_bytes += os.path.getsize(filepath)
                except (OSError, FileNotFoundError):
                    pass

    # Format storage size
    def format_bytes(bytes_size):
        if bytes_size < 1024:
            return f"{bytes_size}B"
        elif bytes_size < 1024 * 1024:
            return f"{bytes_size / 1024:.1f}KB"
        elif bytes_size < 1024 * 1024 * 1024:
            return f"{bytes_size / (1024 * 1024):.1f}MB"
        elif bytes_size < 1024 * 1024 * 1024 * 1024:
            return f"{bytes_size / (1024 * 1024 * 1024):.1f}GB"
        else:
            return f"{bytes_size / (1024 * 1024 * 1024 * 1024):.1f}TB"

    total_storage = format_bytes(total_storage_bytes)

    # Check if worker thread is actually alive (not just the flag)
    worker_alive = _download_worker.running and _download_worker.thread and _download_worker.thread.is_alive()

    # If worker flag says running but thread is dead, restart it
    if _download_worker.running and (not _download_worker.thread or not _download_worker.thread.is_alive()):
        logger.warning('Worker thread is dead but flag says running - restarting worker')
        _download_worker.running = False
        _download_worker.start()
        worker_alive = True

    # Calculate database size
    db_size = 0
    # Database path from DATA_DIR environment variable
    db_data_dir = os.environ.get('DATA_DIR', 'data')
    db_path = os.path.join(db_data_dir, 'ytandchill.db')
    if os.path.exists(db_path):
        try:
            db_size = os.path.getsize(db_path)
        except (OSError, FileNotFoundError):
            pass
    database_size = format_bytes(db_size)

    # Get latest version from settings (populated by scan operations)
    latest_version = _settings_manager.get('latest_version')

    # Get media port for frontend to construct media URLs
    media_port = int(os.environ.get('MEDIA_PORT', 4100))

    return jsonify({
        'status': 'ok',
        'server_platform': server_platform,
        'ffmpeg_available': ffmpeg_available,
        'ytdlp_version': ytdlp_version,
        'auto_refresh_enabled': auto_refresh_enabled,
        'auto_refresh_time': auto_refresh_time,
        'auto_refresh_config': auto_refresh_config,
        'download_worker_running': worker_alive,
        'cookies_available': cookies_available,
        'firefox_profile_mounted': firefox_profile_mounted,
        'firefox_has_cookies': firefox_has_cookies,
        'total_storage': total_storage,
        'database_size': database_size,
        'latest_version': latest_version,
        'media_port': media_port
    })


@settings_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """Get the last N lines from the log file"""
    try:
        lines = int(request.args.get('lines', 500))
        log_file = 'logs/app.log'

        if not os.path.exists(log_file):
            return jsonify({'logs': [], 'message': 'Log file not found'})

        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

        return jsonify({'logs': last_lines, 'total_lines': len(all_lines)})
    except Exception as e:
        logger.error(f'Error reading logs: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while reading the logs'}), 500


@settings_bp.route('/api/logs', methods=['DELETE'])
def clear_logs():
    """Clear log files - 'current' clears today's log, 'all' deletes all log files"""
    try:
        scope = request.args.get('scope', 'all')  # 'all' or 'current'
        log_dir = 'logs'
        log_file = os.path.join(log_dir, 'app.log')

        if scope == 'current':
            # Clear only the current log file (today's log)
            if os.path.exists(log_file):
                with open(log_file, 'w') as f:
                    f.write('')
                logger.info('Current log file cleared by user')
            return jsonify({'success': True, 'message': 'Current log cleared'})
        else:
            # Delete all log files (app.log and all app.log.* backups)
            deleted_count = 0

            # Delete main log file
            if os.path.exists(log_file):
                with open(log_file, 'w') as f:
                    f.write('')
                deleted_count += 1

            # Delete all backup log files (app.log.YYYY-MM-DD)
            backup_pattern = os.path.join(log_dir, 'app.log.*')
            for backup_file in glob.glob(backup_pattern):
                try:
                    os.remove(backup_file)
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f'Failed to delete {backup_file}: {e}')

            logger.info(f'All logs cleared by user ({deleted_count} files)')
            return jsonify({'success': True, 'message': f'All logs cleared ({deleted_count} files)'})
    except Exception as e:
        logger.error(f'Error clearing logs: {str(e)}', exc_info=True)
        return jsonify({'error': 'An error occurred while clearing the logs'}), 500


# =============================================================================
# Authentication Endpoints
# =============================================================================

@settings_bp.route('/api/auth/check-first-run', methods=['GET'])
def check_first_run():
    """Check if this is the first run (setup needed)"""
    is_first_run = _settings_manager.get_bool('first_run')
    return jsonify({'first_run': is_first_run})


@settings_bp.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    is_auth = is_authenticated()
    logger.debug(f"Auth check - Session authenticated: {is_auth}, Session data: {dict(session)}")
    return jsonify({'authenticated': is_auth})


@settings_bp.route('/api/auth/login', methods=['POST'])
def login():
    """Login with username and password"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    remember_me = data.get('remember_me', False)

    logger.info(f"Login attempt - Username: {username}, Remember Me: {remember_me}")

    if not username or not password:
        logger.warning("Login failed - Missing username or password")
        return jsonify({'error': 'Username and password are required'}), 400

    # Get stored credentials for comparison
    stored_username, stored_password_hash = get_stored_credentials(_settings_manager)
    logger.info(f"Stored username: {stored_username}, Checking password match...")

    if check_auth_credentials(_settings_manager, username, password):
        session['authenticated'] = True
        session.permanent = True

        # Set session lifetime based on "Remember Me" checkbox
        if remember_me:
            # 1 year session
            current_app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)
            logger.info(f"✓ Login successful for user: {username} (1 year session)")
        else:
            # 90 days session (default)
            current_app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=90)
            logger.info(f"✓ Login successful for user: {username} (90 day session)")

        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        logger.warning(f"✗ Login failed - Invalid credentials for user: {username}")
        return jsonify({'error': 'Invalid username or password'}), 401


@settings_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout current user"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@settings_bp.route('/api/auth/setup', methods=['POST'])
def setup_auth():
    """Complete first-run setup with new credentials"""
    # Prevent credential override after initial setup
    if not _settings_manager.get_bool('first_run'):
        return jsonify({'error': 'Setup already completed'}), 403

    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    with get_session(_session_factory) as db_session:
        # Update username
        _settings_manager.set('auth_username', username)

        # Update password hash
        password_hash = generate_password_hash(password)
        _settings_manager.set('auth_password_hash', password_hash)

        # Mark first run as complete
        _settings_manager.set('first_run', 'false')

        # Don't auto-login - redirect to login page
        logger.info(f"Authentication setup completed for user: {username}")
        return jsonify({'success': True, 'message': 'Credentials saved successfully. Please log in.'})


@settings_bp.route('/api/auth/change', methods=['POST'])
def change_auth():
    """Change password (requires current password)"""
    data = request.json
    current_password = data.get('current_password', '').strip()
    new_password = data.get('new_password', '').strip()

    if not current_password:
        return jsonify({'error': 'Current password is required'}), 400

    if not new_password:
        return jsonify({'error': 'New password is required'}), 400

    if len(new_password) < 3:
        return jsonify({'error': 'Password must be at least 3 characters'}), 400

    # Verify current password
    stored_username, stored_password_hash = get_stored_credentials(_settings_manager)
    if not check_password_hash(stored_password_hash, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    try:
        # Update password hash
        new_password_hash = generate_password_hash(new_password)
        _settings_manager.set('auth_password_hash', new_password_hash)

        # Keep user logged in
        session['authenticated'] = True

        logger.info(f"Password changed for user: {stored_username}")
        return jsonify({'success': True, 'message': 'Password updated successfully'})
    except Exception as e:
        logger.error(f"Error changing password: {str(e)}")
        return jsonify({'error': 'Failed to update password'}), 500


@settings_bp.route('/api/auth/reset', methods=['POST'])
def reset_auth():
    """Reset authentication - reverts to setup mode (for forgotten passwords)"""
    try:
        # Clear stored credentials
        _settings_manager.set('auth_username', '')
        _settings_manager.set('auth_password_hash', '')

        # Mark as first run again
        _settings_manager.set('first_run', 'true')

        # Clear current session
        session.clear()

        logger.info("Authentication reset - reverting to setup mode")
        return jsonify({'success': True, 'message': 'Authentication reset. Please set up new credentials.'})
    except Exception as e:
        logger.error(f"Error resetting authentication: {str(e)}")
        return jsonify({'error': 'Failed to reset authentication'}), 500


# =============================================================================
# Queue Database Repair
# =============================================================================

@settings_bp.route('/api/stats', methods=['GET'])
def get_stats():
    """Get video stats (excluding Singles channel from discovered/ignored)"""
    from database import Video, Channel

    with get_session(_session_factory) as session:
        try:
            # Calculate stats excluding Singles
            discovered_count = session.query(Video).join(Channel).filter(
                Video.status == 'discovered',
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'
            ).count()

            ignored_count = session.query(Video).join(Channel).filter(
                Video.status.in_(['ignored', 'geoblocked']),
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'
            ).count()

            library_count = session.query(Video).filter(
                Video.status == 'library'
            ).count()

            return jsonify({
                'discovered': discovered_count,
                'ignored': ignored_count,
                'library': library_count
            })

        except Exception as e:
            logger.error(f"Error fetching stats: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/check-orphaned', methods=['GET'])
def check_orphaned():
    """Recalculate stats, auto-clean orphaned queue items, and return cleanup options"""
    from database import Video, QueueItem, Channel, Setting

    with get_session(_session_factory) as session:
        try:
            # Recalculate and update stats (always on button click)
            # Exclude Singles channel from discovered/ignored counts (one-off grabs, not subscriptions)
            discovered_count = session.query(Video).join(Channel).filter(
                Video.status == 'discovered',
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'  # Exclude Singles channel
            ).count()

            ignored_count = session.query(Video).join(Channel).filter(
                Video.status.in_(['ignored', 'geoblocked']),
                Channel.deleted_at.is_(None),
                Channel.yt_id != '__singles__'  # Exclude Singles channel
            ).count()

            library_count = session.query(Video).filter(
                Video.status == 'library'
            ).count()

            # Update stored stats
            stats_updated = []
            for key, value in [
                ('discovered_total', str(discovered_count)),
                ('ignored_total', str(ignored_count)),
                ('library_total', str(library_count))
            ]:
                setting = session.query(Setting).filter(Setting.key == key).first()
                if setting:
                    if setting.value != value:
                        old_value = setting.value
                        setting.value = value
                        stats_updated.append(f"{key}: {old_value} → {value}")
                else:
                    setting = Setting(key=key, value=value)
                    session.add(setting)
                    stats_updated.append(f"{key}: created with value {value}")

            # Auto-clean orphaned queue items (silently)
            orphaned = session.query(QueueItem, Video).join(Video).filter(
                ~Video.status.in_(['queued', 'downloading'])
            ).all()

            orphaned_cleaned = 0
            for qi, v in orphaned:
                logger.info(f"Auto-cleaning orphaned QueueItem {qi.id} for video {v.yt_id} (status: {v.status})")
                session.delete(qi)
                orphaned_cleaned += 1

            # Get videos not found on YouTube
            not_found_videos = session.query(Video).filter(
                Video.status == 'not_found'
            ).all()

            not_found_list = [{
                'id': v.id,
                'yt_id': v.yt_id,
                'title': v.title,
                'channel_name': v.channel.title if v.channel else 'Unknown'
            } for v in not_found_videos]

            # Get deleted channels with no library videos
            from sqlalchemy import func, case
            deleted_channels = session.query(
                Channel.id,
                Channel.title,
                func.count(Video.id).label('video_count')
            ).outerjoin(Video).filter(
                Channel.deleted_at.isnot(None)
            ).group_by(Channel.id).having(
                func.coalesce(func.sum(case((Video.status == 'library', 1), else_=0)), 0) == 0
            ).all()

            deletable_channels = [{
                'id': ch.id,
                'title': ch.title,
                'video_count': ch.video_count
            } for ch in deleted_channels]

            session.commit()

            if stats_updated:
                logger.info(f"Stats updated: {', '.join(stats_updated)}")
            if orphaned_cleaned > 0:
                logger.info(f"Auto-cleaned {orphaned_cleaned} orphaned queue items")

            return jsonify({
                'stats': {
                    'discovered': discovered_count,
                    'ignored': ignored_count,
                    'library': library_count
                },
                'stats_updated': stats_updated,
                'orphaned_cleaned': orphaned_cleaned,
                'not_found_videos': not_found_list,
                'deletable_channels': deletable_channels
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error in queue/DB repair check: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/remove-not-found', methods=['POST'])
def remove_not_found_videos():
    """Remove selected videos that were not found on YouTube"""
    from database import Video

    data = request.json
    video_ids = data.get('video_ids', [])

    if not video_ids:
        return jsonify({'error': 'No video IDs provided'}), 400

    with get_session(_session_factory) as session:
        try:
            removed_count = 0
            for video_id in video_ids:
                video = session.query(Video).filter(Video.id == video_id).first()
                if video and video.status == 'not_found':
                    logger.info(f"Removing not found video: {video.title} (yt_id: {video.yt_id})")
                    session.delete(video)
                    removed_count += 1

            session.commit()
            logger.info(f"Removed {removed_count} not found videos")

            return jsonify({
                'removed': removed_count
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error removing not found videos: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/queue/purge-channels', methods=['POST'])
def purge_deleted_channels():
    """Permanently delete selected soft-deleted channels and all their videos"""
    from database import Playlist, PlaylistVideo

    data = request.json
    channel_ids = data.get('channel_ids', [])

    if not channel_ids:
        return jsonify({'error': 'No channel IDs provided'}), 400

    with get_session(_session_factory) as session:
        try:
            purged_count = 0
            total_videos_removed = 0

            for channel_id in channel_ids:
                channel = session.query(Channel).filter(Channel.id == channel_id).first()
                if not channel or channel.deleted_at is None:
                    continue

                # Verify channel has no library videos (safety check)
                library_count = session.query(Video).filter(
                    Video.channel_id == channel_id,
                    Video.status == 'library'
                ).count()

                if library_count > 0:
                    logger.warning(f"Skipping channel {channel.title} - has {library_count} library videos")
                    continue

                # Count videos before deletion
                video_count = session.query(Video).filter(Video.channel_id == channel_id).count()

                # Delete all videos for this channel
                session.query(Video).filter(Video.channel_id == channel_id).delete()

                # Delete playlists
                session.query(Playlist).filter(Playlist.channel_id == channel_id).delete()

                # Delete channel folder if it exists (no library videos = safe to delete)
                folder_deleted = False
                downloads_dir = os.environ.get('DOWNLOADS_DIR', 'downloads')
                if channel.folder_name:
                    channel_folder = os.path.join(downloads_dir, channel.folder_name)
                    if os.path.exists(channel_folder) and os.path.isdir(channel_folder):
                        shutil.rmtree(channel_folder)
                        folder_deleted = True
                        logger.info(f"Deleted channel folder: {channel_folder}")

                # Delete channel thumbnail if it exists
                thumb_path = os.path.join(downloads_dir, 'thumbnails', f'{channel.yt_id}.jpg')
                if os.path.exists(thumb_path):
                    os.remove(thumb_path)
                    logger.info(f"Deleted channel thumbnail: {thumb_path}")

                # Delete the channel
                session.delete(channel)

                logger.info(f"Purged channel: {channel.title} ({video_count} videos, folder_deleted={folder_deleted})")
                purged_count += 1
                total_videos_removed += video_count

            session.commit()
            logger.info(f"Purged {purged_count} channels, removed {total_videos_removed} total videos")

            return jsonify({
                'purged_channels': purged_count,
                'videos_removed': total_videos_removed
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error purging channels: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500


# =============================================================================
# Video Issue Detection (Resolution & Codec)
# =============================================================================

# Codecs not supported on iOS/Safari - these need re-download with H.264
MOBILE_INCOMPATIBLE_CODECS = {'vp9', 'vp09', 'av1', 'av01'}


def get_video_resolution(file_path):
    """
    Get video height in pixels using ffprobe.
    Returns None if file doesn't exist or ffprobe fails.
    """
    if not file_path or not os.path.exists(file_path):
        return None

    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=height', '-of', 'csv=p=0', file_path],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            return int(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError, Exception) as e:
        logger.warning(f"ffprobe failed for {file_path}: {e}")

    return None


def get_video_codec(file_path):
    """
    Get video codec name using ffprobe.
    Returns None if file doesn't exist or ffprobe fails.
    """
    if not file_path or not os.path.exists(file_path):
        return None

    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file_path],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lower()
    except (subprocess.TimeoutExpired, ValueError, Exception) as e:
        logger.warning(f"ffprobe codec check failed for {file_path}: {e}")

    return None


def is_mobile_incompatible_codec(codec):
    """Check if codec is not supported on iOS/Safari."""
    if not codec:
        return False
    return codec.lower() in MOBILE_INCOMPATIBLE_CODECS


@settings_bp.route('/api/settings/low-quality-videos', methods=['GET'])
def get_low_quality_videos():
    """
    Find library videos with issues:
    1. Low resolution (under 1080p) - excludes Singles channel
    2. Mobile incompatible codec (VP9, AV1) - includes ALL videos including Singles

    Uses ffprobe to check actual file resolution and codec.
    """
    global _session_factory

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')

    with get_session(_session_factory) as session:
        # Get ALL library videos with file paths (including Singles for codec check)
        all_videos = session.query(Video).join(Channel).filter(
            Video.status == 'library',
            Video.file_path.isnot(None),
            Video.file_path != ''
        ).all()

        issue_videos = []
        scanned_count = 0
        errors_count = 0
        low_resolution_count = 0
        mobile_incompatible_count = 0

        for video in all_videos:
            scanned_count += 1

            # Check if this is a Singles video
            is_singles = (video.channel and
                         (video.channel.folder_name == 'Singles' or
                          video.channel.title == 'Singles'))

            # Build full path
            if video.file_path.startswith('/'):
                full_path = video.file_path
            else:
                full_path = os.path.join(downloads_folder, video.file_path)

            # Check codec for ALL videos (including Singles)
            codec = get_video_codec(full_path)
            if codec and is_mobile_incompatible_codec(codec):
                mobile_incompatible_count += 1
                issue_videos.append({
                    'id': video.id,
                    'yt_id': video.yt_id,
                    'title': video.title,
                    'channel_id': video.channel_id,
                    'channel_title': video.channel.title if video.channel else None,
                    'file_path': video.file_path,
                    'file_size_bytes': video.file_size_bytes,
                    'issue': 'mobile_incompatible',
                    'codec': codec
                })
                continue  # Don't also report as low quality

            # Skip resolution check for Singles
            if is_singles:
                continue

            # Get resolution via ffprobe (non-Singles only)
            height = get_video_resolution(full_path)

            if height is None:
                errors_count += 1
                continue

            # Check if under 1080p
            if height < 1080:
                low_resolution_count += 1
                # Determine resolution label
                if height >= 720:
                    resolution_label = '720p'
                elif height >= 480:
                    resolution_label = '480p'
                elif height >= 360:
                    resolution_label = '360p'
                elif height >= 240:
                    resolution_label = '240p'
                else:
                    resolution_label = f'{height}p'

                issue_videos.append({
                    'id': video.id,
                    'yt_id': video.yt_id,
                    'title': video.title,
                    'channel_id': video.channel_id,
                    'channel_title': video.channel.title if video.channel else None,
                    'height': height,
                    'resolution': resolution_label,
                    'file_path': video.file_path,
                    'file_size_bytes': video.file_size_bytes,
                    'issue': 'low_resolution'
                })

        logger.info(f"Video issues scan complete: {low_resolution_count} low resolution, "
                    f"{mobile_incompatible_count} mobile incompatible "
                    f"(scanned {scanned_count}, errors {errors_count})")

        return jsonify({
            'count': len(issue_videos),
            'videos': issue_videos,
            'total_scanned': scanned_count,
            'errors': errors_count,
            'low_resolution_count': low_resolution_count,
            'mobile_incompatible_count': mobile_incompatible_count
        })


@settings_bp.route('/api/settings/upgrade-videos', methods=['POST'])
def upgrade_selected_videos():
    """
    Re-queue selected videos for download at better quality.
    Deletes old files and sets status back to 'queued'.
    """
    global _session_factory

    data = request.get_json()
    video_ids = data.get('video_ids', [])

    if not video_ids:
        return jsonify({'error': 'No video IDs provided'}), 400

    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')
    upgraded_count = 0
    errors = []

    with get_session(_session_factory) as session:
        try:
            for video_id in video_ids:
                video = session.query(Video).filter(Video.id == video_id).first()
                if not video:
                    errors.append(f"Video ID {video_id} not found")
                    continue

                if video.status != 'library':
                    errors.append(f"Video '{video.title}' is not in library")
                    continue

                # Delete old video file
                if video.file_path:
                    if video.file_path.startswith('/'):
                        full_path = video.file_path
                    else:
                        full_path = os.path.join(downloads_folder, video.file_path)

                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted old file: {full_path}")
                        except OSError as e:
                            logger.warning(f"Failed to delete {full_path}: {e}")
                            # Continue anyway - file might be locked or already gone

                # Reset video to queued state (like fresh discovery from channel)
                video.status = 'queued'
                video.file_path = None
                video.file_size_bytes = None
                video.playback_seconds = 0  # Reset watch progress
                video.watched = False  # Reset watched status

                upgraded_count += 1
                logger.info(f"Queued for upgrade: {video.title} (ID: {video.id})")

            session.commit()

            # Emit event to refresh queue UI
            queue_events.emit_queue_update()

            return jsonify({
                'upgraded': upgraded_count,
                'errors': errors if errors else None
            })

        except Exception as e:
            session.rollback()
            logger.error(f"Error upgrading videos: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

