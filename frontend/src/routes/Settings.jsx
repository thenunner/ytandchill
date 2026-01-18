import { useState, useEffect, useRef } from 'react';
import { useSettings, useUpdateSettings, useHealth, useLogs, useChannels, useVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useTheme, themes } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ui/ConfirmModal';
import UpdateModal from '../components/UpdateModal';
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

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: health } = useHealth();
  const { data: logsData } = useLogs(500);
  const { data: channels } = useChannels();
  const { data: discoveredVideos, refetch: refetchDiscovered } = useVideos({ status: 'discovered' });
  const { data: ignoredVideos, refetch: refetchIgnored } = useVideos({ status: 'ignored' });
  const { data: libraryVideos, refetch: refetchLibrary } = useVideos({ status: 'library' });
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
  const [refreshHour, setRefreshHour] = useState(3);
  const [refreshMinute, setRefreshMinute] = useState(0);
  // New multi-scan state
  const [scanMode, setScanMode] = useState('times'); // 'times' or 'interval'
  const [scanTimes, setScanTimes] = useState([{ hour: 3, minute: 0 }]); // Array of 1-4 times
  const [scanInterval, setScanInterval] = useState(6); // 6, 8, or 12 hours
  // Separate state to preserve times for each mode
  const [manualModeTimes, setManualModeTimes] = useState([{ hour: 3, minute: 0 }]);
  const [intervalModeTime, setIntervalModeTime] = useState({ hour: 3, minute: 0 });
  const [intervalModeHours, setIntervalModeHours] = useState(6);
  const [logLevel, setLogLevel] = useState('INFO');

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Cookie source state
  const [cookieSource, setCookieSource] = useState('file');
  const [showCookieHelp, setShowCookieHelp] = useState(false);

  // SponsorBlock state
  const [removeSponsor, setRemoveSponsor] = useState(false);
  const [removeSelfpromo, setRemoveSelfpromo] = useState(false);
  const [removeInteraction, setRemoveInteraction] = useState(false);
  const [showSponsorBlockHelp, setShowSponsorBlockHelp] = useState(false);

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

  // Initialize status bar visibility from localStorage, default to true (visible)
  const [statusBarVisible, setStatusBarVisible] = useState(() => {
    const saved = localStorage.getItem('statusBarVisible');
    return saved !== null ? saved === 'true' : true;
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
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (settings) {
      setAutoRefresh(settings.auto_refresh_enabled === 'true');
      setLogLevel(settings.log_level || 'INFO');
      // Parse auto_refresh_config (new multi-scan system)
      if (settings.auto_refresh_config) {
        try {
          const config = JSON.parse(settings.auto_refresh_config);
          setScanMode(config.mode);

          if (config.mode === 'times') {
            const times = config.times.map(t => {
              const [h, m] = t.split(':');
              return { hour: parseInt(h), minute: parseInt(m) };
            });
            setScanTimes(times);
            setManualModeTimes(times);
          } else if (config.mode === 'interval') {
            setScanInterval(config.interval_hours);
            setIntervalModeHours(config.interval_hours);
            if (config.interval_start) {
              const [h, m] = config.interval_start.split(':');
              const time = { hour: parseInt(h), minute: parseInt(m) };
              setScanTimes([time]);
              setIntervalModeTime(time);
            }
          }
        } catch (e) {
          console.error('Failed to parse auto_refresh_config:', e);
        }
      } else {
        if (settings.auto_refresh_time) {
          const [hour, minute] = settings.auto_refresh_time.split(':');
          setRefreshHour(parseInt(hour) || 3);
          setRefreshMinute(parseInt(minute) || 0);
          const time = { hour: parseInt(hour) || 3, minute: parseInt(minute) || 0 };
          setScanTimes([time]);
          setManualModeTimes([time]);
          setIntervalModeTime(time);
        }
      }
      setRemoveSponsor(settings.sponsorblock_remove_sponsor === 'true');
      setRemoveSelfpromo(settings.sponsorblock_remove_selfpromo === 'true');
      setRemoveInteraction(settings.sponsorblock_remove_interaction === 'true');
      setCookieSource(settings.cookie_source || 'file');
      setDefaultPlaybackSpeed(settings.default_playback_speed || '1');
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

  // Auto-Scan helper functions
  const getPreviewTimes = () => {
    if (scanMode !== 'interval' || scanTimes.length === 0) return scanTimes;

    const startTime = scanTimes[0];
    const numScans = scanInterval === 6 ? 4 : scanInterval === 8 ? 3 : 2;
    const preview = [startTime];

    for (let i = 1; i < numScans; i++) {
      const totalMinutes = (startTime.hour * 60 + startTime.minute) + (scanInterval * i * 60);
      const hour = Math.floor(totalMinutes / 60) % 24;
      const minute = totalMinutes % 60;
      preview.push({ hour, minute });
    }

    return preview;
  };

  const handleModeSwitch = (newMode) => {
    if (scanMode === 'times') {
      setManualModeTimes(scanTimes);
    } else if (scanMode === 'interval') {
      setIntervalModeTime(scanTimes[0] || { hour: 3, minute: 0 });
      setIntervalModeHours(scanInterval);
    }

    setScanMode(newMode);

    if (newMode === 'interval') {
      setScanTimes([intervalModeTime]);
      setScanInterval(intervalModeHours);
    } else {
      setScanTimes(manualModeTimes);
    }
  };

  const updateScanTime = (index, field, value) => {
    const newTimes = [...scanTimes];
    newTimes[index] = { ...newTimes[index], [field]: parseInt(value) };
    setScanTimes(newTimes);

    if (scanMode === 'times') {
      setManualModeTimes(newTimes);
    } else if (scanMode === 'interval' && index === 0) {
      setIntervalModeTime(newTimes[0]);
    }
  };

  const handleSaveAutoRefresh = async () => {
    try {
      const config = {
        mode: scanMode,
        times: scanMode === 'times'
          ? scanTimes.map(t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
          : [],
        interval_hours: scanMode === 'interval' ? scanInterval : null,
        interval_start: scanMode === 'interval' && scanTimes.length > 0
          ? `${String(scanTimes[0].hour).padStart(2, '0')}:${String(scanTimes[0].minute).padStart(2, '0')}`
          : null
      };

      await updateSettings.mutateAsync({
        auto_refresh_enabled: autoRefresh ? 'true' : 'false',
        auto_refresh_config: JSON.stringify(config)
      });

      showNotification('Auto-scan schedule updated', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to save auto-scan settings', 'error');
    }
  };

  const toggleStatusBar = () => {
    const newValue = !statusBarVisible;
    setStatusBarVisible(newValue);
    localStorage.setItem('statusBarVisible', newValue.toString());
    window.dispatchEvent(new CustomEvent('statusBarVisibilityChanged', { detail: { visible: newValue } }));
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

    if (!currentPassword || !newUsername || !newPassword || !confirmNewPassword) {
      setPasswordError('All fields are required');
      return;
    }

    if (newUsername.length < 3) {
      setPasswordError('Username must be at least 3 characters');
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
          new_username: newUsername,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || 'Failed to change credentials');
        setIsChangingPassword(false);
        return;
      }

      showNotification('Credentials changed successfully!', 'success');

      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowPasswordChange(false);
    } catch (err) {
      setPasswordError('Failed to connect to server');
      setIsChangingPassword(false);
    }
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

  const handleAutoScanToggle = async (enabled) => {
    setAutoRefresh(enabled);
    try {
      await updateSettings.mutateAsync({
        auto_refresh_enabled: enabled ? 'true' : 'false',
        auto_refresh_config: JSON.stringify({
          mode: scanMode,
          times: scanMode === 'times' ? scanTimes.slice(0, 4).map(t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`) : [],
          interval_hours: scanMode === 'interval' ? scanInterval : null,
          interval_start: scanMode === 'interval' && scanTimes.length > 0 ? `${String(scanTimes[0].hour).padStart(2, '0')}:${String(scanTimes[0].minute).padStart(2, '0')}` : null
        })
      });
      showNotification(enabled ? 'Auto-scan enabled' : 'Auto-scan disabled', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update auto-scan', 'error');
    }
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

  // Helper to render time box for auto-scan
  const displayTimes = getPreviewTimes();
  while (displayTimes.length < 4) {
    displayTimes.push({ hour: 0, minute: 0 });
  }

  const renderTimeBox = (time, index) => {
    const isDisabled = scanMode === 'interval' && index > 0;
    return (
      <div key={index} className="time-slot">
        <span className="time-slot-num">{index + 1}.</span>
        <select
          value={time.hour}
          onChange={(e) => updateScanTime(index, 'hour', e.target.value)}
          disabled={isDisabled}
          className={`time-input ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
          ))}
        </select>
        <span className="time-separator">:</span>
        <select
          value={time.minute}
          onChange={(e) => updateScanTime(index, 'minute', e.target.value)}
          disabled={isDisabled}
          className={`time-input ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {Array.from({ length: 60 }, (_, i) => (
            <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <>
    <div className="animate-fade-in pt-4">
      <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">

        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label">YT and Chill</div>
            <div className="stat-value flex items-center justify-center gap-1.5">
              v{APP_VERSION}
              {updateAvailable && (
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="update-badge"
                  title={`Update available: v${latestVersion}`}
                >
                  <UploadIcon />
                </button>
              )}
            </div>
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

        {/* PLAYBACK Section */}
        <div className="settings-section">
          <div className="section-header">
            <PlayIcon />
            Playback
          </div>

          <div className="setting-row">
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

          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name">Skip Segments</div>
                <div className="setting-desc">Auto-remove sponsor content via SponsorBlock</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <button
                onClick={() => handleSponsorBlockToggle('sponsorblock_remove_sponsor', removeSponsor, setRemoveSponsor)}
                className={`settings-toggle-btn ${removeSponsor ? 'active' : ''}`}
              >
                Sponsors
              </button>
              <button
                onClick={() => handleSponsorBlockToggle('sponsorblock_remove_selfpromo', removeSelfpromo, setRemoveSelfpromo)}
                className={`settings-toggle-btn ${removeSelfpromo ? 'active' : ''}`}
              >
                Promo
              </button>
              <button
                onClick={() => handleSponsorBlockToggle('sponsorblock_remove_interaction', removeInteraction, setRemoveInteraction)}
                className={`settings-toggle-btn ${removeInteraction ? 'active' : ''}`}
              >
                Like/Sub
              </button>
            </div>
          </div>
        </div>

        {/* DISPLAY Section */}
        <div className="settings-section">
          <div className="section-header">
            <DisplayIcon />
            Display
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name">Card Date</div>
                <div className="setting-desc">Which date to show on library cards</div>
              </div>
            </div>
            <div className="settings-toggle-group">
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
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name">Status Bar</div>
                <div className="setting-desc">Show download progress in header</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <button
                onClick={() => { if (!statusBarVisible) toggleStatusBar(); }}
                className={`settings-toggle-btn ${statusBarVisible ? 'active' : ''}`}
              >
                Show
              </button>
              <button
                onClick={() => { if (statusBarVisible) toggleStatusBar(); }}
                className={`settings-toggle-btn ${!statusBarVisible ? 'active' : ''}`}
              >
                Hide
              </button>
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

        {/* DOWNLOADS Section */}
        <div className="settings-section">
          <div className="section-header">
            <DownloadIcon />
            Downloads
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <div>
                <div className="setting-name flex items-center gap-2">
                  Cookies
                  <span className={`status-dot ${
                    cookieSource === 'none' ? 'warning' :
                    cookieSource === 'browser' ? (health?.firefox_has_cookies ? 'active' : 'warning') :
                    (health?.cookies_available ? 'active' : 'warning')
                  }`} />
                </div>
                <div className="setting-desc">YouTube authentication for downloads</div>
              </div>
            </div>
            <div className="settings-toggle-group">
              <button
                onClick={() => handleCookieSourceChange('file')}
                className={`settings-toggle-btn ${cookieSource === 'file' ? 'active' : ''}`}
              >
                File
              </button>
              <button
                onClick={() => handleCookieSourceChange('browser')}
                className={`settings-toggle-btn ${cookieSource === 'browser' ? 'active' : ''}`}
              >
                Firefox
              </button>
              <button
                onClick={() => handleCookieSourceChange('none')}
                className={`settings-toggle-btn ${cookieSource === 'none' ? 'active' : ''}`}
              >
                None
              </button>
            </div>
          </div>

          <div className="setting-row flex-col !items-stretch !py-0 !border-b-0">
            <div className="flex items-center justify-between py-3.5">
              <div className="setting-label">
                <span className={`autoscan-status ${autoRefresh ? 'active' : ''}`}></span>
                <div>
                  <div className="setting-name">Auto-Scan</div>
                  <div className="setting-desc">Automatically check channels for new videos</div>
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

            {/* Expandable Auto-Scan config with CSS transition */}
            <div className={`autoscan-expand ${autoRefresh ? 'expanded' : ''}`}>
              <div className="autoscan-inner -mx-4">
                {/* Mode Selector */}
                <div className="mode-selector">
                  <button
                    onClick={() => handleModeSwitch('times')}
                    className={`mode-btn ${scanMode === 'times' ? 'active' : ''}`}
                  >
                    Specific Times
                  </button>
                  <button
                    onClick={() => handleModeSwitch('interval')}
                    className={`mode-btn ${scanMode === 'interval' ? 'active' : ''}`}
                  >
                    Interval
                  </button>
                </div>

                {/* Manual Times Mode */}
                {scanMode === 'times' && (
                  <div>
                    <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                      Scan Times (up to 4)
                    </label>
                    <div className="time-slots">
                      {scanTimes.map((time, index) => (
                        <div key={index} className="time-slot">
                          <span className="time-slot-num">{index + 1}</span>
                          <div className="time-inputs">
                            <input
                              type="text"
                              className="time-input"
                              value={String(time.hour).padStart(2, '0')}
                              maxLength={2}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                                const newTimes = [...scanTimes];
                                newTimes[index] = { ...newTimes[index], hour: parseInt(val) || 0 };
                                setScanTimes(newTimes);
                                setManualModeTimes(newTimes);
                              }}
                            />
                            <span className="time-separator">:</span>
                            <input
                              type="text"
                              className="time-input"
                              value={String(time.minute).padStart(2, '0')}
                              maxLength={2}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                                const newTimes = [...scanTimes];
                                newTimes[index] = { ...newTimes[index], minute: parseInt(val) || 0 };
                                setScanTimes(newTimes);
                                setManualModeTimes(newTimes);
                              }}
                            />
                          </div>
                          {scanTimes.length > 1 && (
                            <button
                              className="remove-slot-btn"
                              onClick={() => {
                                const newTimes = scanTimes.filter((_, i) => i !== index);
                                setScanTimes(newTimes);
                                setManualModeTimes(newTimes);
                              }}
                            >
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {scanTimes.length < 4 && (
                        <div
                          className="time-slot empty"
                          onClick={() => {
                            const newTimes = [...scanTimes, { hour: 12, minute: 0 }];
                            setScanTimes(newTimes);
                            setManualModeTimes(newTimes);
                          }}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Add Time</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Interval Mode */}
                {scanMode === 'interval' && (
                  <div>
                    <div className="interval-config">
                      <div className="interval-group">
                        <label>Every</label>
                        <div className="interval-buttons">
                          {[6, 8, 12].map(hours => (
                            <button
                              key={hours}
                              className={`interval-btn ${scanInterval === hours ? 'active' : ''}`}
                              onClick={() => {
                                setScanInterval(hours);
                                setIntervalModeHours(hours);
                              }}
                            >
                              {hours}h
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="interval-group">
                        <label>Starting At</label>
                        <div className="start-time-picker">
                          <input
                            type="text"
                            className="time-input"
                            value={String(intervalModeTime.hour).padStart(2, '0')}
                            maxLength={2}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setIntervalModeTime({ ...intervalModeTime, hour: parseInt(val) || 0 });
                            }}
                          />
                          <span className="time-separator">:</span>
                          <input
                            type="text"
                            className="time-input"
                            value={String(intervalModeTime.minute).padStart(2, '0')}
                            maxLength={2}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setIntervalModeTime({ ...intervalModeTime, minute: parseInt(val) || 0 });
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Schedule Preview */}
                    <div className="schedule-preview">
                      <div className="preview-label">Scheduled Scans</div>
                      <div className="preview-times">
                        {Array.from({ length: Math.floor(24 / scanInterval) }, (_, i) => {
                          const hour = (intervalModeTime.hour + (i * scanInterval)) % 24;
                          return (
                            <span key={i} className="preview-time">
                              {String(hour).padStart(2, '0')}:{String(intervalModeTime.minute).padStart(2, '0')}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-5">
                  <button
                    onClick={handleSaveAutoRefresh}
                    className="settings-action-btn"
                  >
                    Save Schedule
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SYSTEM Section */}
        <div className="settings-section">
          <div className="section-header">
            <SystemIcon />
            System
          </div>

          <div className="setting-row flex-col !items-stretch gap-3">
            <div className="flex items-center justify-between">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Account</div>
                  <div className="setting-desc">Change username and password</div>
                </div>
              </div>
              <button
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="settings-action-btn"
              >
                <KeyIcon />
                Reset Credentials
              </button>
            </div>

            {/* Password change form */}
            {showPasswordChange && (
              <form onSubmit={handlePasswordChange} className="expandable-content -mx-4 -mb-3.5 rounded-none space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="input text-sm py-1.5 px-3 w-full"
                      disabled={isChangingPassword}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">New Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter new username"
                      className="input text-sm py-1.5 px-3 w-full"
                      disabled={isChangingPassword}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
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
                      placeholder="Confirm new password"
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
                  {isChangingPassword ? 'Saving...' : 'Save New Credentials'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* LOGGING Section */}
        <div className="settings-section">
          <div className="section-header">
            <LogIcon />
            Logging
          </div>

          <div className="setting-row flex-col !items-stretch gap-3">
            <div className="flex items-center justify-between">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Log Level</div>
                  <div className="setting-desc">DEBUG shows everything, ERROR shows only failures</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="settings-toggle-group">
                  {['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'].map(level => (
                    <button
                      key={level}
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

      {/* Cookie Source Help Modal */}
      {showCookieHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowCookieHelp(false)}>
          <div className="card p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-primary">Cookie Source Options</h2>
              <button onClick={() => setShowCookieHelp(false)} className="text-text-muted hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-sm text-text-secondary">
              <div className="space-y-3">
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-2">cookies.txt (Default)</h3>
                  <p className="mb-2">Uses a manually exported cookies.txt file from your browser.</p>
                  <p className="text-xs text-text-muted"><strong>How to use:</strong> Export cookies from your browser using an extension like "Get cookies.txt" while logged into YouTube, then save the file as <code className="bg-dark-primary px-1 rounded">cookies.txt</code> in the backend directory.</p>
                </div>
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-2">Firefox Browser</h3>
                  <p className="mb-2">Automatically extracts cookies directly from your Firefox browser profile.</p>
                  <p className="text-xs text-text-muted mb-2"><strong>Requirements:</strong></p>
                  <ul className="text-xs text-text-muted list-disc list-inside space-y-1 ml-2">
                    <li>Firefox profile mounted to <code className="bg-dark-primary px-1 rounded">/firefox_profile</code> in container</li>
                    <li>YouTube must be logged in via Firefox</li>
                    <li>Configure volume mount: <code className="bg-dark-primary px-1 rounded">/path/to/firefox/.mozilla/firefox:/firefox_profile:ro</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SponsorBlock Help Modal */}
      {showSponsorBlockHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSponsorBlockHelp(false)}>
          <div className="card p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-primary">What is SponsorBlock?</h2>
              <button onClick={() => setShowSponsorBlockHelp(false)} className="text-text-muted hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-sm text-text-secondary">
              <div className="space-y-3">
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Sponsors</h3>
                  <p>Removes paid promotions and sponsorship segments from videos.</p>
                </div>
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Self-Promo</h3>
                  <p>Removes unpaid self-promotion segments like merchandise, Patreon links, etc.</p>
                </div>
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Like/Sub Requests</h3>
                  <p>Removes interaction reminders where creators ask you to like/subscribe.</p>
                </div>
              </div>
              <p className="text-xs text-text-muted mt-4">
                Data provided by <a href="https://sponsor.ajay.app" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">SponsorBlock API</a>.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Update Modal */}
      <UpdateModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        currentVersion={APP_VERSION}
        latestVersion={latestVersion}
        serverPlatform={health?.server_platform}
      />
    </div>
    </>
  );
}
