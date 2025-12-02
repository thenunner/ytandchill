"""
YouTube API Client for channel and video operations.

This module provides a centralized client for all YouTube Data API interactions,
including channel discovery, video scanning, and metadata retrieval.
"""

import logging
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from utils import parse_iso8601_duration

logger = logging.getLogger(__name__)


class YouTubeAPIClient:
    """
    Centralized YouTube Data API client with error handling.

    This client provides a clean interface for all YouTube API operations,
    with consistent error handling and logging.

    Usage:
        client = YouTubeAPIClient(api_key)

        # Get channel info
        info = client.get_channel_info('UC_channel_id')

        # Scan channel videos
        videos = client.scan_channel_videos('UC_channel_id', max_results=50)

        # Resolve channel ID from URL
        channel_id = client.resolve_channel_id_from_url('https://youtube.com/@channelname')
    """

    def __init__(self, api_key):
        """
        Initialize YouTube API client.

        Args:
            api_key: YouTube Data API v3 key
        """
        if not api_key:
            raise ValueError('YouTube API key is required')

        self.api_key = api_key
        self.youtube = build('youtube', 'v3', developerKey=api_key, cache_discovery=False)
        logger.debug('YouTube API client initialized')

    def get_channel_info(self, channel_id):
        """
        Get channel metadata using Data API.

        Args:
            channel_id: YouTube channel ID (starts with 'UC')

        Returns:
            dict: Channel info with keys: id, title, thumbnail, uploads_playlist
            None: If channel not found or API error

        Raises:
            HttpError: If API request fails
        """
        try:
            response = self.youtube.channels().list(
                part='snippet,contentDetails,statistics',
                id=channel_id
            ).execute()

            if not response.get('items'):
                logger.warning(f'Channel not found: {channel_id}')
                return None

            channel_data = response['items'][0]
            return {
                'id': channel_id,
                'title': channel_data['snippet']['title'],
                'thumbnail': channel_data['snippet']['thumbnails'].get('high', {}).get('url'),
                'uploads_playlist': channel_data['contentDetails']['relatedPlaylists']['uploads']
            }
        except HttpError as e:
            logger.error(f'YouTube API error getting channel info for {channel_id}: {e}')
            raise

    def scan_channel_videos(self, channel_id, max_results=50):
        """
        Scan channel videos using Data API (fast and reliable).

        Fetches videos from the channel's uploads playlist, filtering out:
        - Videos without duration (deleted/private)
        - Videos under 2 minutes (YouTube Shorts)

        Args:
            channel_id: YouTube channel ID
            max_results: Maximum number of videos to fetch (default: 50)

        Returns:
            list: List of video dicts with keys: id, title, duration_sec, upload_date, thumbnail
            Empty list on error

        Note:
            Each video dict has upload_date in YYYYMMDD format (e.g., '20240315')
        """
        try:
            # First get channel info to find uploads playlist
            channel_info = self.get_channel_info(channel_id)
            if not channel_info:
                logger.error(f'Could not get channel info for {channel_id}')
                return []

            uploads_playlist_id = channel_info['uploads_playlist']
            logger.debug(f'Scanning uploads playlist: {uploads_playlist_id}')
            videos = []
            next_page_token = None

            while len(videos) < max_results:
                # Get videos from uploads playlist (paginated)
                playlist_response = self.youtube.playlistItems().list(
                    part='snippet,contentDetails',
                    playlistId=uploads_playlist_id,
                    maxResults=min(50, max_results - len(videos)),
                    pageToken=next_page_token
                ).execute()

                video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]
                logger.debug(f'Found {len(video_ids)} video IDs in this page')

                if video_ids:
                    # Get detailed video info (including duration) in batch
                    videos_response = self.youtube.videos().list(
                        part='snippet,contentDetails,statistics',
                        id=','.join(video_ids)
                    ).execute()

                    for video in videos_response.get('items', []):
                        # Skip videos without duration (deleted, private, etc)
                        if 'duration' not in video.get('contentDetails', {}):
                            logger.debug(f"Skipping video {video['id']}: no duration (possibly deleted/private)")
                            continue

                        # Parse ISO 8601 duration (PT1H2M10S -> seconds)
                        duration_str = video['contentDetails']['duration']
                        duration_sec = parse_iso8601_duration(duration_str)

                        # Skip videos under 2 minutes (120 seconds)
                        # This filters out YouTube Shorts and very short videos
                        if duration_sec < 120:
                            logger.debug(f"Skipping video {video['id']}: duration {duration_sec}s (<2 min)")
                            continue

                        videos.append({
                            'id': video['id'],
                            'title': video['snippet']['title'],
                            'duration_sec': duration_sec,
                            'upload_date': video['snippet']['publishedAt'][:10].replace('-', ''),
                            'thumbnail': video['snippet']['thumbnails'].get('high', {}).get('url')
                        })

                next_page_token = playlist_response.get('nextPageToken')
                if not next_page_token:
                    break

            logger.debug(f'Total videos scanned: {len(videos)}')
            return videos

        except HttpError as e:
            logger.error(f'YouTube API error scanning channel {channel_id}: {e}')
            raise
        except Exception as e:
            logger.error(f'Error in scan_channel_videos for {channel_id}: {e}', exc_info=True)
            return []

    def resolve_channel_id_from_url(self, url):
        """
        Resolve channel ID from various YouTube URL formats using Data API.

        Supports:
        - youtube.com/@handle
        - youtube.com/channel/UC...
        - youtube.com/c/customname

        Args:
            url: YouTube channel URL

        Returns:
            str: Channel ID (UC...) if found
            None: If channel not found or URL format not recognized

        Raises:
            HttpError: If API request fails
        """
        try:
            # Handle @username URLs
            if 'youtube.com/@' in url:
                handle = url.split('/@')[1].split('/')[0].split('?')[0]

                # Try forHandle first (works for @handle format)
                try:
                    response = self.youtube.channels().list(
                        part='snippet',
                        forHandle=handle
                    ).execute()
                    if response.get('items'):
                        channel_id = response['items'][0]['id']
                        logger.debug(f'Resolved @{handle} to {channel_id} via forHandle')
                        return channel_id
                except HttpError as e:
                    logger.debug(f'forHandle lookup failed for @{handle}: {e}')

                # Try forUsername as fallback (works for some older handles)
                try:
                    response = self.youtube.channels().list(
                        part='snippet',
                        forUsername=handle
                    ).execute()
                    if response.get('items'):
                        channel_id = response['items'][0]['id']
                        logger.debug(f'Resolved @{handle} to {channel_id} via forUsername')
                        return channel_id
                except HttpError:
                    pass

                # Last resort: Use search with exact query match
                search_response = self.youtube.search().list(
                    part='snippet',
                    q=f'"{handle}"',
                    type='channel',
                    maxResults=5
                ).execute()

                # Look for exact handle match in results
                if search_response.get('items'):
                    for item in search_response['items']:
                        channel_id = item['snippet']['channelId']

                        # Get channel details to check custom URL
                        channel_details = self.youtube.channels().list(
                            part='snippet',
                            id=channel_id
                        ).execute()

                        if channel_details.get('items'):
                            custom_url = channel_details['items'][0]['snippet'].get('customUrl', '')
                            # Check if customUrl matches the handle (with or without @)
                            if custom_url.lower() == f'@{handle.lower()}' or custom_url.lower() == handle.lower():
                                logger.debug(f'Resolved @{handle} to {channel_id} via search')
                                return channel_id

                    # If no exact match found, return first result (with warning)
                    channel_id = search_response['items'][0]['snippet']['channelId']
                    logger.warning(f'No exact handle match for @{handle}, using first search result: {channel_id}')
                    return channel_id

            # Handle /channel/UC... URLs (direct channel ID)
            elif 'youtube.com/channel/' in url:
                channel_id = url.split('/channel/')[1].split('/')[0].split('?')[0]
                logger.debug(f'Extracted channel ID from URL: {channel_id}')
                return channel_id

            # Handle /c/customname URLs
            elif 'youtube.com/c/' in url:
                custom_url = url.split('/c/')[1].split('/')[0].split('?')[0]
                search_response = self.youtube.search().list(
                    part='snippet',
                    q=custom_url,
                    type='channel',
                    maxResults=1
                ).execute()
                if search_response.get('items'):
                    channel_id = search_response['items'][0]['snippet']['channelId']
                    logger.debug(f'Resolved /c/{custom_url} to {channel_id}')
                    return channel_id

            logger.warning(f'Could not resolve channel ID from URL: {url}')
            return None

        except HttpError as e:
            logger.error(f'YouTube API error resolving channel from URL {url}: {e}')
            raise
        except Exception as e:
            logger.error(f'Error resolving channel ID from URL {url}: {e}', exc_info=True)
            return None

    def get_playlist_videos(self, playlist_id, max_results=500):
        """
        Fetch all videos from a YouTube playlist.

        Args:
            playlist_id: YouTube playlist ID (starts with 'PL')
            max_results: Maximum number of videos to fetch (default: 500)

        Returns:
            list: List of video dicts with keys: yt_id, title, duration_sec, upload_date, thumbnail, channel_title
            Empty list on error
        """
        try:
            logger.info(f'Scanning YouTube playlist: {playlist_id}')
            videos = []
            next_page_token = None

            while len(videos) < max_results:
                # Get videos from playlist (paginated)
                playlist_response = self.youtube.playlistItems().list(
                    part='snippet,contentDetails',
                    playlistId=playlist_id,
                    maxResults=min(50, max_results - len(videos)),
                    pageToken=next_page_token
                ).execute()

                video_ids = [item['contentDetails']['videoId'] for item in playlist_response.get('items', [])]
                logger.debug(f'Found {len(video_ids)} video IDs in playlist page')

                if video_ids:
                    # Get detailed video info (including duration) in batch
                    videos_response = self.youtube.videos().list(
                        part='snippet,contentDetails,statistics',
                        id=','.join(video_ids)
                    ).execute()

                    for video in videos_response.get('items', []):
                        # Skip videos without duration (deleted, private, etc)
                        if 'duration' not in video.get('contentDetails', {}):
                            logger.debug(f"Skipping video {video['id']}: no duration (possibly deleted/private)")
                            continue

                        # Parse ISO 8601 duration (PT1H2M10S -> seconds)
                        duration_str = video['contentDetails']['duration']
                        duration_sec = parse_iso8601_duration(duration_str)

                        # Skip videos under 2 minutes (120 seconds) - filters out Shorts
                        if duration_sec < 120:
                            logger.debug(f"Skipping video {video['id']}: duration {duration_sec}s (<2 min)")
                            continue

                        videos.append({
                            'yt_id': video['id'],
                            'title': video['snippet']['title'],
                            'duration_sec': duration_sec,
                            'upload_date': video['snippet']['publishedAt'][:10].replace('-', ''),
                            'thumbnail': video['snippet']['thumbnails'].get('high', {}).get('url'),
                            'channel_title': video['snippet'].get('channelTitle', 'Unknown')
                        })

                next_page_token = playlist_response.get('nextPageToken')
                if not next_page_token:
                    break

            logger.info(f'Playlist scan complete: {len(videos)} videos found')
            return videos

        except HttpError as e:
            logger.error(f'YouTube API error scanning playlist {playlist_id}: {e}')
            raise
        except Exception as e:
            logger.error(f'Error in get_playlist_videos for {playlist_id}: {e}', exc_info=True)
            return []

    @staticmethod
    def extract_playlist_id(url):
        """
        Extract playlist ID from YouTube playlist URL.

        Supports:
        - youtube.com/playlist?list=PLxxxxx
        - youtube.com/watch?v=xxx&list=PLxxxxx

        Args:
            url: YouTube URL containing playlist ID

        Returns:
            str: Playlist ID if found
            None: If playlist ID not found in URL
        """
        import re
        # Match list= parameter in URL
        match = re.search(r'[?&]list=([^&]+)', url)
        if match:
            return match.group(1)
        return None
