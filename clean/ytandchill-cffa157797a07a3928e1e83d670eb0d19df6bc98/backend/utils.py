"""
Shared utility functions for the YouTube downloader backend.
"""

import re
import time
import threading
from models import Setting


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


class SettingsManager:
    """
    Centralized settings manager with caching to reduce database queries.

    This manager provides a single interface for accessing application settings
    with automatic caching to minimize repeated database queries. Cache entries
    expire after a configurable TTL (default 5 seconds).

    Usage:
        settings = SettingsManager(session_factory)

        # Get settings
        value = settings.get('some_key', default='fallback')
        enabled = settings.get_bool('auto_refresh_enabled')
        minutes = settings.get_int('max_minutes', default=120)

        # Get SponsorBlock categories (cached)
        categories = settings.get_sponsorblock_categories()

        # Update settings (invalidates cache)
        settings.set('some_key', 'new_value')

        # Clear cache manually if needed
        settings.invalidate()  # Clear all
        settings.invalidate('some_key')  # Clear specific key
    """

    def __init__(self, session_factory, cache_ttl=5):
        """
        Initialize the settings manager.

        Args:
            session_factory: SQLAlchemy session factory
            cache_ttl: Cache time-to-live in seconds (default: 5)
        """
        self.session_factory = session_factory
        self.cache_ttl = cache_ttl
        self._cache = {}
        self._cache_time = {}
        self._lock = threading.Lock()

    def get(self, key, default=None):
        """
        Get setting value with caching.

        Args:
            key: Setting key to retrieve
            default: Default value if setting not found

        Returns:
            Setting value or default if not found
        """
        with self._lock:
            # Check cache first
            if key in self._cache:
                # Check if cache is still valid
                if time.time() - self._cache_time[key] < self.cache_ttl:
                    return self._cache[key]

            # Cache miss or expired - query database
            session = self.session_factory()
            try:
                setting = session.query(Setting).filter(Setting.key == key).first()
                value = setting.value if setting else default

                # Update cache
                self._cache[key] = value
                self._cache_time[key] = time.time()

                return value
            finally:
                session.close()

    def get_bool(self, key, default=False):
        """
        Get setting as boolean value.

        Args:
            key: Setting key to retrieve
            default: Default boolean value if setting not found

        Returns:
            Boolean value (True if value is 'true', False otherwise)
        """
        value = self.get(key, 'true' if default else 'false')
        return value == 'true' if value is not None else default

    def get_int(self, key, default=0):
        """
        Get setting as integer value.

        Args:
            key: Setting key to retrieve
            default: Default integer value if setting not found

        Returns:
            Integer value or default if conversion fails
        """
        value = self.get(key, str(default))
        try:
            return int(value) if value is not None else default
        except (ValueError, TypeError):
            return default

    def set(self, key, value):
        """
        Set setting value and invalidate cache for this key.

        Args:
            key: Setting key to update
            value: New value for the setting
        """
        session = self.session_factory()
        try:
            setting = session.query(Setting).filter(Setting.key == key).first()
            if setting:
                setting.value = str(value)
            else:
                setting = Setting(key=key, value=str(value))
                session.add(setting)
            session.commit()

            # Invalidate cache for this key
            with self._lock:
                self._cache.pop(key, None)
                self._cache_time.pop(key, None)
        finally:
            session.close()

    def get_sponsorblock_categories(self):
        """
        Get list of enabled SponsorBlock categories.

        Checks the three SponsorBlock settings and returns a list of
        enabled categories. This is a commonly used operation, so it's
        cached like other settings.

        Returns:
            list: Enabled SponsorBlock categories (e.g., ['sponsor', 'selfpromo'])
        """
        categories = []

        if self.get_bool('sponsorblock_remove_sponsor'):
            categories.append('sponsor')
        if self.get_bool('sponsorblock_remove_selfpromo'):
            categories.append('selfpromo')
        if self.get_bool('sponsorblock_remove_interaction'):
            categories.append('interaction')

        return categories

    def invalidate(self, key=None):
        """
        Clear cache entries.

        Args:
            key: Specific key to invalidate, or None to clear all cache
        """
        with self._lock:
            if key is None:
                # Clear entire cache
                self._cache.clear()
                self._cache_time.clear()
            else:
                # Clear specific key
                self._cache.pop(key, None)
                self._cache_time.pop(key, None)
