#!/usr/bin/env python3
"""
Diagnostic script to investigate why certain videos are missing 'duration' field
from YouTube API but show as public/processed.
"""

from googleapiclient.discovery import build
from models import Setting, init_db

# Initialize database
Session = init_db()
session = Session()

# Get YouTube API key from database
api_key_setting = session.query(Setting).filter(Setting.key == 'youtube_api_key').first()
if not api_key_setting or not api_key_setting.value:
    print("ERROR: YouTube API key not configured")
    session.close()
    exit(1)

youtube = build('youtube', 'v3', developerKey=api_key_setting.value)
session.close()

# Video IDs that are causing issues
problem_video_ids = [
    'QflUZ3R4V9M',  # Variant
    'tkB3biKkCwU',  # FEY
    'lTRNNTtPAb0',  # OUTER DARKNESS
    'zt0ahOwtyCQ',  # Unnatural
    'v-n1cTSiG4Y',  # Sea to Sky 2025
]

print("=" * 80)
print("DIAGNOSTIC: Investigating videos missing 'duration' field")
print("=" * 80)
print()

for video_id in problem_video_ids:
    print(f"\n--- Video ID: {video_id} ---")

    try:
        response = youtube.videos().list(
            part='snippet,contentDetails,status,liveStreamingDetails',
            id=video_id
        ).execute()

        if not response.get('items'):
            print("  ERROR: Video not found in API response")
            continue

        video_data = response['items'][0]

        # Basic info
        title = video_data.get('snippet', {}).get('title', 'Unknown')
        print(f"  Title: {title}")

        # Status
        status_info = video_data.get('status', {})
        print(f"  Privacy Status: {status_info.get('privacyStatus', 'unknown')}")
        print(f"  Upload Status: {status_info.get('uploadStatus', 'unknown')}")
        print(f"  Made for Kids: {status_info.get('madeForKids', 'unknown')}")

        # Live broadcast info
        live_broadcast = video_data.get('snippet', {}).get('liveBroadcastContent', 'none')
        print(f"  Live Broadcast Content: {live_broadcast}")

        # Content details
        print(f"  Has contentDetails: {'contentDetails' in video_data}")
        if 'contentDetails' in video_data:
            content_details = video_data['contentDetails']
            print(f"  ContentDetails keys: {list(content_details.keys())}")
            print(f"  Has duration field: {'duration' in content_details}")
            if 'duration' in content_details:
                print(f"  Duration value: {content_details['duration']}")
            else:
                print(f"  Duration: MISSING!")
                # Print all contentDetails to see what's there
                print(f"  Full contentDetails: {content_details}")

        # Live streaming details (for premieres/live)
        if 'liveStreamingDetails' in video_data:
            live_details = video_data['liveStreamingDetails']
            print(f"  Live Streaming Details:")
            print(f"    Keys: {list(live_details.keys())}")
            if 'scheduledStartTime' in live_details:
                print(f"    Scheduled Start: {live_details['scheduledStartTime']}")
            if 'actualStartTime' in live_details:
                print(f"    Actual Start: {live_details['actualStartTime']}")
            if 'actualEndTime' in live_details:
                print(f"    Actual End: {live_details['actualEndTime']}")

    except Exception as e:
        print(f"  ERROR: {e}")

print("\n" + "=" * 80)
print("DIAGNOSIS COMPLETE")
print("=" * 80)
