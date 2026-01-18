"""
Videos Routes (YouTube Import)

Handles the "Videos" tab functionality:
- POST /api/youtube-playlists/scan - Scan YouTube URL for videos
- POST /api/youtube-playlists/queue - Queue selected videos for download
- POST /api/youtube-playlists/remove - Mark videos as ignored
"""

from flask import Blueprint, jsonify, request
from sqlalchemy import func
import re
import os
import logging
import requests as http_requests

from database import Video, Channel, QueueItem, get_session
from scanner import extract_playlist_id, scan_playlist_videos, get_video_info
from utils import download_thumbnail, sanitize_folder_name

logger = logging.getLogger(__name__)

# Create Blueprint
videos_bp = Blueprint('videos_import', __name__)

# Module-level references to shared dependencies
_session_factory = None
_download_worker = None
_set_operation = None
_clear_operation = None
_parse_iso8601_duration = None
_settings_manager = None


def init_videos_routes(session_factory, download_worker,
                       set_operation, clear_operation, parse_iso8601_duration,
                       settings_manager=None):
    """Initialize the videos routes with required dependencies."""
    global _session_factory, _download_worker, _settings_manager
    global _set_operation, _clear_operation, _parse_iso8601_duration
    _session_factory = session_factory
    _download_worker = download_worker
    _set_operation = set_operation
    _clear_operation = clear_operation
    _parse_iso8601_duration = parse_iso8601_duration
    _settings_manager = settings_manager


# =============================================================================
# Helper Functions
# =============================================================================

def _get_or_create_singles_channel(session):
    """
    Get or create the special "Singles" pseudo-channel for imported videos.

    This channel is used to hold videos imported via YouTube URLs that don't
    belong to a specific tracked channel (fallback when channel_id is unknown).

    Args:
        session: Database session to use

    Returns:
        Channel: The Singles channel object
    """
    singles_channel = session.query(Channel).filter(Channel.yt_id == '__singles__').first()
    if not singles_channel:
        singles_channel = Channel(
            yt_id='__singles__',
            title='Singles',
            folder_name='Singles',
            thumbnail=None,
            auto_download=False
        )
        session.add(singles_channel)
        session.flush()
        logger.info(f"Created Singles pseudo-channel with ID: {singles_channel.id}")
    return singles_channel


def _get_or_create_channel(session, yt_channel_id, channel_title):
    """
    Get or create a channel by its YouTube channel ID.

    If the channel exists (including soft-deleted), return it.
    If not, create a new channel with the given info.

    Args:
        session: Database session to use
        yt_channel_id: YouTube channel ID (e.g., 'UC...')
        channel_title: Channel title for display

    Returns:
        Channel: The channel object
    """
    if not yt_channel_id:
        # Fall back to Singles if no channel ID
        return _get_or_create_singles_channel(session)

    # Check if channel already exists
    channel = session.query(Channel).filter(Channel.yt_id == yt_channel_id).first()

    if channel:
        # If soft-deleted, restore it
        if channel.deleted_at is not None:
            channel.deleted_at = None
            logger.info(f"Restored soft-deleted channel: {channel.title}")
        return channel

    # Create new channel (Windows-safe folder name)
    folder_name = sanitize_folder_name(channel_title) if channel_title else yt_channel_id[:50]

    # Download channel thumbnail using real yt-dlp lookup
    from utils import ensure_channel_thumbnail
    downloads_folder = os.environ.get('DOWNLOADS_DIR', 'downloads')
    thumbnail_path = ensure_channel_thumbnail(yt_channel_id, downloads_folder)

    channel = Channel(
        yt_id=yt_channel_id,
        title=channel_title or 'Unknown Channel',
        folder_name=folder_name,
        thumbnail=thumbnail_path,
        auto_download=False  # Don't auto-download by default for imported channels
    )
    session.add(channel)
    session.flush()
    logger.info(f"Created channel from import: {channel.title} (ID: {channel.id})")

    return channel


# =============================================================================
# YouTube Import Endpoints
# =============================================================================

@videos_bp.route('/api/youtube-playlists/scan', methods=['POST'])
def scan_youtube_playlist():
    """Scan a YouTube playlist or channel URL and return videos.

    Supports:
        - Single video URLs: youtube.com/watch?v=xxx, youtu.be/xxx
        - Playlist URLs: youtube.com/playlist?list=PLxxxxx
        - Channel URLs: youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name

    Query params:
        filter: 'new' (default) - only videos not in DB
                'all' - all videos with their status
    """
    data = request.json
    url = data.get('url', '')
    filter_mode = data.get('filter', 'new')  # 'new' or 'all'

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    single_video_id = None
    source_type = 'playlist'

    # First check if it's a single video URL
    video_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
    if video_match and 'list=' not in url:  # Single video (not playlist context)
        single_video_id = video_match.group(1)
        source_type = 'video'
        logger.info(f"Detected single video URL: {single_video_id}")

    # If not a single video, check for playlist or channel
    if not single_video_id:
        # Check for playlist ID in URL
        playlist_id = extract_playlist_id(url)

        if playlist_id:
            # It's a playlist URL - build full URL for yt-dlp
            url = f'https://youtube.com/playlist?list={playlist_id}'
            source_type = 'playlist'
        else:
            # Check if it's a channel URL
            is_channel_url = any(pattern in url for pattern in [
                'youtube.com/@',
                'youtube.com/channel/',
                'youtube.com/c/',
                'youtube.com/user/'
            ])

            if is_channel_url:
                source_type = 'channel'
            else:
                return jsonify({'error': 'Invalid URL. Provide a YouTube video, playlist, or channel URL'}), 400

    logger.info(f"Scanning YouTube {source_type}: {single_video_id or url} (filter={filter_mode})")
    _set_operation('scanning', f"Scanning YouTube {source_type}...")

    try:
        videos = []

        if single_video_id:
            # Fetch single video metadata using yt-dlp
            video_info = get_video_info(single_video_id)
            if video_info:
                videos = [video_info]
            else:
                _clear_operation()
                return jsonify({'error': 'Could not fetch video information'}), 400
        else:
            # Fetch playlist/channel videos using yt-dlp
            videos = scan_playlist_videos(url, max_results=500)

        with get_session(_session_factory) as session:
            # Get existing videos with their status
            existing_videos = {
                v.yt_id: v.status
                for v in session.query(Video.yt_id, Video.status).all()
            }

            if filter_mode == 'all':
                # Return all videos with their status
                result_videos = []
                for v in videos:
                    v['status'] = existing_videos.get(v['yt_id'], None)
                    result_videos.append(v)
                new_videos = result_videos
                already_in_db = sum(1 for v in videos if v['yt_id'] in existing_videos)
            else:
                # Filter to only new videos (not in DB at all)
                new_videos = [v for v in videos if v['yt_id'] not in existing_videos]
                # Add null status for new videos
                for v in new_videos:
                    v['status'] = None
                already_in_db = len(videos) - len(new_videos)

        logger.info(f"Scan complete: {len(videos)} total, {len(new_videos)} returned, {already_in_db} in DB")

        # Clear operation status
        _clear_operation()

        return jsonify({
            'total_in_playlist': len(videos),
            'new_videos_count': len(videos) - already_in_db,
            'already_in_db': already_in_db,
            'videos': new_videos
        })

    except Exception as e:
        logger.error(f"Error scanning: {e}", exc_info=True)
        _clear_operation()
        return jsonify({'error': f'Failed to scan: {str(e)}'}), 500


@videos_bp.route('/api/youtube-playlists/queue', methods=['POST'])
def queue_youtube_playlist_videos():
    """Queue videos from a YouTube playlist for download."""
    data = request.json
    videos_data = data.get('videos', [])

    if not videos_data:
        return jsonify({'error': 'No videos provided'}), 400

    logger.info(f"Queueing {len(videos_data)} videos for download")

    with get_session(_session_factory) as session:
        added = 0
        skipped = 0
        channels_created = 0

        # Cache for channels we've already looked up/created in this batch
        channel_cache = {}

        # Get max queue position once
        max_pos = session.query(func.max(QueueItem.queue_position)).scalar() or 0

        for v in videos_data:
            # Check if video already exists by yt_id
            existing = session.query(Video).filter(Video.yt_id == v['yt_id']).first()
            if existing:
                # Only allow queueing discovered or ignored videos
                if existing.status in ['discovered', 'ignored']:
                    prior_status = existing.status
                    existing.status = 'queued'
                    # Check if already has queue item
                    in_queue = session.query(QueueItem).filter(QueueItem.video_id == existing.id).first()
                    if not in_queue:
                        max_pos += 1
                        queue_item = QueueItem(video_id=existing.id, queue_position=max_pos, prior_status=prior_status)
                        session.add(queue_item)
                    added += 1
                    logger.debug(f"Re-queued existing video: {v['yt_id']} (was {prior_status})")
                else:
                    # Skip removed, queued, downloading, library
                    logger.debug(f"Skipping video with status '{existing.status}': {v['yt_id']}")
                    skipped += 1
                continue

            # Get or create the channel for this video
            yt_channel_id = v.get('channel_id')
            channel_title = v.get('channel_title', 'Unknown')

            # Use cache to avoid repeated lookups
            cache_key = yt_channel_id or '__singles__'
            if cache_key not in channel_cache:
                channel = _get_or_create_channel(session, yt_channel_id, channel_title)
                channel_cache[cache_key] = channel
                if channel.yt_id != '__singles__' and channel.id:
                    # Check if this is a newly created channel (not in DB before this batch)
                    channels_created += 1
            else:
                channel = channel_cache[cache_key]

            # Create video record (new videos have NULL prior_status)
            video = Video(
                yt_id=v['yt_id'],
                title=v['title'],
                duration_sec=v.get('duration_sec', 0),
                upload_date=v.get('upload_date'),
                thumb_url=v.get('thumbnail'),
                channel_id=channel.id,
                folder_name=channel.folder_name,
                status='queued'
            )
            session.add(video)
            session.flush()  # Get the video ID

            # Add to queue (prior_status=NULL for new videos)
            max_pos += 1
            queue_item = QueueItem(video_id=video.id, queue_position=max_pos, prior_status=None)
            session.add(queue_item)
            added += 1
            logger.debug(f"Queued video: {v['title']} to channel: {channel.title}")

        session.commit()

    logger.info(f"Playlist queue complete: {added} added, {skipped} skipped")

    # Auto-resume the download worker
    if added > 0 and _download_worker.paused:
        _download_worker.resume()
        logger.info("Auto-resumed download worker after queueing playlist videos")

    return jsonify({
        'queued': added,
        'skipped': skipped
    })


@videos_bp.route('/api/youtube-playlists/remove', methods=['POST'])
def remove_youtube_playlist_videos():
    """Mark videos as 'ignored' so they don't appear in New scans (user choice to skip)."""
    data = request.json
    videos_data = data.get('videos', [])

    if not videos_data:
        return jsonify({'error': 'No videos provided'}), 400

    logger.info(f"Marking {len(videos_data)} videos as ignored")

    with get_session(_session_factory) as session:
        removed = 0

        # Cache for channels we've already looked up/created in this batch
        channel_cache = {}

        for v in videos_data:
            yt_id = v.get('yt_id') if isinstance(v, dict) else v

            # Check if video exists
            existing = session.query(Video).filter(Video.yt_id == yt_id).first()
            if existing:
                # Update existing to ignored status (user choice to skip)
                existing.status = 'ignored'
                removed += 1
            else:
                # Get or create the channel for this video
                yt_channel_id = v.get('channel_id') if isinstance(v, dict) else None
                channel_title = v.get('channel_title', 'Unknown') if isinstance(v, dict) else 'Unknown'

                # Use cache to avoid repeated lookups
                cache_key = yt_channel_id or '__singles__'
                if cache_key not in channel_cache:
                    channel = _get_or_create_channel(session, yt_channel_id, channel_title)
                    channel_cache[cache_key] = channel
                else:
                    channel = channel_cache[cache_key]

                # Create new record with ignored status
                video = Video(
                    yt_id=yt_id,
                    title=v.get('title', 'Unknown') if isinstance(v, dict) else 'Unknown',
                    duration_sec=v.get('duration_sec', 0) if isinstance(v, dict) else 0,
                    upload_date=v.get('upload_date') if isinstance(v, dict) else None,
                    thumb_url=v.get('thumbnail') if isinstance(v, dict) else None,
                    channel_id=channel.id,
                    folder_name=channel.folder_name,
                    status='ignored'
                )
                session.add(video)
                removed += 1

        session.commit()

    logger.info(f"Marked {removed} videos as ignored")
    return jsonify({'removed': removed})
