import { useState, useEffect, useRef } from 'react';
import { useSettings, useUpdateSettings, useHealth, useLogs, useChannels, useVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

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
  const logEndRef = useRef(null);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshHour, setRefreshHour] = useState(3);
  const [refreshMinute, setRefreshMinute] = useState(0);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [logLevel, setLogLevel] = useState('INFO');

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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-2xl space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
      </div>

      {/* API Key Card */}
      <div className="card p-4">
        <div className="space-y-2">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                </svg>
                YouTube Data API Key
              </h3>
              <input
                type="text"
                value={youtubeApiKey}
                onChange={(e) => setYoutubeApiKey(e.target.value)}
                placeholder="Enter your YouTube Data API v3 key..."
                className="input text-sm py-1.5 px-3 w-full font-mono"
              />
            </div>
            <div>
              <span className="text-sm text-text-secondary block mb-3">Auto-scan channels daily at</span>
              <div className="flex items-center gap-2">
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
                {/* ON/OFF Toggle */}
                <div className="flex border border-dark-border rounded-md overflow-hidden">
                  <button
                    onClick={() => setAutoRefresh(false)}
                    className={`px-3 py-1.5 text-xs font-bold transition-all ${
                      !autoRefresh
                        ? 'bg-green-600 text-white'
                        : 'bg-dark-tertiary text-text-muted hover:bg-dark-hover'
                    }`}
                  >
                    OFF
                  </button>
                  <button
                    onClick={() => setAutoRefresh(true)}
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
      </div>

      {/* System Status Card */}
      <div className="card p-4">
        <div className="flex gap-8 mb-4">
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
                <span className="text-text-primary font-mono text-xs">v1.1.0</span>
              </div>
            </div>
          </div>

          {/* Right column - Stats */}
          <div className="flex-1 flex flex-col items-end">
            <div className="space-y-2 text-sm flex flex-col items-end">
              <h3 className="text-sm font-semibold text-text-primary self-start">Stats</h3>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-right w-40">Videos to Review</span>
                <span className="text-text-primary font-mono font-semibold text-right w-16">{discoveredVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-right w-40">Videos Ignored</span>
                <span className="text-text-primary font-mono font-semibold text-right w-16">{ignoredVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-right w-40">Videos in Library</span>
                <span className="text-text-primary font-mono font-semibold text-right w-16">{libraryVideos?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-right w-40">Total Channels</span>
                <span className="text-text-primary font-mono font-semibold text-right w-16">{channels?.length || 0}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-right w-40">Total Storage</span>
                <span className="text-text-primary font-mono font-semibold text-right w-16">{health?.total_storage || '0B'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Logging Level */}
        <div className="pt-3 border-t border-dark-border mt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-secondary">Logging level</span>
            <div className="flex items-center gap-3 flex-1">
              {/* Slider with labels */}
              <div
                className="flex flex-col gap-1.5 flex-1 max-w-sm"
                title="DEBUG: Most verbose - all operations and API calls&#10;INFO: General information - major operations and status&#10;API: YouTube API calls and external requests only&#10;WARNING: Potential issues that don't stop operations&#10;ERROR: Critical failures only"
              >
                <input
                  type="range"
                  min="0"
                  max="4"
                  value={['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'].indexOf(logLevel)}
                  onChange={(e) => setLogLevel(['DEBUG', 'INFO', 'API', 'WARNING', 'ERROR'][parseInt(e.target.value)])}
                  className="w-full h-2 bg-dark-tertiary rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                />
                <div className="flex justify-between text-xs font-mono">
                  <span className={logLevel === 'DEBUG' ? 'text-green-500 font-bold' : 'text-white'}>DEBUG</span>
                  <span className={logLevel === 'INFO' ? 'text-green-500 font-bold' : 'text-white'}>INFO</span>
                  <span className={logLevel === 'API' ? 'text-green-500 font-bold' : 'text-white'}>API</span>
                  <span className={logLevel === 'WARNING' ? 'text-green-500 font-bold' : 'text-white'}>WARNING</span>
                  <span className={logLevel === 'ERROR' ? 'text-green-500 font-bold' : 'text-white'}>ERROR</span>
                </div>
              </div>
              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={updateSettings.isPending}
                className="btn btn-primary whitespace-nowrap py-1.5 text-sm"
              >
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </button>
              {/* View Log Button */}
              <button
                onClick={toggleLogs}
                className="btn bg-dark-tertiary text-white hover:bg-dark-hover whitespace-nowrap py-1.5 text-sm font-bold"
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
    </div>
    </>
  );
}
