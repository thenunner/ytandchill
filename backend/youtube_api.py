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
