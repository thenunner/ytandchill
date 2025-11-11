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
    <div className="max-w-lg space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
      </div>

      {/* YouTube Data API Key */}
      <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
            </svg>
            YouTube Data API Key
          </h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={youtubeApiKey}
              onChange={(e) => setYoutubeApiKey(e.target.value)}
              placeholder="Enter your YouTube Data API v3 key..."
              className="input text-sm py-1.5 px-3 flex-1 font-mono"
            />
            <button
              onClick={handleSave}
              className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
            >
              Save API Key
            </button>
          </div>
          <p className="text-sm text-text-secondary font-medium">
            Required for fast channel scanning. Get your key at{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline font-semibold"
            >
              Google Cloud Console
            </a>
          </p>
        </div>

      {/* SponsorBlock */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
          SponsorBlock
          <button
            onClick={() => setShowSponsorBlockHelp(true)}
            className="ml-1 w-4 h-4 rounded-full border border-text-muted text-text-muted hover:text-text-primary hover:border-text-primary transition-colors flex items-center justify-center text-xs font-bold"
            title="What is SponsorBlock?"
          >
            ?
          </button>
        </h3>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={removeSponsor}
              onChange={() => handleSponsorBlockToggle('sponsorblock_remove_sponsor', removeSponsor, setRemoveSponsor)}
              className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent focus:ring-2 focus:ring-accent cursor-pointer"
            />
            <span className="text-sm text-text-primary font-medium">Remove Sponsors</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={removeSelfpromo}
              onChange={() => handleSponsorBlockToggle('sponsorblock_remove_selfpromo', removeSelfpromo, setRemoveSelfpromo)}
              className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent focus:ring-2 focus:ring-accent cursor-pointer"
            />
            <span className="text-sm text-text-primary font-medium">Remove Self-Promo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={removeInteraction}
              onChange={() => handleSponsorBlockToggle('sponsorblock_remove_interaction', removeInteraction, setRemoveInteraction)}
              className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent focus:ring-2 focus:ring-accent cursor-pointer"
            />
            <span className="text-sm text-text-primary font-medium">Remove Like/Sub Requests</span>
          </label>
        </div>
      </div>

      {/* Theme */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path>
          </svg>
          Theme
        </h3>
        <div className="flex flex-col gap-3">
          {/* Row 1: ash, chalk, rust, drift */}
          <div className="grid grid-cols-4 gap-6">
            <button
              onClick={() => { setTheme('dark'); showNotification('Theme changed to ash', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'dark'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-gray-500 after:to-gray-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 0%, 60%)' }}></div>
              [ ash ]
            </button>
            <button
              onClick={() => { setTheme('light'); showNotification('Theme changed to chalk', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'light'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-gray-600 after:to-gray-400'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 0%, 100%)' }}></div>
              [ chalk ]
            </button>
            <button
              onClick={() => { setTheme('youtube'); showNotification('Theme changed to rust', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'youtube'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-red-500 after:to-red-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(0, 100%, 50%)' }}></div>
              [ rust ]
            </button>
            <button
              onClick={() => { setTheme('midnight'); showNotification('Theme changed to drift', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'midnight'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-blue-500 after:to-blue-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }}></div>
              [ drift ]
            </button>
          </div>

          {/* Row 2: bruise, ember, stain, decay */}
          <div className="grid grid-cols-4 gap-6">
            <button
              onClick={() => { setTheme('purple'); showNotification('Theme changed to bruise', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'purple'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-purple-500 after:to-purple-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(270, 70%, 60%)' }}></div>
              [ bruise ]
            </button>
            <button
              onClick={() => { setTheme('orange'); showNotification('Theme changed to ember', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'orange'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-orange-500 after:to-orange-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(25, 95%, 55%)' }}></div>
              [ ember ]
            </button>
            <button
              onClick={() => { setTheme('yellow'); showNotification('Theme changed to stain', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'yellow'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-yellow-600 after:to-yellow-400'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(45, 95%, 55%)' }}></div>
              [ stain ]
            </button>
            <button
              onClick={() => { setTheme('green'); showNotification('Theme changed to decay', 'success'); }}
              className={`relative flex items-center gap-2 py-1.5 font-semibold text-sm transition-all text-text-primary cursor-pointer ${
                theme === 'green'
                  ? 'after:content-[""] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gradient-to-r after:from-green-500 after:to-green-300'
                  : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(140, 70%, 50%)' }}></div>
              [ decay ]
            </button>
          </div>
        </div>
      </div>

      {/* Password & Auto-Scan */}
      <div className="card p-4">
        {/* Row 1: Titles */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            Password
          </h3>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            Auto-Scan Daily
          </h3>
        </div>

        {/* Row 2: Controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold px-4"
          >
            Reset User
          </button>

          <div className="flex items-center gap-2" id="auto-scan-time">
            <select
              value={refreshHour}
              onChange={async (e) => {
                const newHour = parseInt(e.target.value);
                // Get minute select from parent container - sibling after the span
                const container = e.target.parentElement;
                const minuteSelect = container.querySelector('select:nth-child(3)');
                const currentMinute = minuteSelect ? parseInt(minuteSelect.value) : 0;
                setRefreshHour(newHour);
                try {
                  await updateSettings.mutateAsync({
                    auto_refresh_enabled: autoRefresh ? 'true' : 'false',
                    auto_refresh_time: `${newHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`,
                    youtube_api_key: youtubeApiKey,
                    log_level: logLevel,
                  });
                  const period = newHour >= 12 ? 'pm' : 'am';
                  const hour12 = newHour === 0 ? 12 : newHour > 12 ? newHour - 12 : newHour;
                  showNotification(`Time changed to ${hour12}:${currentMinute.toString().padStart(2, '0')}${period}`, 'success');
                } catch (error) {
                  showNotification(error.message || 'Failed to save refresh hour', 'error');
                }
              }}
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
              onChange={async (e) => {
                const newMinute = parseInt(e.target.value);
                // Get hour select from parent container - first select
                const container = e.target.parentElement;
                const hourSelect = container.querySelector('select:nth-child(1)');
                const currentHour = hourSelect ? parseInt(hourSelect.value) : 0;
                setRefreshMinute(newMinute);
                try {
                  await updateSettings.mutateAsync({
                    auto_refresh_enabled: autoRefresh ? 'true' : 'false',
                    auto_refresh_time: `${currentHour.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`,
                    youtube_api_key: youtubeApiKey,
                    log_level: logLevel,
                  });
                  const period = currentHour >= 12 ? 'pm' : 'am';
                  const hour12 = currentHour === 0 ? 12 : currentHour > 12 ? currentHour - 12 : currentHour;
                  showNotification(`Time changed to ${hour12}:${newMinute.toString().padStart(2, '0')}${period}`, 'success');
                } catch (error) {
                  showNotification(error.message || 'Failed to save refresh minute', 'error');
                }
              }}
              className="input text-sm font-mono py-1.5 px-2 w-16"
            >
              {Array.from({ length: 60 }, (_, i) => (
                <option key={i} value={i}>
                  {i.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
            <div className="flex border border-dark-border rounded-md overflow-hidden">
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
                    ? 'bg-green-600 text-white'
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
                    ? 'bg-green-600 text-white'
                    : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                }`}
              >
                ON
              </button>
            </div>
          </div>
        </div>

        {/* Password Change Form */}
        {showPasswordChange && (
          <form onSubmit={handlePasswordChange} className="space-y-3 mt-4 pt-4 border-t border-dark-border">
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

      {/* System Status Card */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8 mb-4">
          {/* Left column - System Status */}
          <div className="flex-shrink-0">
            <div className="space-y-2 text-sm">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
                System Status
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-24">FFmpeg</span>
                <span className={`font-medium ${health?.ffmpeg_available ? 'text-green-400' : 'text-red-400'}`}>
                  {health?.ffmpeg_available ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-24">Worker</span>
                <span className={`font-medium ${health?.download_worker_running ? 'text-green-400' : 'text-red-400'}`}>
                  {health?.download_worker_running ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-24">Cookies</span>
                <span className={`font-medium ${health?.cookies_available ? 'text-green-400' : 'text-yellow-400'}`}>
                  {health?.cookies_available ? '✓' : '!'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-24">yt-dlp</span>
                <span className="text-text-primary font-mono text-xs">{health?.ytdlp_version || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-24">YT and Chill</span>
                <span className="text-text-primary font-mono text-xs">v2.3.5</span>
              </div>
            </div>
          </div>

          {/* Right column - Stats */}
          <div className="flex-shrink-0">
            <div className="space-y-2 text-sm">
              <h3 className="text-sm font-semibold text-text-primary">Stats</h3>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-40">Videos to Review</span>
                <span className="text-text-primary font-mono font-semibold">{discoveredVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-40">Videos Ignored</span>
                <span className="text-text-primary font-mono font-semibold">{ignoredVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-40">Videos in Library</span>
                <span className="text-text-primary font-mono font-semibold">{libraryVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-40">Total Channels</span>
                <span className="text-text-primary font-mono font-semibold">{channels?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary w-40">Total Storage</span>
                <span className="text-text-primary font-mono font-semibold">{health?.total_storage || '0B'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Logging Level */}
        <div className="pt-2 border-t border-dark-border mt-2">
          <div className="flex flex-col gap-2">
            {/* Row 1: Slider + Level labels */}
            <div
              className="w-full"
              title="DEBUG: Most verbose - all operations and API calls&#10;INFO: General information - major operations and status&#10;API: YouTube API calls and external requests only&#10;WARNING: Potential issues that don't stop operations&#10;ERROR: Critical failures only"
            >
              <input
                type="range"
                min="0"
                max="4"
                value={['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'].indexOf(logLevel)}
                onChange={async (e) => {
                  const newLevel = ['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'][parseInt(e.target.value)];
                  setLogLevel(newLevel);
                  // Save immediately instead of using setTimeout
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
                className="w-full h-2 bg-dark-tertiary rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <div className="flex justify-between text-xs font-mono mt-1">
                <span className={logLevel === 'DEBUG' ? 'text-green-500 font-bold' : 'text-text-primary'}>DEBUG</span>
                <span className={logLevel === 'INFO' ? 'text-green-500 font-bold' : 'text-text-primary'}>INFO</span>
                <span className={logLevel === 'API' ? 'text-green-500 font-bold' : 'text-text-primary'}>API</span>
                <span className={logLevel === 'WARNING' ? 'text-green-500 font-bold' : 'text-text-primary'}>WARNING</span>
                <span className={logLevel === 'ERROR' ? 'text-green-500 font-bold' : 'text-text-primary'}>ERROR</span>
              </div>
            </div>

            {/* Row 2: "Logging level" text + View Logs button */}
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-text-secondary">Logging level</span>
              <button
                onClick={toggleLogs}
                className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold"
              >
                {showLogs ? 'Hide Logs' : 'View Logs'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Log Viewer Card - Collapsible */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          showLogs ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Application Logs

            {logsData?.total_lines && (
              <span className="text-xs text-text-muted ml-auto">
                Showing last 500 of {logsData.total_lines} lines
              </span>
            )}
          </h3>
          <div className="bg-dark-tertiary rounded-lg p-3 overflow-auto max-h-96 font-mono text-xs">
            {logsData?.logs && logsData.logs.length > 0 ? (
              <div className="space-y-0.5">
                {logsData.logs.map((line, index) => (
                  <div
                    key={index}
                    className={`${
                      line.includes('ERROR') ? 'text-red-400' :
                      line.includes('WARNING') ? 'text-yellow-400' :
                      line.includes('INFO') ? 'text-blue-400' :
                      line.includes('API') ? 'text-purple-400' :
                      line.includes('DEBUG') ? 'text-gray-400' :
                      'text-text-secondary'
                    }`}
                  >
                    {line}
                  </div>
                ))}
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
                Data provided by <a href="https://sponsor.ajay.app" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">SponsorBlock API</a> - a community-driven project.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
