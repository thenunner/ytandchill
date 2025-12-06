import { useState, useEffect, useRef } from 'react';
import { useSettings, useUpdateSettings, useHealth, useLogs, useChannels, useVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useTheme, themes } from '../contexts/ThemeContext';

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: health } = useHealth();
  const { data: logsData } = useLogs(500);
  const { data: channels } = useChannels();
  const { data: discoveredVideos } = useVideos({ status: 'discovered' });
  const { data: ignoredVideos } = useVideos({ status: 'ignored' });
  const { data: libraryVideos } = useVideos({ status: 'library' });
  const updateSettings = useUpdateSettings();
  const { showNotification } = useNotification();
  const { theme, setTheme } = useTheme();
  const logEndRef = useRef(null);

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
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [logLevel, setLogLevel] = useState('INFO');

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // SponsorBlock state
  const [removeSponsor, setRemoveSponsor] = useState(false);
  const [removeSelfpromo, setRemoveSelfpromo] = useState(false);
  const [removeInteraction, setRemoveInteraction] = useState(false);
  const [showSponsorBlockHelp, setShowSponsorBlockHelp] = useState(false);

  // Initialize showLogs from localStorage, default to true (open) if not set
  const [showLogs, setShowLogs] = useState(() => {
    const saved = localStorage.getItem('logsVisible');
    return saved !== null ? saved === 'true' : true; // Default: open
  });

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Auto-scroll to bottom of logs when they update (instant scroll)
  useEffect(() => {
    if (logEndRef.current && showLogs) {
      // Use instant scroll for initial load, smooth for updates
      const isInitialLoad = !logEndRef.current.hasScrolledBefore;
      logEndRef.current.scrollIntoView({ behavior: isInitialLoad ? 'instant' : 'smooth' });
      logEndRef.current.hasScrolledBefore = true;
    }
  }, [logsData, showLogs]);

  useEffect(() => {
    if (settings) {
      setAutoRefresh(settings.auto_refresh_enabled === 'true');
      setYoutubeApiKey(settings.youtube_api_key || '');
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
            setManualModeTimes(times); // Store for mode switching
          } else if (config.mode === 'interval') {
            // Interval mode - load start time and interval
            setScanInterval(config.interval_hours);
            setIntervalModeHours(config.interval_hours); // Store for mode switching
            if (config.interval_start) {
              const [h, m] = config.interval_start.split(':');
              const time = { hour: parseInt(h), minute: parseInt(m) };
              setScanTimes([time]);
              setIntervalModeTime(time); // Store for mode switching
            }
          }
        } catch (e) {
          console.error('Failed to parse auto_refresh_config:', e);
        }
      } else {
        // Legacy format: Parse refresh time if stored (format: "HH:MM")
        if (settings.auto_refresh_time) {
          const [hour, minute] = settings.auto_refresh_time.split(':');
          setRefreshHour(parseInt(hour) || 3);
          setRefreshMinute(parseInt(minute) || 0);
          // Also set scanTimes for the new UI
          const time = { hour: parseInt(hour) || 3, minute: parseInt(minute) || 0 };
          setScanTimes([time]);
          setManualModeTimes([time]);
          setIntervalModeTime(time);
        }
      }
      // Load SponsorBlock settings
      setRemoveSponsor(settings.sponsorblock_remove_sponsor === 'true');
      setRemoveSelfpromo(settings.sponsorblock_remove_selfpromo === 'true');
      setRemoveInteraction(settings.sponsorblock_remove_interaction === 'true');
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        auto_refresh_enabled: autoRefresh ? 'true' : 'false',
        auto_refresh_time: `${refreshHour.toString().padStart(2, '0')}:${refreshMinute.toString().padStart(2, '0')}`,
        youtube_api_key: youtubeApiKey,
        log_level: logLevel,
      });
      showNotification('Settings saved', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

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
      setValue(currentValue); // Revert on error
    }
  };

  // Auto-Scan helper functions
  const getPreviewTimes = () => {
    if (scanMode !== 'interval' || scanTimes.length === 0) return scanTimes;

    const startTime = scanTimes[0];
    const numScans = scanInterval === 6 ? 4 : scanInterval === 8 ? 3 : 2;
    const preview = [startTime]; // First time is editable

    for (let i = 1; i < numScans; i++) {
      const totalMinutes = (startTime.hour * 60 + startTime.minute) + (scanInterval * i * 60);
      const hour = Math.floor(totalMinutes / 60) % 24;
      const minute = totalMinutes % 60;
      preview.push({ hour, minute });
    }

    return preview;
  };

  const handleModeSwitch = (newMode) => {
    // Save current mode's times before switching
    if (scanMode === 'times') {
      setManualModeTimes(scanTimes);
    } else if (scanMode === 'interval') {
      setIntervalModeTime(scanTimes[0] || { hour: 3, minute: 0 });
      setIntervalModeHours(scanInterval);
    }

    setScanMode(newMode);

    // Restore the new mode's previously saved times
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

    // Also update the mode-specific state
    if (scanMode === 'times') {
      setManualModeTimes(newTimes);
    } else if (scanMode === 'interval' && index === 0) {
      setIntervalModeTime(newTimes[0]);
    }
  };

  const addScanTime = () => {
    if (scanTimes.length >= 4) {
      showNotification('Maximum 4 scan times allowed', 'error');
      return;
    }
    setScanTimes([...scanTimes, { hour: 0, minute: 0 }]);
  };

  const removeScanTime = (index) => {
    if (scanTimes.length <= 1) {
      showNotification('At least one scan time required', 'error');
      return;
    }
    setScanTimes(scanTimes.filter((_, i) => i !== index));
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

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');

    // Validation
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

      // Clear form
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <>
    <div className="animate-fade-in">
      {/* Single column layout for desktop */}
      <div className="flex flex-col gap-4 w-full">
          {/* Card 1: System Status + Stats + Reset User */}
          <div className="card p-4 w-full">
            {/* System Status */}
            <h3 className="text-sm font-semibold text-text-primary mb-3 text-center">System Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              {/* FFmpeg - Mobile: (1,1), Desktop: (1,1) */}
              <div className="flex items-center justify-center gap-3 order-1 md:order-1">
                <span className="text-text-secondary w-16">FFmpeg</span>
                <span className={`font-medium text-xs ${health?.ffmpeg_available ? 'text-text-primary' : 'text-red-400'}`}>
                  {health?.ffmpeg_available ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* Cookies - Mobile: (3,1), Desktop: (1,2) */}
              <div className="flex items-center justify-center gap-3 order-5 md:order-2">
                <span className="text-text-secondary w-16">Cookies</span>
                <span className={`font-medium text-xs ${health?.cookies_available ? 'text-text-primary' : 'text-yellow-400'}`}>
                  {health?.cookies_available ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* YT and Chill - Mobile: (2,2), Desktop: (1,3) */}
              <div className="flex items-center justify-center gap-3 order-4 md:order-3">
                <span className="text-text-secondary w-24">YT and Chill</span>
                <span className={`font-mono text-xs ${theme === 'online' || theme === 'pixel' || theme === 'debug' ? 'text-black' : 'text-text-primary'}`}>v6.8.0</span>
              </div>
              {/* Worker - Mobile: (2,1), Desktop: (2,1) */}
              <div className="flex items-center justify-center gap-3 order-3 md:order-4">
                <span className="text-text-secondary w-16">Worker</span>
                <span className={`font-medium text-xs ${health?.download_worker_running ? 'text-text-primary' : 'text-red-400'}`}>
                  {health?.download_worker_running ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* yt-dlp - Mobile: (1,2), Desktop: (2,2) */}
              <div className="flex items-center justify-center gap-3 order-2 md:order-5">
                <span className="text-text-secondary w-16">yt-dlp</span>
                <span className={`font-mono text-xs ${theme === 'online' || theme === 'pixel' || theme === 'debug' ? 'text-black' : 'text-text-primary'}`}>{health?.ytdlp_version || 'Unknown'}</span>
              </div>
              {/* Google API */}
              <div className="flex items-center justify-center gap-3 order-5 md:order-6">
                <span className="text-text-secondary w-24">Google API</span>
                <span className={`font-mono text-xs ${theme === 'online' || theme === 'pixel' || theme === 'debug' ? 'text-black' : 'text-text-primary'}`}>{health?.google_api_version || 'Unknown'}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dark-border my-4"></div>

            {/* Stats */}
            <h3 className="text-sm font-semibold text-text-primary mb-3 text-center">Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              {/* Videos to Review - Mobile: (1,1), Desktop: (1,1) */}
              <div className="flex items-center justify-center gap-3 order-1">
                <span className="text-text-secondary">Videos to Review</span>
                <span className="text-text-primary font-mono font-semibold">{discoveredVideos?.length || 0}</span>
              </div>
              {/* Videos Ignored - Mobile: (3,1), Desktop: (1,2) */}
              <div className="flex items-center justify-center gap-3 order-5 md:order-2">
                <span className="text-text-secondary">Videos Ignored</span>
                <span className="text-text-primary font-mono font-semibold">{ignoredVideos?.length || 0}</span>
              </div>
              {/* Total Playlists - Mobile: (2,2), Desktop: (1,3) */}
              <div className="flex items-center justify-center gap-3 order-4 md:order-3">
                <span className="text-text-secondary">Total Playlists</span>
                <span className="text-text-primary font-mono font-semibold">{channels?.length || 0}</span>
              </div>
              {/* Videos in Library - Mobile: (2,1), Desktop: (2,1) */}
              <div className="flex items-center justify-center gap-3 order-3 md:order-4">
                <span className="text-text-secondary">Videos in Library</span>
                <span className="text-text-primary font-mono font-semibold">{libraryVideos?.length || 0}</span>
              </div>
              {/* Total Channels - Mobile: (1,2), Desktop: (2,2) */}
              <div className="flex items-center justify-center gap-3 order-2 md:order-5">
                <span className="text-text-secondary">Total Channels</span>
                <span className="text-text-primary font-mono font-semibold">{channels?.length || 0}</span>
              </div>
              {/* Total Storage - Mobile: (3,2), Desktop: (2,3) */}
              <div className="flex items-center justify-center gap-3 order-6">
                <span className="text-text-secondary">Total Storage</span>
                <span className="text-text-primary font-mono font-semibold">{health?.total_storage || '0B'}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dark-border my-4"></div>

            {/* Reset User Section */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
              >
                Reset User
              </button>
            </div>

            {/* Password Change Form */}
            {showPasswordChange && (
              <form onSubmit={handlePasswordChange} className="space-y-3 mt-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Current Password</label>
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
                  <label className="block text-sm text-text-secondary mb-1">New Username</label>
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
                  <label className="block text-sm text-text-secondary mb-1">New Password</label>
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
                  <label className="block text-sm text-text-secondary mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="input text-sm py-1.5 px-3 w-full"
                    disabled={isChangingPassword}
                  />
                </div>

                {passwordError && (
                  <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-sm">
                    {passwordError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover font-bold py-1.5 text-sm px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChangingPassword ? 'Saving...' : 'Save New Credentials'}
                </button>
              </form>
            )}
          </div>

          {/* Card 2: Theme */}
          <div className="card p-4 w-full">
            <h3 className="text-sm font-semibold text-text-primary mb-3 text-center">Theme</h3>
            <div className="flex flex-col items-center gap-3">
          {/* Dark themes - Mobile: 4 cols (wraps to 2 rows), Desktop: 7 cols (1 row) */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            <button
              onClick={() => { setTheme('kernel'); showNotification('Theme changed to Kernel', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'kernel'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-gray-500 after:to-gray-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(220, 10%, 70%)' }}></div>
              Kernel
            </button>
            <button
              onClick={() => { setTheme('fatal'); showNotification('Theme changed to Fatal', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'fatal'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-red-500 after:to-red-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 100%, 50%)' }}></div>
              Fatal
            </button>
            <button
              onClick={() => { setTheme('subnet'); showNotification('Theme changed to Subnet', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'subnet'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-700 after:to-blue-500'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(220, 50%, 40%)' }}></div>
              Subnet
            </button>
            <button
              onClick={() => { setTheme('archive'); showNotification('Theme changed to Archive', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'archive'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-green-700 after:to-green-500'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(95, 20%, 45%)' }}></div>
              Archive
            </button>
            <button
              onClick={() => { setTheme('buffer'); showNotification('Theme changed to Buffer', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'buffer'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-amber-300 after:to-amber-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(35, 45%, 58%)' }}></div>
              Buffer
            </button>
            <button
              onClick={() => { setTheme('catppuccin'); showNotification('Theme changed to Catppuccin', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'catppuccin'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-400 after:to-purple-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Dark theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#89b4fa' }}></div>
              Catppuccin
            </button>
          </div>

          {/* Separator between dark and light themes */}
          <div className="border-t border-dark-border"></div>

          {/* Light themes - Centered flex layout */}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => { setTheme('online'); showNotification('Theme changed to Online', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'online'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-green-500 after:to-green-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Light theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(115, 25%, 50%)' }}></div>
              Online
            </button>
            <button
              onClick={() => { setTheme('pixel'); showNotification('Theme changed to Pixel', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'pixel'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-pink-400 after:to-pink-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Light theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(315, 80%, 75%)' }}></div>
              Pixel
            </button>
            <button
              onClick={() => { setTheme('debug'); showNotification('Theme changed to Debug', 'success'); }}
              className={`relative flex items-center justify-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'debug'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-400 after:to-blue-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
              title="Light theme"
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(210, 30%, 55%)' }}></div>
              Debug
            </button>
          </div>
            </div>
          </div>

          {/* Card 3: YouTube API Key + Auto-Scan Daily */}
          <div className="card p-4 w-full">
            <div className="flex flex-col md:flex-row gap-6">
              {/* YouTube API Key Section */}
              <div className="flex-1 flex flex-col items-center">
                <h3 className="text-sm font-semibold text-text-primary mb-3 text-center">YouTube Data API Key</h3>
                <div className="flex gap-2 mb-2 w-full md:w-auto">
                  <input
                    type="text"
                    value={youtubeApiKey}
                    onChange={(e) => setYoutubeApiKey(e.target.value)}
                    placeholder="Enter your YouTube Data API v3 key..."
                    className="input text-sm py-1.5 px-3 font-mono w-full md:w-[320px]"
                  />
                  <button
                    onClick={handleSave}
                    className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
                  >
                    Save
                  </button>
                </div>
                <p className="text-sm text-text-secondary font-medium">
                  Get your key at{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-text hover:underline font-semibold"
                  >
                    Google Cloud Console
                  </a>
                </p>
              </div>

              {/* SponsorBlock Section */}
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center justify-center gap-2">
                  SponsorBlock
                  <button
                    onClick={() => setShowSponsorBlockHelp(true)}
                    className="ml-1 w-4 h-4 rounded-full border border-text-muted text-text-muted hover:text-text-primary hover:border-text-primary transition-colors flex items-center justify-center text-xs font-bold"
                    title="What is SponsorBlock?"
                  >
                    ?
                  </button>
                </h3>
                <div className="flex flex-col gap-2 items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeSponsor}
                      onChange={() => handleSponsorBlockToggle('sponsorblock_remove_sponsor', removeSponsor, setRemoveSponsor)}
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text focus:ring-2 focus:ring-accent cursor-pointer"
                    />
                    <span className="text-sm text-text-primary font-medium">Remove Sponsors</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeSelfpromo}
                      onChange={() => handleSponsorBlockToggle('sponsorblock_remove_selfpromo', removeSelfpromo, setRemoveSelfpromo)}
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text focus:ring-2 focus:ring-accent cursor-pointer"
                    />
                    <span className="text-sm text-text-primary font-medium">Remove Self-Promo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeInteraction}
                      onChange={() => handleSponsorBlockToggle('sponsorblock_remove_interaction', removeInteraction, setRemoveInteraction)}
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text focus:ring-2 focus:ring-accent cursor-pointer"
                    />
                    <span className="text-sm text-text-primary font-medium">Remove Like/Sub Requests</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Auto-Scan Daily */}
          <div className="card p-4 w-full">
            {/* Header: Title with Help Icon and ON/OFF Toggle */}
            <div className={`flex items-center justify-center gap-4 ${autoRefresh ? 'mb-3' : ''}`}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Auto-Scan Daily</h3>
                <button
                  className="text-text-secondary hover:text-text-primary transition-colors"
                  title="Automatically scan your channels daily to discover new videos. Choose specific times or interval-based scanning."
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="flex border border-dark-border rounded-md overflow-hidden">
                <button
                  onClick={async () => {
                    setAutoRefresh(false);
                    try {
                      await updateSettings.mutateAsync({
                        auto_refresh_enabled: 'false',
                        auto_refresh_config: JSON.stringify({
                          mode: scanMode,
                          times: scanMode === 'times' ? scanTimes.slice(0, 4).map(t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`) : [],
                          interval_hours: scanMode === 'interval' ? scanInterval : null,
                          interval_start: scanMode === 'interval' && scanTimes.length > 0 ? `${String(scanTimes[0].hour).padStart(2, '0')}:${String(scanTimes[0].minute).padStart(2, '0')}` : null
                        })
                      });
                      showNotification('Auto-scan disabled', 'success');
                    } catch (error) {
                      showNotification(error.message || 'Failed to disable auto-scan', 'error');
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-bold transition-all ${
                    !autoRefresh
                      ? 'bg-accent text-white'
                      : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                  }`}
                >
                  OFF
                </button>
                <button
                  onClick={async () => {
                    setAutoRefresh(true);
                    try {
                      await updateSettings.mutateAsync({
                        auto_refresh_enabled: 'true',
                        auto_refresh_config: JSON.stringify({
                          mode: scanMode,
                          times: scanMode === 'times' ? scanTimes.slice(0, 4).map(t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`) : [],
                          interval_hours: scanMode === 'interval' ? scanInterval : null,
                          interval_start: scanMode === 'interval' && scanTimes.length > 0 ? `${String(scanTimes[0].hour).padStart(2, '0')}:${String(scanTimes[0].minute).padStart(2, '0')}` : null
                        })
                      });
                      showNotification('Auto-scan enabled', 'success');
                    } catch (error) {
                      showNotification(error.message || 'Failed to enable auto-scan', 'error');
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-bold transition-all ${
                    autoRefresh
                      ? 'bg-accent text-white'
                      : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                  }`}
                >
                  ON
                </button>
              </div>
            </div>

            {/* Show content only when ON */}
            {autoRefresh && (
              <>
                {/* Row 1: Mode Selector + Interval Dropdown */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-2 md:gap-3 mb-3">
                  {/* Mode Selector Buttons */}
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => handleModeSwitch('times')}
                      className={`px-3 py-1.5 text-sm font-bold rounded transition-all ${
                        scanMode === 'times'
                          ? 'bg-accent text-white'
                          : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                      }`}
                    >
                      Manual
                    </button>
                    <button
                      onClick={() => handleModeSwitch('interval')}
                      className={`px-3 py-1.5 text-sm font-bold rounded transition-all ${
                        scanMode === 'interval'
                          ? 'bg-accent text-white'
                          : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                      }`}
                    >
                      Repeat
                    </button>
                  </div>

                  {/* Interval Dropdown (only visible in Repeat mode) */}
                  {scanMode === 'interval' && (
                    <select
                      value={scanInterval}
                      onChange={(e) => {
                        const newInterval = parseInt(e.target.value);
                        setScanInterval(newInterval);
                        setIntervalModeHours(newInterval);
                      }}
                      className="input text-sm font-mono py-1.5 px-2 w-full md:w-auto"
                      style={{ maxWidth: '158px' }}
                    >
                      <option value={6}>Every 6 hours (4x daily)</option>
                      <option value={8}>Every 8 hours (3x daily)</option>
                      <option value={12}>Every 12 hours (2x daily)</option>
                    </select>
                  )}
                </div>

                {/* Row 2: Time Boxes + Save Button */}
                <div className="flex justify-center">
                <div>
                {(() => {
                  const displayTimes = getPreviewTimes();
                  while (displayTimes.length < 4) {
                    displayTimes.push({ hour: 0, minute: 0 });
                  }

                  const renderTimeBox = (time, index, mobileWidth = false) => {
                    const isDisabled = scanMode === 'interval' && index > 0;
                    return (
                      <div key={index} className="flex items-center gap-1.5">
                        <span className="text-text-primary text-sm font-bold w-4">{index + 1}.</span>
                        <select
                          value={time.hour}
                          onChange={(e) => updateScanTime(index, 'hour', e.target.value)}
                          disabled={isDisabled}
                          className={`input text-sm font-mono py-1.5 ${mobileWidth ? 'px-1 w-12' : 'px-1.5 w-14'} ${
                            isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {i.toString().padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                        <span className="text-text-primary text-sm font-bold">:</span>
                        <select
                          value={time.minute}
                          onChange={(e) => updateScanTime(index, 'minute', e.target.value)}
                          disabled={isDisabled}
                          className={`input text-sm font-mono py-1.5 ${mobileWidth ? 'px-1 w-12' : 'px-1.5 w-14'} ${
                            isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {Array.from({ length: 60 }, (_, i) => (
                            <option key={i} value={i}>
                              {i.toString().padStart(2, '0')}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* Desktop (lg+): Single row with grouped boxes [1,2] [spacer] [3,4] [Save] */}
                      <div className="hidden lg:flex lg:items-center lg:justify-center gap-6">
                        {/* Group 1: Boxes 1-2 */}
                        <div className="flex items-center gap-6">
                          {renderTimeBox(displayTimes[0], 0)}
                          {renderTimeBox(displayTimes[1], 1)}
                        </div>

                        {/* Visual separator between groups */}
                        <div className="w-12"></div>

                        {/* Group 2: Boxes 3-4 */}
                        <div className="flex items-center gap-6">
                          {renderTimeBox(displayTimes[2], 2)}
                          {renderTimeBox(displayTimes[3], 3)}
                        </div>

                        {/* Save button inline after time boxes */}
                        <button
                          onClick={handleSaveAutoRefresh}
                          className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4 ml-6"
                        >
                          Save
                        </button>
                      </div>

                      {/* Tablet (sm to lg): 2x2 grid with proper grouping [1,2] / [3,4] [Save] */}
                      <div className="hidden sm:flex lg:hidden items-center justify-center gap-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center justify-center gap-6">
                            {renderTimeBox(displayTimes[0], 0)}
                            {renderTimeBox(displayTimes[1], 1)}
                          </div>
                          <div className="flex items-center justify-center gap-6">
                            {renderTimeBox(displayTimes[2], 2)}
                            {renderTimeBox(displayTimes[3], 3)}
                          </div>
                        </div>
                        {/* Save button inline after time boxes */}
                        <button
                          onClick={handleSaveAutoRefresh}
                          className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
                        >
                          Save
                        </button>
                      </div>

                      {/* Mobile (<sm): Two columns - Column 1: 1 & 2, Column 2: 3 & 4 */}
                      <div className="flex sm:hidden flex-col gap-2">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Column 1: Time boxes 1 and 2 */}
                          <div className="flex flex-col gap-2">
                            {renderTimeBox(displayTimes[0], 0, true)}
                            {renderTimeBox(displayTimes[1], 1, true)}
                          </div>
                          {/* Column 2: Time boxes 3 and 4 */}
                          <div className="flex flex-col gap-2">
                            {renderTimeBox(displayTimes[2], 2, true)}
                            {renderTimeBox(displayTimes[3], 3, true)}
                          </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-center">
                          <button
                            onClick={handleSaveAutoRefresh}
                            className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover py-1.5 text-sm font-bold px-3"
                            style={{ width: 'fit-content' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
                </div>
                </div>
              </>
            )}
          </div>

          {/* Card 5: Logging */}
          <div className="card p-4 w-full">
            <div className="flex items-center justify-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-text-primary">Logging</h3>
              <button
                className="text-text-secondary hover:text-text-primary transition-colors"
                title="DEBUG: Most verbose - all operations and API calls&#10;INFO: General information - major operations and status&#10;API: YouTube API calls and external requests only&#10;WARN: Potential issues that don't stop operations&#10;ERROR: Critical failures only"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div>
              <input
                type="range"
                min="0"
                max="4"
                value={['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'].indexOf(logLevel)}
                onChange={async (e) => {
                  const newLevel = ['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'][parseInt(e.target.value)];
                  setLogLevel(newLevel);
                  try {
                    await updateSettings.mutateAsync({
                      auto_refresh_enabled: autoRefresh ? 'true' : 'false',
                      auto_refresh_time: `${refreshHour.toString().padStart(2, '0')}:${refreshMinute.toString().padStart(2, '0')}`,
                      youtube_api_key: youtubeApiKey,
                      log_level: newLevel,
                    });
                    showNotification(`Log level changed to ${newLevel}`, 'success');
                  } catch (error) {
                    showNotification(error.message || 'Failed to save log level', 'error');
                  }
                }}
                className="w-full h-2 bg-dark-tertiary rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <div className="flex justify-between text-sm font-mono mt-1">
                <span className={logLevel === 'DEBUG' ? 'text-accent-text font-bold' : 'text-text-primary'}>DEBUG</span>
                <span className={logLevel === 'INFO' ? 'text-accent-text font-bold' : 'text-text-primary'}>INFO</span>
                <span className={logLevel === 'API' ? 'text-accent-text font-bold' : 'text-text-primary'}>API</span>
                <span className={logLevel === 'WARNING' ? 'text-accent-text font-bold' : 'text-text-primary'}>WARN</span>
                <span className={logLevel === 'ERROR' ? 'text-accent-text font-bold' : 'text-text-primary'}>ERROR</span>
              </div>
              <div className="flex justify-between items-end mt-2">
                <span className="text-sm text-text-secondary">Logging level</span>
                <button
                  onClick={toggleLogs}
                  className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
                >
                  {showLogs ? 'Hide Logs' : 'View Logs'}
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Application Logs Card - Collapsible with card buffer */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out mt-4 ${
          showLogs ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center justify-center">
            Application Logs

            {logsData?.total_lines && (
              <span className="text-xs text-text-muted ml-auto">
                Showing last 500 of {logsData.total_lines} lines
              </span>
            )}
          </h3>
          <div className="bg-dark-primary rounded-lg p-3 overflow-auto max-h-96 font-mono text-xs">
            {logsData?.logs && logsData.logs.length > 0 ? (
              <div className="space-y-0.5">
                {logsData.logs.map((line, index) => {
                  // Parse log line to color only the [LEVEL] part
                  const isLight = theme === 'online' || theme === 'pixel' || theme === 'debug';
                  const baseTextColor = isLight ? 'text-black' : 'text-white';

                  // Match pattern: "timestamp - [LEVEL] - message"
                  const levelMatch = line.match(/^(.* - )(\[(?:ERROR|WARNING|INFO|API|DEBUG)\])( - .*)$/);

                  if (levelMatch) {
                    const [, before, level, after] = levelMatch;
                    const levelColor =
                      level.includes('ERROR') ? 'text-red-400' :
                      level.includes('WARNING') ? 'text-yellow-400' :
                      level.includes('INFO') ? 'text-blue-400' :
                      level.includes('API') ? 'text-purple-400' :
                      level.includes('DEBUG') ? 'text-gray-400' :
                      baseTextColor;

                    return (
                      <div key={index} className={baseTextColor}>
                        {before}<span className={levelColor}>{level}</span>{after}
                      </div>
                    );
                  }

                  // Fallback for non-matching lines
                  return (
                    <div key={index} className={baseTextColor}>
                      {line}
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            ) : (
              <div className="text-text-muted text-center py-8">
                No logs available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SponsorBlock Help Modal */}
      {showSponsorBlockHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSponsorBlockHelp(false)}>
          <div className="card p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-primary">What is SponsorBlock?</h2>
              <button
                onClick={() => setShowSponsorBlockHelp(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-sm text-text-secondary">
              <div className="space-y-3">
                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Sponsors</h3>
                  <p>Removes paid promotions and sponsorship segments from videos (e.g., "This video is sponsored by...").</p>
                </div>

                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Self-Promo</h3>
                  <p>Removes unpaid self-promotion segments like merchandise, Patreon links, or references to other channels owned by the creator.</p>
                </div>

                <div className="bg-dark-tertiary p-3 rounded-lg">
                  <h3 className="font-semibold text-text-primary mb-1">Remove Like/Sub Requests</h3>
                  <p>Removes interaction reminders where creators ask you to like, subscribe, or click the notification bell.</p>
                </div>
              </div>

              <p className="text-xs text-text-muted mt-4">
                Data provided by <a href="https://sponsor.ajay.app" target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">SponsorBlock API</a> - a community-driven project.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
