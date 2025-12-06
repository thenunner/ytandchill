#!/usr/bin/env python3
"""
Cleanup script to remove videos from deleted channels.
Run once to clean up videos that were added before the scan fix.

This script will:
- Remove videos from channels where deleted_at is NOT NULL
- Preserve all library videos (status='library') even from deleted channels
- Delete video files and thumbnails from disk
- Remove videos from queue and playlists
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, '/appdata/backend')

from database import init_db, Video, Channel, QueueItem, PlaylistVideo, get_session

def main():
    # Initialize database
    db_path = '/appdata/data/youtube_downloader.db'
    engine, Session = init_db(f'sqlite:///{db_path}')

    with get_session(Session) as session:
        # Find videos from deleted channels (exclude library videos)
        videos = session.query(Video).join(
            Channel, Video.channel_id == Channel.id
        ).filter(
            Channel.deleted_at.isnot(None),  # Only deleted channels
            Video.status != 'library'         # Exclude library videos
        ).all()

        print(f"Found {len(videos)} videos from deleted channels to remove")

        if not videos:
            print("Nothing to clean up!")
            return

        # Show sample of what will be deleted
        print("\nSample of videos to be deleted:")
        for video in videos[:5]:
            print(f"  - {video.title} (status: {video.status})")
        if len(videos) > 5:
            print(f"  ... and {len(videos) - 5} more")

        # Confirm with user
        print(f"\nThis will delete {len(videos)} video records from the database.")
        print("Library videos will NOT be deleted.")
        response = input("Continue? (yes/no): ")

        if response.lower() != 'yes':
            print("Cancelled")
            return

        deleted_count = 0
        files_deleted = 0

        for video in videos:
            # Delete file if exists
            if video.file_path and os.path.exists(video.file_path):
                try:
                    os.remove(video.file_path)
                    files_deleted += 1
                    # Delete thumbnail
                    thumb = os.path.splitext(video.file_path)[0] + '.jpg'
                    if os.path.exists(thumb):
                        os.remove(thumb)
                except Exception as e:
                    print(f"Warning: Could not delete file {video.file_path}: {e}")

            # Remove from queue
            session.query(QueueItem).filter(QueueItem.video_id == video.id).delete()

            # Remove from playlists
            session.query(PlaylistVideo).filter(PlaylistVideo.video_id == video.id).delete()

            # Delete video record
            session.delete(video)
            deleted_count += 1

        session.commit()
        print(f"\n✓ Successfully deleted {deleted_count} videos from deleted channels")
        if files_deleted > 0:
            print(f"✓ Deleted {files_deleted} video files from disk")

if __name__ == '__main__':
    main()
