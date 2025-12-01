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
      // Parse refresh time if stored (format: "HH:MM")
      if (settings.auto_refresh_time) {
        const [hour, minute] = settings.auto_refresh_time.split(':');
        setRefreshHour(parseInt(hour) || 3);
        setRefreshMinute(parseInt(minute) || 0);
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
      <div className="flex flex-col gap-4 w-full max-w-[960px]">
          {/* Card 1: System Status + Stats + Reset User */}
          <div className="card p-4 w-full">
            {/* System Status */}
            <h3 className="text-sm font-semibold text-text-primary mb-3">System Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              {/* FFmpeg - Mobile: (1,1), Desktop: (1,1) */}
              <div className="flex items-center gap-3 order-1 md:order-1">
                <span className="text-text-secondary w-16">FFmpeg</span>
                <span className={`font-medium text-xs ${health?.ffmpeg_available ? 'text-text-primary' : 'text-red-400'}`}>
                  {health?.ffmpeg_available ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* Cookies - Mobile: (3,1), Desktop: (1,2) */}
              <div className="flex items-center gap-3 order-5 md:order-2">
                <span className="text-text-secondary w-16">Cookies</span>
                <span className={`font-medium text-xs ${health?.cookies_available ? 'text-text-primary' : 'text-yellow-400'}`}>
                  {health?.cookies_available ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* YT and Chill - Mobile: (2,2), Desktop: (1,3) */}
              <div className="flex items-center gap-3 order-4 md:order-3">
                <span className="text-text-secondary w-24">YT and Chill</span>
                <span className={`font-mono text-xs ${theme === 'online' || theme === 'pixel' || theme === 'debug' ? 'text-black' : 'text-text-primary'}`}>v5.1.0</span>
              </div>
              {/* Worker - Mobile: (2,1), Desktop: (2,1) */}
              <div className="flex items-center gap-3 order-3 md:order-4">
                <span className="text-text-secondary w-16">Worker</span>
                <span className={`font-medium text-xs ${health?.download_worker_running ? 'text-text-primary' : 'text-red-400'}`}>
                  {health?.download_worker_running ? 'Active' : 'Inactive'}
                </span>
              </div>
              {/* yt-dlp - Mobile: (1,2), Desktop: (2,2) */}
              <div className="flex items-center gap-3 order-2 md:order-5">
                <span className="text-text-secondary w-16">yt-dlp</span>
                <span className={`font-mono text-xs ${theme === 'online' || theme === 'pixel' || theme === 'debug' ? 'text-black' : 'text-text-primary'}`}>{health?.ytdlp_version || 'Unknown'}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dark-border my-4"></div>

            {/* Stats */}
            <h3 className="text-sm font-semibold text-text-primary mb-3">Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              {/* Videos to Review - Mobile: (1,1), Desktop: (1,1) */}
              <div className="flex items-center gap-3 order-1">
                <span className="text-text-secondary">Videos to Review</span>
                <span className="text-text-primary font-mono font-semibold">{discoveredVideos?.length || 0}</span>
              </div>
              {/* Videos Ignored - Mobile: (3,1), Desktop: (1,2) */}
              <div className="flex items-center gap-3 order-5 md:order-2">
                <span className="text-text-secondary">Videos Ignored</span>
                <span className="text-text-primary font-mono font-semibold">{ignoredVideos?.length || 0}</span>
              </div>
              {/* Total Playlists - Mobile: (2,2), Desktop: (1,3) */}
              <div className="flex items-center gap-3 order-4 md:order-3">
                <span className="text-text-secondary">Total Playlists</span>
                <span className="text-text-primary font-mono font-semibold">{channels?.length || 0}</span>
              </div>
              {/* Videos in Library - Mobile: (2,1), Desktop: (2,1) */}
              <div className="flex items-center gap-3 order-3 md:order-4">
                <span className="text-text-secondary">Videos in Library</span>
                <span className="text-text-primary font-mono font-semibold">{libraryVideos?.length || 0}</span>
              </div>
              {/* Total Channels - Mobile: (1,2), Desktop: (2,2) */}
              <div className="flex items-center gap-3 order-2 md:order-5">
                <span className="text-text-secondary">Total Channels</span>
                <span className="text-text-primary font-mono font-semibold">{channels?.length || 0}</span>
              </div>
              {/* Total Storage - Mobile: (3,2), Desktop: (2,3) */}
              <div className="flex items-center gap-3 order-6">
                <span className="text-text-secondary">Total Storage</span>
                <span className="text-text-primary font-mono font-semibold">{health?.total_storage || '0B'}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-dark-border my-4"></div>

            {/* Reset User Section */}
            <div>
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
            <h3 className="text-sm font-semibold text-text-primary mb-3">Theme</h3>
            <div className="flex flex-col gap-3">
          {/* Dark themes - Mobile: 4 cols (wraps to 2 rows), Desktop: 7 cols (1 row) */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            <button
              onClick={() => { setTheme('kernel'); showNotification('Theme changed to Kernel', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'kernel'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-gray-500 after:to-gray-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(220, 10%, 70%)' }}></div>
              Kernel
            </button>
            <button
              onClick={() => { setTheme('fatal'); showNotification('Theme changed to Fatal', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'fatal'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-red-500 after:to-red-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 100%, 50%)' }}></div>
              Fatal
            </button>
            <button
              onClick={() => { setTheme('subnet'); showNotification('Theme changed to Subnet', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'subnet'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-700 after:to-blue-500'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(220, 50%, 40%)' }}></div>
              Subnet
            </button>
            <button
              onClick={() => { setTheme('archive'); showNotification('Theme changed to Archive', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'archive'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-green-700 after:to-green-500'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(95, 20%, 45%)' }}></div>
              Archive
            </button>
            <button
              onClick={() => { setTheme('buffer'); showNotification('Theme changed to Buffer', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'buffer'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-amber-300 after:to-amber-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(35, 45%, 58%)' }}></div>
              Buffer
            </button>
            <button
              onClick={() => { setTheme('gateway'); showNotification('Theme changed to Gateway', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'gateway'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-cyan-400 after:to-cyan-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(182, 100%, 35%)' }}></div>
              Gateway
            </button>
          </div>

          {/* Separator between dark and light themes */}
          <div className="border-t border-dark-border"></div>

          {/* Light themes - Mobile: 4 cols (1 row), Desktop: 7 cols (1 row) */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            <button
              onClick={() => { setTheme('online'); showNotification('Theme changed to Online', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'online'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-green-500 after:to-green-300'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(115, 25%, 50%)' }}></div>
              Online
            </button>
            <button
              onClick={() => { setTheme('pixel'); showNotification('Theme changed to Pixel', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'pixel'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-pink-400 after:to-pink-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(315, 80%, 75%)' }}></div>
              Pixel
            </button>
            <button
              onClick={() => { setTheme('debug'); showNotification('Theme changed to Debug', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all cursor-pointer ${
                theme === 'debug'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-400 after:to-blue-200'
                  : ''
              }`}
              style={{ color: theme === 'online' || theme === 'pixel' || theme === 'debug' ? '#000000' : '#ffffff' }}
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
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-text-primary mb-3">YouTube Data API Key</h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={youtubeApiKey}
                    onChange={(e) => setYoutubeApiKey(e.target.value)}
                    placeholder="Enter your YouTube Data API v3 key..."
                    className="input text-sm py-1.5 px-3 w-full font-mono"
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

              {/* Auto-Scan Daily Section */}
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Auto-Scan Daily</h3>
                <div className="flex items-center gap-3 mb-2">
                  <select
                    value={refreshHour}
                    onChange={(e) => setRefreshHour(parseInt(e.target.value))}
                    className="input text-sm font-mono py-1.5 px-2 w-16"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="text-text-primary text-sm font-bold">:</span>
                  <select
                    value={refreshMinute}
                    onChange={(e) => setRefreshMinute(parseInt(e.target.value))}
                    className="input text-sm font-mono py-1.5 px-2 w-16"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      const timeString = `${refreshHour.toString().padStart(2, '0')}:${refreshMinute.toString().padStart(2, '0')}`;
                      try {
                        const payload = {
                          auto_refresh_enabled: autoRefresh ? 'true' : 'false',
                          auto_refresh_time: timeString,
                          youtube_api_key: youtubeApiKey,
                          log_level: logLevel,
                        };
                        await updateSettings.mutateAsync(payload);
                        const period = refreshHour >= 12 ? 'pm' : 'am';
                        const hour12 = refreshHour === 0 ? 12 : refreshHour > 12 ? refreshHour - 12 : refreshHour;
                        showNotification(`Time changed to ${hour12}:${refreshMinute.toString().padStart(2, '0')}${period}`, 'success');
                      } catch (error) {
                        showNotification(error.message || 'Failed to save time', 'error');
                      }
                    }}
                    className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
                  >
                    Save
                  </button>
                </div>
                <div className="flex border border-dark-border rounded-md overflow-hidden w-fit">
                  <button
                    onClick={async () => {
                      setAutoRefresh(false);
                      try {
                        await updateSettings.mutateAsync({
                          auto_refresh_enabled: 'false',
                          auto_refresh_time: `${refreshHour.toString().padStart(2, '0')}:${refreshMinute.toString().padStart(2, '0')}`,
                          youtube_api_key: youtubeApiKey,
                          log_level: logLevel,
                        });
                        showNotification('Auto-scan disabled', 'success');
                      } catch (error) {
                        showNotification(error.message || 'Failed to save auto refresh', 'error');
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
                          auto_refresh_time: `${refreshHour.toString().padStart(2, '0')}:${refreshMinute.toString().padStart(2, '0')}`,
                          youtube_api_key: youtubeApiKey,
                          log_level: logLevel,
                        });
                        showNotification('Auto-scan enabled', 'success');
                      } catch (error) {
                        showNotification(error.message || 'Failed to save auto refresh', 'error');
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
            </div>
          </div>

          {/* Card 4: SponsorBlock */}
          <div className="card p-4 w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full gap-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                SponsorBlock
                <button
                  onClick={() => setShowSponsorBlockHelp(true)}
                  className="ml-1 w-4 h-4 rounded-full border border-text-muted text-text-muted hover:text-text-primary hover:border-text-primary transition-colors flex items-center justify-center text-xs font-bold"
                  title="What is SponsorBlock?"
                >
                  ?
                </button>
              </h3>
              <div className="flex items-center gap-6">
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

          {/* Card 5: Logging */}
          <div className="card p-4 w-full">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Logging</h3>
            <div
              title="DEBUG: Most verbose - all operations and API calls&#10;INFO: General information - major operations and status&#10;API: YouTube API calls and external requests only&#10;WARN: Potential issues that don't stop operations&#10;ERROR: Critical failures only"
            >
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
              <div className="flex justify-between text-xs font-mono mt-1">
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
        className={`overflow-hidden transition-all duration-300 ease-in-out max-w-[960px] mt-4 ${
          showLogs ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center">
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
