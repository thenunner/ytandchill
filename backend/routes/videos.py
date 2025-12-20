"""
Videos Routes (YouTube Import)

Handles the "Videos" tab functionality:
- POST /api/youtube-playlists/scan - Scan YouTube URL for videos
- POST /api/youtube-playlists/queue - Queue selected videos for download
- POST /api/youtube-playlists/remove - Mark videos as ignored
"""

from flask import Blueprint, jsonify, request
from sqlalchemy import func
from googleapiclient.errors import HttpError
import logging

from database import Video, Channel, QueueItem, get_session

logger = logging.getLogger(__name__)

# Create Blueprint
videos_bp = Blueprint('videos_import', __name__)

# Module-level references to shared dependencies
_session_factory = None
_download_worker = None
_get_youtube_client = None
_set_operation = None
_clear_operation = None
_parse_iso8601_duration = None


def init_videos_routes(session_factory, download_worker, get_youtube_client,
                       set_operation, clear_operation, parse_iso8601_duration):
    """Initialize the videos routes with required dependencies."""
    global _session_factory, _download_worker, _get_youtube_client
    global _set_operation, _clear_operation, _parse_iso8601_duration
    _session_factory = session_factory
    _download_worker = download_worker
    _get_youtube_client = get_youtube_client
    _set_operation = set_operation
    _clear_operation = clear_operation
    _parse_iso8601_duration = parse_iso8601_duration


# =============================================================================
# Helper Functions
# =============================================================================

def _get_or_create_singles_channel(session):
    """
    Get or create the special "Singles" pseudo-channel for imported videos.

    This channel is used to hold videos imported via YouTube URLs that don't
    belong to a specific tracked channel.

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


# =============================================================================
# YouTube Import Endpoints
# =============================================================================

@videos_bp.route('/api/youtube-playlists/scan', methods=['POST'])
def scan_youtube_playlist():
    """Scan a YouTube playlist or channel URL and return videos.

    Supports:
        - Playlist URLs: youtube.com/playlist?list=PLxxxxx
        - Channel URLs: youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name

    Query params:
        filter: 'new' (default) - only videos not in DB
                'all' - all videos with their status
    """
    from scanner import YouTubeAPIClient

    data = request.json
    url = data.get('url', '')
    filter_mode = data.get('filter', 'new')  # 'new' or 'all'

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    import re
    youtube = _get_youtube_client()
    playlist_id = None
    single_video_id = None
    source_type = 'playlist'

    # First check if it's a single video URL
    video_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
    if video_match and 'list=' not in url:  # Single video (not playlist context)
        single_video_id = video_match.group(1)
        source_type = 'video'
        logger.info(f"Detected single video URL: {single_video_id}")

    # If not a single video, try playlist ID
    if not single_video_id:
        playlist_id = YouTubeAPIClient.extract_playlist_id(url)

    # If no playlist ID, check if it's a channel URL
    if not single_video_id and not playlist_id:
        # Check for channel URL patterns
        is_channel_url = any(pattern in url for pattern in [
            'youtube.com/@',
            'youtube.com/channel/',
            'youtube.com/c/',
            'youtube.com/user/'
        ])

        if is_channel_url:
            try:
                # Resolve channel ID from URL
                channel_id = youtube.resolve_channel_id_from_url(url)
                if not channel_id:
                    return jsonify({'error': 'Could not resolve channel from URL'}), 400

                # Get channel info to find uploads playlist
                channel_info = youtube.get_channel_info(channel_id)
                if not channel_info:
                    return jsonify({'error': 'Could not get channel information'}), 400

                playlist_id = channel_info['uploads_playlist']
                source_type = 'channel'
                logger.info(f"Resolved channel URL to uploads playlist: {playlist_id}")
            except Exception as e:
                logger.error(f"Error resolving channel URL: {e}")
                return jsonify({'error': f'Failed to resolve channel: {str(e)}'}), 400
        else:
            return jsonify({'error': 'Invalid URL. Provide a YouTube video, playlist, or channel URL'}), 400

    logger.info(f"Scanning YouTube {source_type}: {single_video_id or playlist_id} (filter={filter_mode})")
    _set_operation('scanning', f"Scanning YouTube {source_type}...")

    try:
        # Handle single video vs playlist/channel
        if single_video_id:
            # Fetch single video metadata
            videos_response = youtube.youtube.videos().list(
                part='snippet,contentDetails,statistics',
                id=single_video_id
            ).execute()

            videos = []
            for video in videos_response.get('items', []):
                if 'duration' not in video.get('contentDetails', {}):
                    continue
                duration_str = video['contentDetails']['duration']
                duration_sec = _parse_iso8601_duration(duration_str)
                videos.append({
                    'yt_id': video['id'],
                    'title': video['snippet']['title'],
                    'duration_sec': duration_sec,
                    'upload_date': video['snippet']['publishedAt'][:10].replace('-', ''),
                    'thumbnail': video['snippet']['thumbnails'].get('high', {}).get('url'),
                    'channel_title': video['snippet'].get('channelTitle', 'Unknown')
                })
        else:
            # Fetch playlist/channel videos
            videos = youtube.get_playlist_videos(playlist_id)

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

        logger.info(f"Playlist scan complete: {len(videos)} total, {len(new_videos)} returned, {already_in_db} in DB")

        # Clear operation status
        _clear_operation()

        return jsonify({
            'total_in_playlist': len(videos),
            'new_videos_count': len(videos) - already_in_db,
            'already_in_db': already_in_db,
            'videos': new_videos
        })

    except HttpError as e:
        logger.error(f"YouTube API error scanning playlist: {e}")
        _clear_operation()
        return jsonify({'error': f'YouTube API error: {str(e)}'}), 500
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        _clear_operation()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error scanning playlist: {e}", exc_info=True)
        _clear_operation()
        return jsonify({'error': f'Failed to scan playlist: {str(e)}'}), 500


@videos_bp.route('/api/youtube-playlists/queue', methods=['POST'])
def queue_youtube_playlist_videos():
    """Queue videos from a YouTube playlist for download."""
    data = request.json
    videos_data = data.get('videos', [])

    if not videos_data:
        return jsonify({'error': 'No videos provided'}), 400

    logger.info(f"Queueing {len(videos_data)} videos to Singles folder")

    with get_session(_session_factory) as session:
        added = 0
        skipped = 0

        # Get or create a special "Singles" channel to hold imported videos
        singles_channel = _get_or_create_singles_channel(session)

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

            # Create video record (new videos have NULL prior_status)
            video = Video(
                yt_id=v['yt_id'],
                title=v['title'],
                duration_sec=v.get('duration_sec', 0),
                upload_date=v.get('upload_date'),
                thumb_url=v.get('thumbnail'),
                channel_id=singles_channel.id,  # Use the Singles pseudo-channel
                folder_name='Singles',
                status='queued'
            )
            session.add(video)
            session.flush()  # Get the video ID

            # Add to queue (prior_status=NULL for new videos)
            max_pos += 1
            queue_item = QueueItem(video_id=video.id, queue_position=max_pos, prior_status=None)
            session.add(queue_item)
            added += 1
            logger.debug(f"Queued video: {v['title']} (ID: {video.id})")

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

        # Get or create Singles channel (needed for channel_id)
        singles_channel = _get_or_create_singles_channel(session)

        for v in videos_data:
            yt_id = v.get('yt_id') if isinstance(v, dict) else v

            # Check if video exists
            existing = session.query(Video).filter(Video.yt_id == yt_id).first()
            if existing:
                # Update existing to ignored status (user choice to skip)
                existing.status = 'ignored'
                removed += 1
            else:
                # Create new record with ignored status
                video = Video(
                    yt_id=yt_id,
                    title=v.get('title', 'Unknown') if isinstance(v, dict) else 'Unknown',
                    duration_sec=v.get('duration_sec', 0) if isinstance(v, dict) else 0,
                    upload_date=v.get('upload_date') if isinstance(v, dict) else None,
                    thumb_url=v.get('thumbnail') if isinstance(v, dict) else None,
                    channel_id=singles_channel.id,
                    folder_name='Singles',
                    status='ignored'
                )
                session.add(video)
                removed += 1

        session.commit()

    logger.info(f"Marked {removed} videos as ignored")
    return jsonify({'removed': removed})
