"""
YouTube Data API Client

Provides batch fetching of video metadata (upload dates) via YouTube API.
Used to supplement yt-dlp flat-playlist scans which don't return upload_date.
"""

import requests
import logging

logger = logging.getLogger(__name__)

# YouTube API endpoint
YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'


def fetch_video_dates(video_ids: list, api_key: str) -> dict:
    """
    Batch fetch upload dates from YouTube Data API.

    Args:
        video_ids: List of YouTube video IDs (11 characters each)
        api_key: YouTube Data API key

    Returns:
        Dict mapping video_id -> upload_date (YYYYMMDD format)
        Videos not found in API response are omitted from result.
    """
    if not video_ids or not api_key:
        return {}

    results = {}
    total = len(video_ids)
    fetched = 0

    logger.info(f"Fetching upload dates for {total} videos via YouTube API")

    # Process in batches of 50 (API limit)
    for i in range(0, total, 50):
        batch = video_ids[i:i + 50]
        batch_num = (i // 50) + 1
        total_batches = (total + 49) // 50

        try:
            response = requests.get(
                f'{YOUTUBE_API_BASE}/videos',
                params={
                    'part': 'snippet',
                    'id': ','.join(batch),
                    'key': api_key
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                for item in data.get('items', []):
                    video_id = item.get('id')
                    snippet = item.get('snippet', {})
                    published_at = snippet.get('publishedAt')  # ISO 8601: 2023-01-15T10:30:00Z

                    if video_id and published_at:
                        # Convert ISO 8601 to YYYYMMDD format
                        # publishedAt format: "2023-01-15T10:30:00Z"
                        upload_date = published_at[:10].replace('-', '')
                        results[video_id] = upload_date
                        fetched += 1

                logger.debug(f"Batch {batch_num}/{total_batches}: fetched {len(batch)} videos")

            elif response.status_code == 403:
                error_msg = response.json().get('error', {}).get('message', 'Unknown error')
                if 'quota' in error_msg.lower():
                    logger.error(f"YouTube API quota exceeded: {error_msg}")
                else:
                    logger.error(f"YouTube API forbidden: {error_msg}")
                break  # Stop processing on quota/auth errors

            elif response.status_code == 400:
                error_msg = response.json().get('error', {}).get('message', 'Unknown error')
                logger.error(f"YouTube API bad request: {error_msg}")
                # Continue with next batch - might be invalid video IDs

            else:
                logger.warning(f"YouTube API error {response.status_code}: {response.text[:200]}")

        except requests.exceptions.Timeout:
            logger.warning(f"YouTube API timeout on batch {batch_num}")
            continue
        except requests.exceptions.RequestException as e:
            logger.error(f"YouTube API request failed: {e}")
            break

    logger.info(f"Fetched upload dates for {fetched}/{total} videos")
    return results


def test_api_key(api_key: str) -> tuple:
    """
    Test if a YouTube API key is valid.

    Args:
        api_key: YouTube Data API key to test

    Returns:
        Tuple of (is_valid: bool, error_message: str or None)
    """
    if not api_key:
        return False, "No API key provided"

    try:
        # Test with a known video (Rick Astley - Never Gonna Give You Up)
        response = requests.get(
            f'{YOUTUBE_API_BASE}/videos',
            params={
                'part': 'snippet',
                'id': 'dQw4w9WgXcQ',
                'key': api_key
            },
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            if data.get('items'):
                return True, None
            else:
                return False, "API key works but returned no results"

        elif response.status_code == 400:
            error = response.json().get('error', {})
            message = error.get('message', 'Bad request')
            return False, f"Invalid API key: {message}"

        elif response.status_code == 403:
            error = response.json().get('error', {})
            message = error.get('message', 'Forbidden')
            if 'quota' in message.lower():
                return False, "API quota exceeded"
            return False, f"API key rejected: {message}"

        else:
            return False, f"Unexpected response: {response.status_code}"

    except requests.exceptions.Timeout:
        return False, "Request timed out"
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"


def scan_channel_videos_api(channel_id: str, api_key: str, max_results: int = 50) -> tuple:
    """
    Scan a channel's recent videos using YouTube Data API.

    Much faster than yt-dlp - fetches 50 videos per request.

    Args:
        channel_id: YouTube channel ID (starts with UC)
        api_key: YouTube Data API key
        max_results: Maximum videos to fetch (default 50)

    Returns:
        Tuple of (videos: list, error: str or None)
        videos: List of dicts with keys: id, title, duration_sec, upload_date, thumbnail
    """
    if not channel_id or not api_key:
        return [], "Missing channel_id or api_key"

    # Convert channel ID to uploads playlist ID (UC -> UU)
    if channel_id.startswith('UC'):
        uploads_playlist_id = 'UU' + channel_id[2:]
    else:
        return [], f"Invalid channel ID format: {channel_id}"

    videos = []
    video_ids = []
    next_page_token = None

    try:
        # Step 1: Get video IDs from uploads playlist
        while len(video_ids) < max_results:
            params = {
                'part': 'snippet',
                'playlistId': uploads_playlist_id,
                'maxResults': min(50, max_results - len(video_ids)),
                'key': api_key
            }
            if next_page_token:
                params['pageToken'] = next_page_token

            response = requests.get(
                f'{YOUTUBE_API_BASE}/playlistItems',
                params=params,
                timeout=30
            )

            if response.status_code == 403:
                error = response.json().get('error', {}).get('message', 'Forbidden')
                if 'quota' in error.lower():
                    return [], "API quota exceeded"
                return [], f"API error: {error}"

            if response.status_code != 200:
                return [], f"API error: {response.status_code}"

            data = response.json()

            for item in data.get('items', []):
                snippet = item.get('snippet', {})
                video_id = snippet.get('resourceId', {}).get('videoId')
                if video_id:
                    video_ids.append(video_id)
                    # Store basic info from playlist response
                    published_at = snippet.get('publishedAt', '')
                    upload_date = published_at[:10].replace('-', '') if published_at else None
                    videos.append({
                        'id': video_id,
                        'title': snippet.get('title', 'Untitled'),
                        'upload_date': upload_date,
                        'thumbnail': f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg',
                        'duration_sec': None  # Will be filled in step 2
                    })

            next_page_token = data.get('nextPageToken')
            if not next_page_token:
                break

        # Step 2: Get video durations in batches
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i + 50]

            response = requests.get(
                f'{YOUTUBE_API_BASE}/videos',
                params={
                    'part': 'contentDetails',
                    'id': ','.join(batch),
                    'key': api_key
                },
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                duration_map = {}

                for item in data.get('items', []):
                    vid_id = item.get('id')
                    content = item.get('contentDetails', {})
                    duration_iso = content.get('duration', '')  # PT1H2M3S format

                    if vid_id and duration_iso:
                        duration_map[vid_id] = parse_iso8601_duration(duration_iso)

                # Update videos with durations
                for video in videos:
                    if video['id'] in duration_map:
                        video['duration_sec'] = duration_map[video['id']]

        # Filter out videos without duration (private/deleted)
        videos = [v for v in videos if v.get('duration_sec') is not None]

        logger.info(f"API scan complete: {len(videos)} videos from channel {channel_id}")
        return videos, None

    except requests.exceptions.Timeout:
        return [], "API request timed out"
    except requests.exceptions.RequestException as e:
        return [], f"API request failed: {str(e)}"


def parse_iso8601_duration(duration: str) -> int:
    """
    Parse ISO 8601 duration (PT1H2M3S) to seconds.

    Args:
        duration: ISO 8601 duration string (e.g., "PT1H2M3S", "PT5M", "PT30S")

    Returns:
        Duration in seconds
    """
    import re

    if not duration or not duration.startswith('PT'):
        return 0

    hours = 0
    minutes = 0
    seconds = 0

    # Extract hours
    h_match = re.search(r'(\d+)H', duration)
    if h_match:
        hours = int(h_match.group(1))

    # Extract minutes
    m_match = re.search(r'(\d+)M', duration)
    if m_match:
        minutes = int(m_match.group(1))

    # Extract seconds
    s_match = re.search(r'(\d+)S', duration)
    if s_match:
        seconds = int(s_match.group(1))

    return hours * 3600 + minutes * 60 + seconds
