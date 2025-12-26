"""
Video Routes

Handles:
- GET /api/videos (list with filters)
- GET /api/videos/<id>
- PATCH /api/videos/<id>
- DELETE /api/videos/<id>
- PATCH /api/videos/bulk
- DELETE /api/videos/bulk-delete
"""

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, and_
import logging
import os

from database import Video, QueueItem, PlaylistVideo, Channel, get_session

logger = logging.getLogger(__name__)

# Create Blueprint
video_tools_bp = Blueprint('video_tools', __name__)

# Module-level references to shared dependencies
_session_factory = None
_limiter = None
_serialize_video = None


def init_video_tools_routes(session_factory, limiter, serialize_video):
    """Initialize the video tools routes with required dependencies."""
    global _session_factory, _limiter, _serialize_video
    _session_factory = session_factory
    _limiter = limiter
    _serialize_video = serialize_video


# =============================================================================
# Video Endpoints
# =============================================================================

@video_tools_bp.route('/api/videos', methods=['GET'])
def get_videos():
    with get_session(_session_factory) as session:
        # Parse query parameters
        channel_id = request.args.get('channel_id', type=int)
        folder_name = request.args.get('folder_name')  # For playlist videos
        status = request.args.get('status')
        watched = request.args.get('watched')
        ignored = request.args.get('ignored')
        search = request.args.get('search')
        min_duration = request.args.get('min_duration', type=int)
        max_duration = request.args.get('max_duration', type=int)
        upload_from = request.args.get('upload_from')  # YYYY-MM-DD format
        upload_to = request.args.get('upload_to')  # YYYY-MM-DD format

        # Import PlaylistVideo for joinedload
        from database import PlaylistVideo, Playlist

        query = session.query(Video).options(
            joinedload(Video.channel),
            joinedload(Video.playlist_videos).joinedload(PlaylistVideo.playlist)
        )

        # Exclude videos from deleted channels (except library videos)
        # Exception: Keep library videos (already downloaded) even if channel was deleted
        query = query.join(Channel, Video.channel_id == Channel.id)
        query = query.filter(
            or_(
                Channel.deleted_at.is_(None),  # Channel not deleted - show all videos
                Video.status == 'library'  # Channel deleted but video is in library - keep it
            )
        )

        # Get video IDs that are currently in the queue (exclude them from results)
        # Note: We only check presence in QueueItem table, not status (Video.status is source of truth)
        queued_video_ids = session.query(QueueItem.video_id).all()
        queued_video_ids = [vid[0] for vid in queued_video_ids]

        # Exclude queued videos from results (unless specifically filtering by 'downloading' status)
        if status != 'downloading' and queued_video_ids:
            query = query.filter(~Video.id.in_(queued_video_ids))

        if channel_id:
            query = query.filter(Video.channel_id == channel_id)
        if folder_name:
            query = query.filter(Video.folder_name == folder_name)
        # Handle ignored filter (includes 'ignored' and 'geoblocked' statuses only)
        # Note: 'not_found' is never included in any filter - only accessible via repair tool
        if ignored is not None:
            has_ignored = ignored.lower() == 'true'
            if has_ignored:
                # Include ignored and geoblocked videos in ignored filter
                query = query.filter(Video.status.in_(['ignored', 'geoblocked']))
            else:
                # Exclude ignored/geoblocked/not_found videos, but still apply status filter if provided
                query = query.filter(~Video.status.in_(['ignored', 'geoblocked', 'not_found']))
                if status:
                    query = query.filter(Video.status == status)
        elif status:
            # Apply status filter when ignored parameter is not present
            query = query.filter(Video.status == status)
            # Always exclude 'not_found' from normal queries
            query = query.filter(Video.status != 'not_found')
        else:
            # No status or ignored filter - exclude 'not_found' from normal queries
            query = query.filter(Video.status != 'not_found')
        if watched is not None:
            query = query.filter(Video.watched == (watched.lower() == 'true'))
        if search:
            # Split search into individual words and match each word independently (case-insensitive)
            search_terms = search.lower().split()
            for term in search_terms:
                query = query.filter(Video.title.ilike(f'%{term}%'))
        if min_duration is not None:
            query = query.filter(Video.duration_sec >= min_duration * 60)
        if max_duration is not None:
            query = query.filter(Video.duration_sec <= max_duration * 60)
        if upload_from:
            # Filter by downloaded_at (when video was added to library)
            # upload_from is YYYY-MM-DD format, convert to datetime for comparison
            query = query.filter(Video.downloaded_at.isnot(None), Video.downloaded_at >= upload_from)
        if upload_to:
            # Filter by downloaded_at (when video was added to library)
            # Add one day to upload_to to include videos downloaded on that day
            from datetime import datetime, timedelta
            upload_to_date = datetime.strptime(upload_to, '%Y-%m-%d')
            upload_to_inclusive = (upload_to_date + timedelta(days=1)).strftime('%Y-%m-%d')
            query = query.filter(Video.downloaded_at.isnot(None), Video.downloaded_at < upload_to_inclusive)

        videos = query.order_by(Video.discovered_at.desc()).all()
        result = [_serialize_video(v) for v in videos]

        return jsonify(result)


@video_tools_bp.route('/api/videos/<int:video_id>', methods=['GET'])
def get_video(video_id):
    with get_session(_session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()

        if not video:
            return jsonify({'error': 'Video not found'}), 404

        result = _serialize_video(video)
        return jsonify(result)


@video_tools_bp.route('/api/videos/<int:video_id>', methods=['PATCH'])
def update_video(video_id):
    data = request.json

    with get_session(_session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            logger.debug(f"Video update requested for non-existent video ID: {video_id}")
            return jsonify({'error': 'Video not found'}), 404

        changes = []
        if 'watched' in data:
            video.watched = data['watched']
            changes.append(f"watched={data['watched']}")
        if 'playback_seconds' in data:
            video.playback_seconds = data['playback_seconds']
            changes.append(f"playback={data['playback_seconds']}s")
        if 'status' in data:
            old_status = video.status
            video.status = data['status']
            changes.append(f"status: {old_status} -> {data['status']}")

        if changes:
            logger.debug(f"Updated video '{video.title}' (ID: {video_id}): {', '.join(changes)}")

        session.commit()
        result = _serialize_video(video)

        return jsonify(result)


@video_tools_bp.route('/api/videos/<int:video_id>', methods=['DELETE'])
def delete_video(video_id):
    with get_session(_session_factory) as session:
        video = session.query(Video).filter(Video.id == video_id).first()
        if not video:
            return jsonify({'error': 'Video not found'}), 404

        # Check if this is a Singles video (belongs to __singles__ channel)
        is_singles = False
        if video.channel:
            is_singles = video.channel.yt_id == '__singles__'

        # Delete video file if it exists
        if video.file_path and os.path.exists(video.file_path):
            try:
                os.remove(video.file_path)
                print(f"Deleted video file: {video.file_path}")
            except Exception as e:
                print(f"Error deleting video file: {e}")

        # Delete thumbnail if it exists (typically same name as video with .jpg extension)
        if video.file_path:
            thumb_path = os.path.splitext(video.file_path)[0] + '.jpg'
            if os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                    print(f"Deleted thumbnail: {thumb_path}")
                except Exception as e:
                    print(f"Error deleting thumbnail: {e}")

        # Remove from queue if present
        queue_item = session.query(QueueItem).filter(QueueItem.video_id == video.id).first()
        if queue_item:
            session.delete(queue_item)
            print(f"Removed video from queue")

        if is_singles:
            # Hard delete Singles videos - allows re-downloading
            # Remove from any playlists first
            session.query(PlaylistVideo).filter(PlaylistVideo.video_id == video.id).delete()
            session.delete(video)
            print(f"Hard deleted Singles video: {video.yt_id}")
        else:
            # Soft-delete for channel videos: Set status to 'ignored'
            # This prevents the video from being re-queued on future scans
            video.status = 'ignored'
            video.file_path = None
            video.file_size_bytes = None
            video.downloaded_at = None

        session.commit()

        return '', 204


@video_tools_bp.route('/api/videos/bulk', methods=['PATCH'])
def bulk_update_videos():
    data = request.json
    video_ids = data.get('video_ids', [])
    updates = data.get('updates', {})

    with get_session(_session_factory) as session:
        videos = session.query(Video).filter(Video.id.in_(video_ids)).all()

        for video in videos:
            if 'watched' in updates:
                video.watched = updates['watched']
            if 'status' in updates:
                video.status = updates['status']

        session.commit()

        return jsonify({'updated': len(videos)})


@video_tools_bp.route('/api/videos/bulk-delete', methods=['DELETE'])
def bulk_delete_videos():
    """Delete multiple videos in a single transaction"""
    data = request.json
    video_ids = data.get('video_ids', [])

    if not video_ids:
        return jsonify({'error': 'video_ids array is required'}), 400

    if not isinstance(video_ids, list):
        return jsonify({'error': 'video_ids must be an array'}), 400

    with get_session(_session_factory) as session:
        videos = session.query(Video).filter(Video.id.in_(video_ids)).all()

        deleted_count = 0
        for video in videos:
            # Delete video file if it exists
            if video.file_path and os.path.exists(video.file_path):
                try:
                    os.remove(video.file_path)
                    logger.debug(f"Deleted video file: {video.file_path}")
                except Exception as e:
                    logger.error(f"Error deleting video file: {e}")

            # Delete thumbnail if it exists
            if video.file_path:
                thumb_path = os.path.splitext(video.file_path)[0] + '.jpg'
                if os.path.exists(thumb_path):
                    try:
                        os.remove(thumb_path)
                        logger.debug(f"Deleted thumbnail: {thumb_path}")
                    except Exception as e:
                        logger.error(f"Error deleting thumbnail: {e}")

            # Remove from queue if present
            queue_item = session.query(QueueItem).filter(QueueItem.video_id == video.id).first()
            if queue_item:
                session.delete(queue_item)

            # Soft-delete: Set status to 'ignored' instead of removing record
            video.status = 'ignored'
            video.file_path = None
            video.file_size_bytes = None
            video.downloaded_at = None

            deleted_count += 1

        session.commit()
        logger.info(f"Bulk deleted {deleted_count} videos")

        return jsonify({'deleted': deleted_count}), 200
