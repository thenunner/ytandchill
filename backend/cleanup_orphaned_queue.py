#!/usr/bin/env python3
"""
Cleanup script to remove orphaned QueueItems.

Orphaned QueueItems are queue entries for videos that are no longer
in 'queued' or 'downloading' status. These can occur if session.delete()
or session.commit() fails during download finalization.

This script can be run manually or called from the API.
"""

from database import SessionLocal, Video, QueueItem
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def cleanup_orphaned_queue_items():
    """
    Find and delete QueueItems for videos that are not in 'queued' or 'downloading' status.

    Returns:
        dict: Statistics about cleaned items
    """
    session = SessionLocal()
    try:
        # Find orphaned queue items
        orphaned = session.query(QueueItem, Video).join(Video).filter(
            ~Video.status.in_(['queued', 'downloading'])
        ).all()

        if not orphaned:
            logger.info("No orphaned queue items found")
            return {'cleaned': 0, 'details': []}

        details = []
        for qi, v in orphaned:
            details.append({
                'queue_item_id': qi.id,
                'video_id': v.id,
                'video_yt_id': v.yt_id,
                'video_title': v.title,
                'video_status': v.status,
                'progress_pct': qi.progress_pct
            })
            logger.info(f"Deleting orphaned QueueItem {qi.id} for video {v.yt_id} (status: {v.status}, progress: {qi.progress_pct}%)")
            session.delete(qi)

        session.commit()
        logger.info(f"Successfully cleaned {len(orphaned)} orphaned queue items")

        return {
            'cleaned': len(orphaned),
            'details': details
        }

    except Exception as e:
        session.rollback()
        logger.error(f"Error cleaning orphaned queue items: {e}", exc_info=True)
        raise
    finally:
        session.close()


def check_orphaned_queue_items():
    """
    Check for orphaned queue items without deleting them.

    Returns:
        dict: Statistics about orphaned items
    """
    session = SessionLocal()
    try:
        # Find orphaned queue items
        orphaned = session.query(QueueItem, Video).join(Video).filter(
            ~Video.status.in_(['queued', 'downloading'])
        ).all()

        details = []
        for qi, v in orphaned:
            details.append({
                'queue_item_id': qi.id,
                'video_id': v.id,
                'video_yt_id': v.yt_id,
                'video_title': v.title,
                'video_status': v.status,
                'progress_pct': qi.progress_pct
            })

        # Count discovered videos
        discovered_total = session.query(Video).filter(Video.status == 'discovered').count()

        # Count discovered videos that would show (not in queue)
        queued_ids = [qi.video_id for qi in session.query(QueueItem).all()]
        discovered_visible = session.query(Video).filter(
            Video.status == 'discovered',
            ~Video.id.in_(queued_ids) if queued_ids else True
        ).count()

        return {
            'orphaned_count': len(orphaned),
            'orphaned_details': details,
            'discovered_total': discovered_total,
            'discovered_visible': discovered_visible,
            'discovered_hidden': discovered_total - discovered_visible
        }

    finally:
        session.close()


if __name__ == '__main__':
    print("=== Checking for Orphaned Queue Items ===")
    stats = check_orphaned_queue_items()

    print(f"\nOrphaned QueueItems: {stats['orphaned_count']}")
    for item in stats['orphaned_details']:
        print(f"  - QueueItem {item['queue_item_id']}: {item['video_title'][:50]} (status: {item['video_status']}, progress: {item['progress_pct']}%)")

    print(f"\nDiscovered Videos:")
    print(f"  Total: {stats['discovered_total']}")
    print(f"  Visible: {stats['discovered_visible']}")
    print(f"  Hidden by orphaned QueueItems: {stats['discovered_hidden']}")

    if stats['orphaned_count'] > 0:
        response = input(f"\nClean up {stats['orphaned_count']} orphaned queue items? (y/n): ")
        if response.lower() == 'y':
            result = cleanup_orphaned_queue_items()
            print(f"\n✓ Cleaned {result['cleaned']} orphaned queue items")
        else:
            print("\nSkipped cleanup")
    else:
        print("\n✓ No cleanup needed")
