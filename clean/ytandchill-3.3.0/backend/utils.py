"""
Shared utility functions for the YouTube downloader backend.
"""

import re


def parse_iso8601_duration(duration):
    """
    Parse ISO 8601 duration string (e.g., PT1H2M10S) to total seconds.

    Args:
        duration: ISO 8601 duration string (e.g., "PT1H2M10S", "PT30M", "PT45S")

    Returns:
        int: Total duration in seconds

    Examples:
        >>> parse_iso8601_duration("PT1H2M10S")
        3730
        >>> parse_iso8601_duration("PT30M")
        1800
        >>> parse_iso8601_duration("PT45S")
        45
    """
    pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
    match = re.match(pattern, duration)
    if not match:
        return 0

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)

    return hours * 3600 + minutes * 60 + seconds
