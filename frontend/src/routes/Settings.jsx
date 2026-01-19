import { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings, useHealth, useLogs, useChannels } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useTheme, themes } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ui/ConfirmModal';
import Tooltip from '../components/ui/Tooltip';
import { version as APP_VERSION } from '../../package.json';

// Icons as components for cleaner JSX
const PlayIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
);

const DisplayIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DownloadIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const SystemIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
  </svg>
);

const LogIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const GearIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const UploadIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const KeyIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

const EyeIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ChevronIcon = ({ collapsed }) => (
  <svg
    className={`w-4 h-4 text-text-muted transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: health } = useHealth();
  const { data: logsData } = useLogs(500);
  const { data: channels } = useChannels();
  const updateSettings = useUpdateSettings();
  const { showNotification } = useNotification();
  const { theme, setTheme } = useTheme();

  // Fetch stats (excludes Singles from discovered/ignored)
  const [stats, setStats] = useState({ discovered: 0, ignored: 0, library: 0 });

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to fetch stats:', err));
  }, []);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [serverAutoRefresh, setServerAutoRefresh] = useState(false); // Track server's saved state
  // Auto-scan state
  const [scanMode, setScanMode] = useState('times'); // 'times' or 'interval'
  // Preset times for "Set Times" mode - array of selected time labels
  const PRESET_TIMES = ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];
  const [selectedPresetTimes, setSelectedPresetTimes] = useState(['3 AM']); // Default to 3 AM
  // Interval mode state (12-hour format)
  const [scanInterval, setScanInterval] = useState(6); // 6, 8, or 12 hours
  const [intervalHour, setIntervalHour] = useState(3); // 1-12
  const [intervalMinute, setIntervalMinute] = useState(0); // 0-59
  const [intervalAmPm, setIntervalAmPm] = useState('AM'); // 'AM' or 'PM'
  const [logLevel, setLogLevel] = useState('INFO');

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showResetAuthModal, setShowResetAuthModal] = useState(false);

  // Cookie source state
  const [cookieSource, setCookieSource] = useState('file');

  // YouTube API key state
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyTesting, setApiKeyTesting] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);

  // SponsorBlock state
  const [removeSponsor, setRemoveSponsor] = useState(false);
  const [removeSelfpromo, setRemoveSelfpromo] = useState(false);
  const [removeInteraction, setRemoveInteraction] = useState(false);

  // Library date display preference (stored in localStorage)
  const [libraryDateDisplay, setLibraryDateDisplay] = useState(() => {
    return localStorage.getItem('library_date_display') || 'downloaded';
  });

  // Default playback speed
  const [defaultPlaybackSpeed, setDefaultPlaybackSpeed] = useState('1');

  // Initialize showLogs from localStorage, default to false (closed) for new design
  const [showLogs, setShowLogs] = useState(() => {
    const saved = localStorage.getItem('logsVisible');
    return saved !== null ? saved === 'true' : false;
  });


  // Queue/DB Repair state
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [showShrinkDBModal, setShowShrinkDBModal] = useState(false);
  const [repairData, setRepairData] = useState(null);
  const [selectedNotFoundVideos, setSelectedNotFoundVideos] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [isCheckingRepair, setIsCheckingRepair] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Version update check state
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Collapsible sections state (persisted in localStorage)
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const saved = localStorage.getItem('settings_collapsed_sections');
    return saved ? JSON.parse(saved) : {};
  });

  const toggleSection = (section) => {
    setCollapsedSections(prev => {
      const updated = { ...prev, [section]: !prev[section] };
      localStorage.setItem('settings_collapsed_sections', JSON.stringify(updated));
      return updated;
    });
  };

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Helper to convert 24h hour to preset label
  const hour24ToPreset = (hour24) => {
    const map = { 0: '12 AM', 3: '3 AM', 6: '6 AM', 9: '9 AM', 12: '12 PM', 15: '3 PM', 18: '6 PM', 21: '9 PM' };
    return map[hour24] || null;
  };

  // Helper to convert 24h to 12h format
  const to12Hour = (hour24) => {
    if (hour24 === 0) return { hour: 12, ampm: 'AM' };
    if (hour24 === 12) return { hour: 12, ampm: 'PM' };
    if (hour24 < 12) return { hour: hour24, ampm: 'AM' };
    return { hour: hour24 - 12, ampm: 'PM' };
  };

  useEffect(() => {
    if (settings) {
      const isEnabled = settings.auto_refresh_enabled === 'true';
      setAutoRefresh(isEnabled);
      setServerAutoRefresh(isEnabled); // Track what server has saved
      setLogLevel(settings.log_level || 'INFO');
      // Parse auto_refresh_config (new multi-scan system)
      if (settings.auto_refresh_config) {
        try {
          const config = JSON.parse(settings.auto_refresh_config);
          setScanMode(config.mode || 'times');

          if (config.mode === 'times' && config.times) {
            // Convert 24h times back to preset labels
            const presets = config.times
              .map(t => {
                const [h] = t.split(':');
                return hour24ToPreset(parseInt(h));
              })
              .filter(p => p !== null);
            if (presets.length > 0) {
              setSelectedPresetTimes(presets);
            }
          } else if (config.mode === 'interval') {
            if (config.interval_hours) {
              setScanInterval(config.interval_hours);
            }
            if (config.interval_start) {
              const [h, m] = config.interval_start.split(':');
              const hour24 = parseInt(h) || 0;
              const minute = parseInt(m) || 0;
              const { hour, ampm } = to12Hour(hour24);
              setIntervalHour(hour);
              setIntervalMinute(minute);
              setIntervalAmPm(ampm);
            }
          }
        } catch (e) {
          console.error('Failed to parse auto_refresh_config:', e);
        }
      }
      setRemoveSponsor(settings.sponsorblock_remove_sponsor === 'true');
      setRemoveSelfpromo(settings.sponsorblock_remove_selfpromo === 'true');
      setRemoveInteraction(settings.sponsorblock_remove_interaction === 'true');
      setCookieSource(settings.cookie_source || 'file');
      setDefaultPlaybackSpeed(settings.default_playback_speed || '1');
      setYoutubeApiKey(settings.youtube_api_key || '');
      setHasApiKey(!!settings.youtube_api_key);
    }
  }, [settings]);

  // Compare semver versions properly
  const compareSemver = (a, b) => {
    const parseVersion = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const [aMajor, aMinor, aPatch] = parseVersion(a);
    const [bMajor, bMinor, bPatch] = parseVersion(b);
    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    return aPatch - bPatch;
  };

  useEffect(() => {
    if (health?.latest_version) {
      const latest = health.latest_version;
      setLatestVersion(latest);
      if (latest && latest !== APP_VERSION) {
        setUpdateAvailable(compareSemver(latest, APP_VERSION) > 0);
      }
    }
  }, [health?.latest_version]);

  const toggleLogs = () => {
    const newValue = !showLogs;
    setShowLogs(newValue);
    localStorage.setItem('logsVisible', newValue.toString());
  };

  const handleSponsorBlockToggle = async (setting, currentValue, setValue) => {
    const newValue = !currentValue;
    setValue(newValue);
    try {
      await updateSettings.mutateAsync({
        [setting]: newValue ? 'true' : 'false',
      });
    } catch (error) {
      console.error(`Failed to save ${setting}:`, error);
      setValue(currentValue);
    }
  };

  const handleModeSwitch = (newMode) => {
    setScanMode(newMode);
  };

  // Convert preset time label to 24h hour value
  const presetTo24h = (preset) => {
    const map = {
      '12 AM': 0, '3 AM': 3, '6 AM': 6, '9 AM': 9,
      '12 PM': 12, '3 PM': 15, '6 PM': 18, '9 PM': 21
    };
    return map[preset] ?? 0;
  };

  // Convert 12h time to 24h
  const to24Hour = (hour, ampm) => {
    if (ampm === 'AM') {
      return hour === 12 ? 0 : hour;
    } else {
      return hour === 12 ? 12 : hour + 12;
    }
  };

  // Toggle preset time selection
  const togglePresetTime = (time) => {
    if (selectedPresetTimes.includes(time)) {
      // Don't allow deselecting if it's the last one
      if (selectedPresetTimes.length > 1) {
        setSelectedPresetTimes(selectedPresetTimes.filter(t => t !== time));
      }
    } else {
      setSelectedPresetTimes([...selectedPresetTimes, time]);
    }
  };

  const handleSaveAutoRefresh = async () => {
    try {
      let config;

      if (scanMode === 'times') {
        // Convert preset times to 24h format
        const times = selectedPresetTimes.map(preset => {
          const hour24 = presetTo24h(preset);
          return `${String(hour24).padStart(2, '0')}:00`;
        });
        config = {
          mode: 'times',
          times: times,
          interval_hours: null,
          interval_start: null
        };
      } else {
        // Convert 12h interval start to 24h
        const hour24 = to24Hour(intervalHour, intervalAmPm);
        config = {
          mode: 'interval',
          times: [],
          interval_hours: scanInterval,
          interval_start: `${String(hour24).padStart(2, '0')}:${String(intervalMinute).padStart(2, '0')}`
        };
      }

      await updateSettings.mutateAsync({
        auto_refresh_enabled: autoRefresh ? 'true' : 'false',
        auto_refresh_config: JSON.stringify(config)
      });

      // Determine appropriate notification
      const wasEnabled = serverAutoRefresh;
      const isNowEnabled = autoRefresh;

      if (!wasEnabled && isNowEnabled) {
        showNotification('Auto-scan enabled', 'success');
      } else if (wasEnabled && !isNowEnabled) {
        showNotification('Auto-scan disabled', 'success');
      } else {
        showNotification('Auto-scan schedule saved', 'success');
      }

      // Update server state tracking
      setServerAutoRefresh(autoRefresh);
    } catch (error) {
      showNotification(error.message || 'Failed to save auto-scan settings', 'error');
    }
  };


  const handleQueueRepair = async () => {
    setIsCheckingRepair(true);
    try {
      const response = await fetch('/api/queue/check-orphaned');
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      fetch('/api/stats')
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error('Failed to fetch stats:', err));

      setRepairData(data);
      setShowRepairModal(true);
    } catch (error) {
      showNotification(`Failed to check database: ${error.message}`, 'error');
    } finally {
      setIsCheckingRepair(false);
    }
  };

  const handleRemoveNotFoundVideos = async () => {
    if (selectedNotFoundVideos.length === 0) {
      showNotification('No videos selected', 'warning');
      return;
    }

    setIsRemoving(true);
    try {
      const response = await fetch('/api/queue/remove-not-found', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: selectedNotFoundVideos })
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      showNotification(`Removed ${data.removed} video${data.removed !== 1 ? 's' : ''}`, 'success');
      setShowNotFoundModal(false);
      setShowRepairModal(false);
      setSelectedNotFoundVideos([]);
      setRepairData(null);
    } catch (error) {
      showNotification('Failed to remove videos', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  const handlePurgeChannels = async () => {
    if (selectedChannels.length === 0) {
      showNotification('No channels selected', 'warning');
      return;
    }

    setIsRemoving(true);
    try {
      const response = await fetch('/api/queue/purge-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: selectedChannels })
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      showNotification(`Purged ${data.purged_channels} channel${data.purged_channels !== 1 ? 's' : ''}, freed ${data.videos_removed} video records`, 'success');
      setShowShrinkDBModal(false);
      setShowRepairModal(false);
      setSelectedChannels([]);
      setRepairData(null);
    } catch (error) {
      showNotification('Failed to purge channels', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('All fields are required');
      return;
    }

    if (newPassword.length < 3) {
      setPasswordError('Password must be at least 3 characters');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch('/api/auth/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || 'Failed to change password');
        setIsChangingPassword(false);
        return;
      }

      showNotification('Password changed successfully!', 'success');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordChange(false);
    } catch (err) {
      setPasswordError('Failed to connect to server');
      setIsChangingPassword(false);
    }
  };

  const handleResetAuth = async () => {
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
      });

      if (response.ok) {
        // Redirect to setup page
        window.location.href = '/setup';
      } else {
        showNotification('Failed to reset authentication', 'error');
      }
    } catch (err) {
      showNotification('Failed to connect to server', 'error');
    }
    setShowResetAuthModal(false);
  };

  const handleCookieSourceChange = async (newSource) => {
    setCookieSource(newSource);
    try {
      await updateSettings.mutateAsync({
        cookie_source: newSource,
        cookie_browser: 'firefox'
      });
      showNotification('Cookie source updated successfully!', 'success');
    } catch (err) {
      showNotification('Failed to update cookie source', 'error');
    }
  };

  const handleSaveApiKey = async () => {
    setApiKeySaving(true);
    try {
      await updateSettings.mutateAsync({
        youtube_api_key: youtubeApiKey.trim()
      });
      setHasApiKey(!!youtubeApiKey.trim());
      showNotification(youtubeApiKey.trim() ? 'YouTube API key saved' : 'YouTube API key cleared', 'success');
    } catch (err) {
      showNotification('Failed to save API key', 'error');
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleTestApiKey = async () => {
    if (!youtubeApiKey.trim()) {
      showNotification('Enter an API key first', 'warning');
      return;
    }

    // Save first, then test
    setApiKeyTesting(true);
    try {
      await updateSettings.mutateAsync({
        youtube_api_key: youtubeApiKey.trim()
      });

      const response = await fetch('/api/settings/test-youtube-api', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();

      if (data.valid) {
        setHasApiKey(true);
        showNotification('API key is valid!', 'success');
      } else {
        showNotification(data.error || 'API key is invalid', 'error');
      }
    } catch (err) {
      showNotification('Failed to test API key', 'error');
    } finally {
      setApiKeyTesting(false);
    }
  };

  const handlePlaybackSpeedChange = async (newSpeed) => {
    setDefaultPlaybackSpeed(newSpeed);
    try {
      await updateSettings.mutateAsync({
        default_playback_speed: newSpeed
      });
      showNotification(`Default playback speed set to ${newSpeed}x`, 'success');
    } catch (err) {
      showNotification('Failed to update playback speed', 'error');
      setDefaultPlaybackSpeed(defaultPlaybackSpeed);
    }
  };

  // Toggle just controls local state - Save button commits to server
  const handleAutoScanToggle = (enabled) => {
    setAutoRefresh(enabled);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Theme colors for the theme picker
  const themeColors = {
    kernel: 'hsl(220, 10%, 70%)',
    fatal: 'hsl(0, 100%, 50%)',
    subnet: 'hsl(220, 50%, 40%)',
    archive: 'hsl(95, 20%, 45%)',
    buffer: 'hsl(35, 45%, 58%)',
    catppuccin: '#89b4fa',
    online: 'hsl(115, 25%, 50%)',
    pixel: 'hsl(315, 80%, 75%)',
    debug: 'hsl(210, 30%, 55%)'
  };

  return (
    <>
    <div className="animate-fade-in pt-4">
      <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">

        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label">YT and Chill</div>
            <div className="stat-value">v{APP_VERSION}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">YT-DLP</div>
            <div className="stat-value">{health?.ytdlp_version || 'Unknown'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Database</div>
            <button
              onClick={handleQueueRepair}
              disabled={isCheckingRepair}
              className="db-action-btn"
              title="Click to open database maintenance"
            >
              {isCheckingRepair ? 'Checking...' : (health?.database_size || 'N/A')}
              <GearIcon />
            </button>
          </div>
          <div className="stat-item">
            <div className="stat-label">Storage</div>
            <div className="stat-value">{health?.total_storage || '0B'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Library</div>
            <div className="stat-value">{stats.library}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">To Review</div>
            <div className="stat-value text-accent">{stats.discovered}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Channels</div>
            <div className="stat-value">{channels?.length || 0}</div>
          </div>
        </div>

        {/* Update Available Card */}
        {updateAvailable && (
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <div>
                  <div className="text-text-primary font-medium">Update Available</div>
                  <div className="text-text-secondary text-sm">
                    v{APP_VERSION} → v{latestVersion}
                  </div>
                </div>
              </div>
              <a
                href="https://github.com/thenunner/ytandchill/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
              >
                View Release
              </a>
            </div>
          </div>
        )}

        {/* PLAYBACK Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('playback')}>
            <PlayIcon />
            Playback
            <ChevronIcon collapsed={collapsedSections.playback} />
          </div>

          <div className={`section-content ${collapsedSections.playback ? 'collapsed' : ''}`}>
          <div className="setting-row mobile-hide-desc">
            <div className="setting-label">
              <div>
                <div className="setting-name">Default Speed</div>
                <div className="setting-desc">Starting playback speed for all videos</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              {['1', '1.5', '2', '2.5'].map(speed => (
                <button
                  key={speed}
                  onClick={() => handlePlaybackSpeedChange(speed)}
                  className={`settings-toggle-btn ${defaultPlaybackSpeed === speed ? 'active' : ''}`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row mobile-hide-desc">
            <div className="setting-label">
              <div>
                <div className="setting-name">Skip Segments</div>
                <div className="setting-desc">Auto-remove sponsor content via SponsorBlock</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <Tooltip text="Paid promotions and sponsored segments">
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_sponsor', removeSponsor, setRemoveSponsor)}
                  className={`settings-toggle-btn ${removeSponsor ? 'active' : ''}`}
                >
                  Sponsors
                </button>
              </Tooltip>
              <Tooltip text="Self-promotion of own products, channels, or social media">
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_selfpromo', removeSelfpromo, setRemoveSelfpromo)}
                  className={`settings-toggle-btn ${removeSelfpromo ? 'active' : ''}`}
                >
                  Promo
                </button>
              </Tooltip>
              <Tooltip text="Reminders to like, subscribe, or follow">
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_interaction', removeInteraction, setRemoveInteraction)}
                  className={`settings-toggle-btn ${removeInteraction ? 'active' : ''}`}
                >
                  Like/Sub
                </button>
              </Tooltip>
            </div>
          </div>
          </div>
        </div>

        {/* DISPLAY Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('display')}>
            <DisplayIcon />
            Display
            <ChevronIcon collapsed={collapsedSections.display} />
          </div>

          <div className={`section-content ${collapsedSections.display ? 'collapsed' : ''}`}>
          <div className="setting-row mobile-hide-desc">
            <div className="setting-label">
              <div>
                <div className="setting-name">Card Date</div>
                <div className="setting-desc">Which date to show on library cards</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <Tooltip text="When the video was originally published on YouTube">
                <button
                  onClick={() => {
                    setLibraryDateDisplay('uploaded');
                    localStorage.setItem('library_date_display', 'uploaded');
                    showNotification('Library cards will show upload date', 'success');
                  }}
                  className={`settings-toggle-btn ${libraryDateDisplay === 'uploaded' ? 'active' : ''}`}
                >
                  Uploaded
                </button>
              </Tooltip>
              <Tooltip text="When the video was added to your library">
                <button
                  onClick={() => {
                    setLibraryDateDisplay('downloaded');
                    localStorage.setItem('library_date_display', 'downloaded');
                    showNotification('Library cards will show download date', 'success');
                  }}
                  className={`settings-toggle-btn ${libraryDateDisplay === 'downloaded' ? 'active' : ''}`}
                >
                  Downloaded
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name">Theme</div>
              </div>
            </div>
            <div className="theme-grid">
              {Object.entries(themeColors).map(([themeName, color]) => (
                <button
                  key={themeName}
                  onClick={() => { setTheme(themeName); showNotification(`Theme changed to ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}`, 'success'); }}
                  className={`theme-option ${theme === themeName ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  title={themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                />
              ))}
            </div>
          </div>
          </div>
        </div>

        {/* DOWNLOADS Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('downloads')}>
            <DownloadIcon />
            Downloads
            <ChevronIcon collapsed={collapsedSections.downloads} />
          </div>

          <div className={`section-content ${collapsedSections.downloads ? 'collapsed' : ''}`}>
          <div className="setting-row mobile-hide-desc">
            <div className="setting-label">
              <span className={`autoscan-status ${
                cookieSource === 'none' ? '' :
                cookieSource === 'browser' ? (health?.firefox_has_cookies ? 'active' : '') :
                (health?.cookies_available ? 'active' : '')
              }`}></span>
              <div>
                <div className="setting-name">Cookies</div>
                <div className="setting-desc">YouTube authentication for downloads</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <Tooltip text="Use cookies.txt file from downloads folder">
                <button
                  onClick={() => handleCookieSourceChange('file')}
                  className={`settings-toggle-btn ${cookieSource === 'file' ? 'active' : ''}`}
                >
                  File
                </button>
              </Tooltip>
              <Tooltip text="Extract cookies from local Firefox browser">
                <button
                  onClick={() => handleCookieSourceChange('browser')}
                  className={`settings-toggle-btn ${cookieSource === 'browser' ? 'active' : ''}`}
                >
                  Firefox
                </button>
              </Tooltip>
              <Tooltip text="No auth - may fail on age-restricted videos">
                <button
                  onClick={() => handleCookieSourceChange('none')}
                  className={`settings-toggle-btn ${cookieSource === 'none' ? 'active' : ''}`}
                >
                  None
                </button>
              </Tooltip>
            </div>
          </div>

          {/* YouTube API Key */}
          <div className="setting-row">
            <div className="setting-label">
              <span className={`autoscan-status ${hasApiKey ? 'active' : ''}`}></span>
              <div>
                <div className="setting-name">YouTube API Key</div>
                <div className="setting-desc">
                  Fetches upload dates quickly for new channels.{' '}
                  <a
                    href="https://developers.google.com/youtube/v3/getting-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Get an API key
                  </a>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={youtubeApiKey}
                onChange={(e) => setYoutubeApiKey(e.target.value)}
                placeholder="Paste API key"
                className="input text-sm py-1.5 px-3 w-48"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={apiKeySaving || !youtubeApiKey.trim()}
                className="settings-action-btn"
              >
                {apiKeySaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleTestApiKey}
                disabled={apiKeyTesting || !youtubeApiKey.trim()}
                className="settings-action-btn"
              >
                {apiKeyTesting ? 'Testing...' : 'Test'}
              </button>
            </div>
          </div>

          <div className="setting-row flex-col !items-stretch !py-0 !border-b-0">
            <div className="flex items-center justify-between py-3.5">
              <div className="setting-label">
                <span className={`autoscan-status ${autoRefresh ? 'active' : ''}`}></span>
                <div>
                  <div className="setting-name">Auto-Scan</div>
                  <div className="setting-desc">Check channels on schedule</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => handleAutoScanToggle(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Compact Config Row */}
            <div className={`autoscan-config ${autoRefresh ? 'show' : ''}`}>
              {/* Mode Pills */}
              <div className="mode-pills">
                <button
                  onClick={() => handleModeSwitch('times')}
                  className={`mode-pill ${scanMode === 'times' ? 'active' : ''}`}
                >
                  Set Times
                </button>
                <button
                  onClick={() => handleModeSwitch('interval')}
                  className={`mode-pill ${scanMode === 'interval' ? 'active' : ''}`}
                >
                  Interval
                </button>
              </div>

              <span className="config-divider"></span>

              {/* Set Times Mode - Preset buttons */}
              {scanMode === 'times' && (
                <div className="preset-times">
                  {PRESET_TIMES.map((time) => (
                    <button
                      key={time}
                      className={`preset-time-btn ${selectedPresetTimes.includes(time) ? 'selected' : ''}`}
                      onClick={() => togglePresetTime(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}

              {/* Interval Mode - 12h format with AM/PM */}
              {scanMode === 'interval' && (
                <div className="interval-inline">
                  <span className="interval-label">Every</span>
                  <select
                    className="interval-select"
                    value={scanInterval}
                    onChange={(e) => setScanInterval(parseInt(e.target.value))}
                  >
                    <option value={6}>6 hours</option>
                    <option value={8}>8 hours</option>
                    <option value={12}>12 hours</option>
                  </select>
                  <span className="interval-label">from</span>
                  <div className="time-chip">
                    <input
                      type="text"
                      value={String(intervalHour).padStart(2, '0')}
                      maxLength={2}
                      onChange={(e) => {
                        let val = parseInt(e.target.value.replace(/\D/g, '')) || 1;
                        if (val > 12) val = 12;
                        if (val < 1) val = 1;
                        setIntervalHour(val);
                      }}
                    />
                    <span className="sep">:</span>
                    <input
                      type="text"
                      value={String(intervalMinute).padStart(2, '0')}
                      maxLength={2}
                      onChange={(e) => {
                        let val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                        if (val > 59) val = 59;
                        if (val < 0) val = 0;
                        setIntervalMinute(val);
                      }}
                    />
                  </div>
                  <div className="ampm-toggle">
                    <button
                      className={`ampm-btn ${intervalAmPm === 'AM' ? 'active' : ''}`}
                      onClick={() => setIntervalAmPm('AM')}
                    >
                      AM
                    </button>
                    <button
                      className={`ampm-btn ${intervalAmPm === 'PM' ? 'active' : ''}`}
                      onClick={() => setIntervalAmPm('PM')}
                    >
                      PM
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleSaveAutoRefresh}
                className="settings-action-btn ml-auto"
              >
                {!serverAutoRefresh && autoRefresh ? 'Enable & Save' : (serverAutoRefresh && !autoRefresh ? 'Disable' : 'Save')}
              </button>
            </div>
          </div>
          </div>
        </div>

        {/* SYSTEM Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('system')}>
            <SystemIcon />
            System
            <ChevronIcon collapsed={collapsedSections.system} />
          </div>

          <div className={`section-content ${collapsedSections.system ? 'collapsed' : ''}`}>
          {/* Change Password */}
          <div className="setting-row flex-col !items-stretch gap-3">
            <div className="flex items-center justify-between">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Password</div>
                  <div className="setting-desc">Change your account password</div>
                </div>
              </div>
              <button
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="settings-action-btn"
              >
                <KeyIcon />
                Change Password
              </button>
            </div>

            {/* Password change form */}
            {showPasswordChange && (
              <form onSubmit={handlePasswordChange} className="expandable-content -mx-4 -mb-3.5 rounded-none space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="input text-sm py-1.5 px-3 w-full"
                      disabled={isChangingPassword}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="input text-sm py-1.5 px-3 w-full"
                      disabled={isChangingPassword}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="input text-sm py-1.5 px-3 w-full"
                      disabled={isChangingPassword}
                    />
                  </div>
                </div>

                {passwordError && (
                  <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-xs">
                    {passwordError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="settings-action-btn disabled:opacity-50"
                >
                  {isChangingPassword ? 'Saving...' : 'Save Password'}
                </button>
              </form>
            )}
          </div>

          {/* Forgot Password */}
          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name">Forgot Password?</div>
                <div className="setting-desc">Reset to setup if you've forgotten your password</div>
              </div>
            </div>
            <button
              onClick={() => setShowResetAuthModal(true)}
              className="settings-action-btn text-red-400 hover:text-red-300"
            >
              Reset to Setup
            </button>
          </div>
          </div>
        </div>

        {/* LOGGING Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('logging')}>
            <LogIcon />
            Logging
            <ChevronIcon collapsed={collapsedSections.logging} />
          </div>

          <div className={`section-content ${collapsedSections.logging ? 'collapsed' : ''}`}>
          <div className="setting-row flex-col !items-stretch gap-3 mobile-stack-log mobile-hide-desc">
            <div className="flex items-center justify-between">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Log Level</div>
                  <div className="setting-desc">DEBUG shows everything, ERROR shows only failures</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="settings-toggle-group">
                  {[
                    { level: 'DEBUG', tip: 'All messages including detailed debugging info' },
                    { level: 'INFO', tip: 'General information about operations' },
                    { level: 'API', tip: 'HTTP request/response logs' },
                    { level: 'WARNING', tip: 'Warnings and errors only' },
                    { level: 'ERROR', tip: 'Only error messages' },
                  ].map(({ level, tip }) => (
                    <Tooltip key={level} text={tip}>
                      <button
                        onClick={async () => {
                          setLogLevel(level);
                          try {
                            await updateSettings.mutateAsync({ log_level: level });
                            showNotification(`Log level changed to ${level}`, 'success');
                          } catch (error) {
                            showNotification(error.message || 'Failed to save log level', 'error');
                          }
                        }}
                        className={`settings-toggle-btn ${logLevel === level ? 'active' : ''}`}
                      >
                        {level === 'WARNING' ? 'WARN' : level}
                      </button>
                    </Tooltip>
                  ))}
                </div>
                <button onClick={toggleLogs} className="settings-action-btn">
                  <EyeIcon />
                  {showLogs ? 'Hide' : 'View'} Logs
                </button>
              </div>
            </div>

            {/* Expandable Log Viewer */}
            <div className={`log-viewer ${showLogs ? 'expanded' : ''}`}>
              <div className="log-header">
                {logsData?.total_lines && (
                  <span className="text-xs text-text-muted">
                    Showing last 500 of {logsData.total_lines} lines
                  </span>
                )}
              </div>
              <div className="log-content">
                {logsData?.logs && logsData.logs.length > 0 ? (
                  logsData.logs.map((line, index) => {
                    const levelMatch = line.match(/^(.* - )(\[(?:ERROR|WARNING|INFO|API|DEBUG)\])( - .*)$/);
                    if (levelMatch) {
                      const [, before, level, after] = levelMatch;
                      const levelClass =
                        level.includes('ERROR') ? 'error' :
                        level.includes('WARNING') ? 'warn' :
                        level.includes('INFO') ? 'info' :
                        level.includes('API') ? 'api' : 'debug';
                      return (
                        <div key={index} className="log-line">
                          <span className="log-time">{before.replace(' - ', '')}</span>
                          <span className={`log-level ${levelClass}`}>{level}</span>
                          <span>{after.replace(' - ', '')}</span>
                        </div>
                      );
                    }
                    return <div key={index} className="log-line">{line}</div>;
                  })
                ) : (
                  <div className="text-text-muted text-center py-8">No logs available</div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>

      </div>

      {/* Main Queue/DB Repair Modal */}
      {showRepairModal && repairData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRepairModal(false)} />
          <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-dark-border">
              <h3 className="text-lg font-semibold text-text-primary">Database Maintenance</h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {repairData.orphaned_cleaned > 0 && (
                <div className="bg-dark-tertiary border border-dark-border rounded-lg p-3">
                  <div className="text-sm text-text-primary">
                    ✓ Auto-cleaned {repairData.orphaned_cleaned} orphaned item{repairData.orphaned_cleaned !== 1 ? 's' : ''}
                  </div>
                </div>
              )}

              <p className="text-sm text-text-secondary">Choose a maintenance option:</p>

              <button
                onClick={() => { setShowRepairModal(false); setShowNotFoundModal(true); }}
                className="w-full p-4 bg-dark-tertiary hover:bg-dark-hover border border-dark-border-light rounded-lg text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">Review Videos Not Found</div>
                    <div className="text-xs text-text-secondary mt-1">
                      {repairData.not_found_videos?.length || 0} video{repairData.not_found_videos?.length !== 1 ? 's' : ''} removed from YouTube
                    </div>
                  </div>
                  <div className="text-2xl text-text-muted">→</div>
                </div>
              </button>

              <button
                onClick={() => { setShowRepairModal(false); setShowShrinkDBModal(true); }}
                className="w-full p-4 bg-dark-tertiary hover:bg-dark-hover border border-dark-border-light rounded-lg text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-primary">Shrink Database</div>
                    <div className="text-xs text-text-secondary mt-1">
                      {repairData.deletable_channels?.length || 0} deleted channel{repairData.deletable_channels?.length !== 1 ? 's' : ''} can be purged
                    </div>
                  </div>
                  <div className="text-2xl text-text-muted">→</div>
                </div>
              </button>
            </div>
            <div className="px-6 py-4 border-t border-dark-border">
              <button onClick={() => setShowRepairModal(false)} className="btn btn-secondary w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Videos Not Found Modal */}
      {showNotFoundModal && repairData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNotFoundModal(false)} />
          <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-dark-border">
              <h3 className="text-lg font-semibold text-text-primary">Videos Not Found on YouTube</h3>
            </div>
            <div className="px-6 py-4">
              {repairData.not_found_videos?.length === 0 ? (
                <p className="text-sm text-text-secondary">✓ No videos to remove</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm text-text-secondary mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNotFoundVideos.length === repairData.not_found_videos.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNotFoundVideos(repairData.not_found_videos.map(v => v.id));
                        } else {
                          setSelectedNotFoundVideos([]);
                        }
                      }}
                    />
                    Select all videos to remove from database:
                  </label>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {repairData.not_found_videos.map((video) => (
                      <label key={video.id} className="flex items-start gap-3 p-3 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedNotFoundVideos.includes(video.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNotFoundVideos([...selectedNotFoundVideos, video.id]);
                            } else {
                              setSelectedNotFoundVideos(selectedNotFoundVideos.filter(id => id !== video.id));
                            }
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary truncate">{video.title}</div>
                          <div className="text-xs text-text-secondary">Channel: {video.channel_name}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-dark-border flex gap-3">
              <button onClick={() => setShowNotFoundModal(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              {repairData.not_found_videos?.length > 0 && (
                <button
                  onClick={handleRemoveNotFoundVideos}
                  disabled={selectedNotFoundVideos.length === 0 || isRemoving}
                  className="btn bg-red-600 hover:bg-red-700 text-white flex-1 disabled:opacity-50"
                >
                  {isRemoving ? 'Removing...' : `Remove Selected (${selectedNotFoundVideos.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shrink Database Modal */}
      {showShrinkDBModal && repairData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowShrinkDBModal(false)} />
          <div className="relative bg-dark-secondary border border-dark-border-light rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-dark-border">
              <h3 className="text-lg font-semibold text-text-primary">Shrink Database</h3>
            </div>
            <div className="px-6 py-4">
              {repairData.deletable_channels?.length === 0 ? (
                <p className="text-sm text-text-secondary">✓ No channels to purge</p>
              ) : (
                <>
                  <p className="text-sm text-text-secondary mb-3">Select deleted channels to permanently remove:</p>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {repairData.deletable_channels.map((channel) => (
                      <label key={channel.id} className="flex items-start gap-3 p-3 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(channel.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChannels([...selectedChannels, channel.id]);
                            } else {
                              setSelectedChannels(selectedChannels.filter(id => id !== channel.id));
                            }
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-text-primary truncate">{channel.title}</div>
                          <div className="text-xs text-text-secondary">{channel.video_count} video{channel.video_count !== 1 ? 's' : ''} • No library videos</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-dark-border flex gap-3">
              <button onClick={() => setShowShrinkDBModal(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              {repairData.deletable_channels?.length > 0 && (
                <button
                  onClick={handlePurgeChannels}
                  disabled={selectedChannels.length === 0 || isRemoving}
                  className="btn bg-red-600 hover:bg-red-700 text-white flex-1 disabled:opacity-50"
                >
                  {isRemoving ? 'Purging...' : `Purge Selected (${selectedChannels.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Auth Confirmation Modal */}
      {showResetAuthModal && (
        <ConfirmModal
          isOpen={showResetAuthModal}
          onClose={() => setShowResetAuthModal(false)}
          onConfirm={handleResetAuth}
          title="Reset Authentication?"
          message="This will clear your password and redirect you to the setup page to create new credentials. You'll need to log in again after setup."
          confirmText="Reset to Setup"
          confirmStyle="danger"
        />
      )}

    </div>
    </>
  );
}
