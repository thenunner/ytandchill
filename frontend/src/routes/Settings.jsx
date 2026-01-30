import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSettings, useHealth, useLogs, useChannels } from '../api/queries';
import api from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/utils';
import { useTheme } from '../contexts/PreferencesContext';
import { useCardSize } from '../contexts/PreferencesContext';
import { ConfirmModal, SelectionListModal } from '../components/ui/SharedModals';
import {
  DatabaseMaintenanceModal,
  MetadataFixModal
} from '../components/ui/SettingsModals';
import { useAutoScan } from '../hooks/useAutoScan';
import { usePasswordChange } from '../hooks/usePasswordChange';
import { useDatabaseMaintenance } from '../hooks/useDatabaseMaintenance';
import { version as APP_VERSION } from '../../package.json';

// Icons
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

const KeyIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
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
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: health } = useHealth();
  const { data: channels } = useChannels();
  const updateSettings = useUpdateSettings();
  const { showNotification } = useNotification();
  const { theme, setTheme } = useTheme();
  const { channelsCardSize, setChannelsCardSize, libraryCardSize, setLibraryCardSize } = useCardSize();

  // Stats
  const [stats, setStats] = useState({ discovered: 0, ignored: 0, library: 0 });
  useEffect(() => {
    fetch('/api/stats', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to fetch stats:', err));
  }, []);

  // Custom hooks
  const autoScan = useAutoScan(settings, updateSettings, showNotification);
  const passwordChange = usePasswordChange(showNotification);

  // YT API key state (needed for hasApiKey in maintenance hook)
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const dbMaintenance = useDatabaseMaintenance(showNotification, hasApiKey);

  // Local settings state
  const [logLevel, setLogLevel] = useState('INFO');
  const [cookieSource, setCookieSource] = useState('file');
  const [removeSponsor, setRemoveSponsor] = useState(false);
  const [removeSelfpromo, setRemoveSelfpromo] = useState(false);
  const [removeInteraction, setRemoveInteraction] = useState(false);
  const [libraryDateDisplay, setLibraryDateDisplay] = useState('downloaded');
  const [globalItemsPerPage, setGlobalItemsPerPage] = useState(50);
  const [hideWatched, setHideWatched] = useState(false);
  const [hidePlaylisted, setHidePlaylisted] = useState(false);
  const [hideEmptyLibraries, setHideEmptyLibraries] = useState(false);
  const [defaultPlaybackSpeed, setDefaultPlaybackSpeed] = useState('1');
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [showResetAuthModal, setShowResetAuthModal] = useState(false);

  // Logs
  const [showLogs, setShowLogs] = useState(() => {
    const saved = localStorage.getItem('logsVisible');
    return saved !== null ? saved === 'true' : false;
  });
  const { data: logsData } = useLogs(500, { enabled: showLogs });
  const logContentRef = useRef(null);

  useEffect(() => {
    if (showLogs && logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [showLogs, logsData]);

  // Version update check
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Collapsible sections
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

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Initialize settings
  useEffect(() => {
    if (settings) {
      setLogLevel(settings.log_level || 'INFO');
      setRemoveSponsor(settings.sponsorblock_remove_sponsor === 'true');
      setRemoveSelfpromo(settings.sponsorblock_remove_selfpromo === 'true');
      setRemoveInteraction(settings.sponsorblock_remove_interaction === 'true');
      setCookieSource(settings.cookie_source || 'file');
      setDefaultPlaybackSpeed(settings.default_playback_speed || '1');
      setDownloadSubtitles(settings.download_subtitles === 'true');
      setYoutubeApiKey(settings.youtube_api_key || '');
      setHasApiKey(!!settings.youtube_api_key);
      setHideWatched(settings.hide_watched === 'true');
      setHidePlaylisted(settings.hide_playlisted === 'true');
      setHideEmptyLibraries(settings.hide_empty_libraries === 'true');
      setLibraryDateDisplay(settings.library_date_display || 'downloaded');
      setGlobalItemsPerPage(Number(settings.items_per_page) || 50);
    }
  }, [settings]);

  // Cleanup old pagination keys
  useEffect(() => {
    localStorage.removeItem('library_itemsPerPage');
    localStorage.removeItem('channelLibrary_itemsPerPage');
    localStorage.removeItem('playlist_itemsPerPage');
  }, []);

  // Compare semver versions
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

  // Handlers
  const toggleLogs = () => {
    const newValue = !showLogs;
    setShowLogs(newValue);
    localStorage.setItem('logsVisible', newValue.toString());
  };

  const handleSponsorBlockToggle = async (setting, currentValue, setValue) => {
    const newValue = !currentValue;
    setValue(newValue);
    try {
      await updateSettings.mutateAsync({ [setting]: newValue ? 'true' : 'false' });
    } catch (error) {
      console.error(`Failed to save ${setting}:`, error);
      setValue(currentValue);
    }
  };

  const handleCookieSourceChange = async (newSource) => {
    setCookieSource(newSource);
    try {
      await updateSettings.mutateAsync({ cookie_source: newSource, cookie_browser: 'firefox' });
      showNotification('Cookie source updated successfully!', 'success');
    } catch (err) {
      showNotification('Failed to update cookie source', 'error');
    }
  };

  const handleSaveApiKey = async () => {
    const key = youtubeApiKey.trim();
    if (!key) {
      setApiKeySaving(true);
      try {
        await updateSettings.mutateAsync({ youtube_api_key: '' });
        setHasApiKey(false);
        showNotification('YT API key cleared', 'success');
      } catch (err) {
        showNotification('Failed to clear API key', 'error');
      } finally {
        setApiKeySaving(false);
      }
      return;
    }

    setApiKeySaving(true);
    try {
      await updateSettings.mutateAsync({ youtube_api_key: key });
      const response = await fetch('/api/settings/test-youtube-api', { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (data.valid) {
        setHasApiKey(true);
        showNotification('API key tested and saved!', 'success');
      } else {
        setHasApiKey(false);
        showNotification(data.error || 'API key saved but invalid', 'warning');
      }
    } catch (err) {
      showNotification('Failed to save API key', 'error');
    } finally {
      setApiKeySaving(false);
    }
  };

  const handlePlaybackSpeedChange = async (newSpeed) => {
    setDefaultPlaybackSpeed(newSpeed);
    try {
      await updateSettings.mutateAsync({ default_playback_speed: newSpeed });
      showNotification(`Default playback speed set to ${newSpeed}x`, 'success');
    } catch (err) {
      showNotification('Failed to update playback speed', 'error');
      setDefaultPlaybackSpeed(defaultPlaybackSpeed);
    }
  };

  const handleResetAuth = async () => {
    try {
      const response = await fetch('/api/auth/reset', { method: 'POST', credentials: 'include' });
      if (response.ok) {
        window.location.href = '/setup';
      } else {
        showNotification('Failed to reset authentication', 'error');
      }
    } catch (err) {
      showNotification('Failed to connect to server', 'error');
    }
    setShowResetAuthModal(false);
  };

  // Theme colors
  const themeColors = {
    kernel: 'hsl(220, 10%, 70%)',
    fatal: 'hsl(0, 100%, 50%)',
    subnet: 'hsl(220, 50%, 40%)',
    archive: 'hsl(95, 20%, 45%)',
    buffer: 'hsl(35, 45%, 58%)',
    catppuccin: '#89b4fa',
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
            <div className="stat-label">YTandchill</div>
            <div className="stat-value">{APP_VERSION}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">YT-DLP</div>
            <div className="stat-value">{health?.ytdlp_version || 'Unknown'}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Database</div>
            <button
              onClick={dbMaintenance.handleQueueRepair}
              disabled={dbMaintenance.isCheckingRepair}
              className="db-action-btn"
              title="Click to open database maintenance"
            >
              {dbMaintenance.isCheckingRepair ? 'Checking...' : (health?.database_size || 'N/A')}
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
                  <div className="text-text-secondary text-sm">v{APP_VERSION} → v{latestVersion}</div>
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
                  <div className="setting-name">Closed Captions</div>
                  <div className="setting-desc">Download subtitles with videos (English, if available)</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={downloadSubtitles}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setDownloadSubtitles(newValue);
                    try {
                      await updateSettings.mutateAsync({ download_subtitles: newValue ? 'true' : 'false' });
                    } catch (err) {
                      setDownloadSubtitles(!newValue);
                    }
                  }}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-row mobile-stack">
              <div className="setting-label">
                <div className="setting-name">SponsorBlock</div>
              </div>
              <div className="settings-toggle-group">
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_sponsor', removeSponsor, setRemoveSponsor)}
                  className={`settings-toggle-btn ${removeSponsor ? 'active' : ''}`}
                  title="Paid promotions and sponsored segments"
                >
                  Sponsors
                </button>
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_selfpromo', removeSelfpromo, setRemoveSelfpromo)}
                  className={`settings-toggle-btn ${removeSelfpromo ? 'active' : ''}`}
                  title="Self-promotion of own products, channels, or social media"
                >
                  Promo
                </button>
                <button
                  onClick={() => handleSponsorBlockToggle('sponsorblock_remove_interaction', removeInteraction, setRemoveInteraction)}
                  className={`settings-toggle-btn ${removeInteraction ? 'active' : ''}`}
                  title="Reminders to like, subscribe, or follow"
                >
                  Like/Sub
                </button>
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
                <button
                  onClick={async () => {
                    setLibraryDateDisplay('uploaded');
                    try {
                      await updateSettings.mutateAsync({ library_date_display: 'uploaded' });
                      showNotification('Library cards will show upload date', 'success');
                    } catch {
                      setLibraryDateDisplay('downloaded');
                    }
                  }}
                  className={`settings-toggle-btn ${libraryDateDisplay === 'uploaded' ? 'active' : ''}`}
                  title="When the video was originally published on YT"
                >
                  YT Upload
                </button>
                <button
                  onClick={async () => {
                    setLibraryDateDisplay('downloaded');
                    try {
                      await updateSettings.mutateAsync({ library_date_display: 'downloaded' });
                      showNotification('Library cards will show download date', 'success');
                    } catch {
                      setLibraryDateDisplay('uploaded');
                    }
                  }}
                  className={`settings-toggle-btn ${libraryDateDisplay === 'downloaded' ? 'active' : ''}`}
                  title="When the video was added to your library"
                >
                  Download
                </button>
              </div>
            </div>

            <div className="setting-row mobile-hide-desc">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Items Per Page</div>
                  <div className="setting-desc">Number of items to display in card views</div>
                </div>
              </div>
              <div className="settings-toggle-group">
                {[25, 50, 100, 250].map(option => (
                  <button
                    key={option}
                    onClick={async () => {
                      const oldValue = globalItemsPerPage;
                      setGlobalItemsPerPage(option);
                      try {
                        await updateSettings.mutateAsync({ items_per_page: String(option) });
                        showNotification(`Items per page set to ${option}`, 'success');
                      } catch {
                        setGlobalItemsPerPage(oldValue);
                      }
                    }}
                    className={`settings-toggle-btn ${globalItemsPerPage === option ? 'active' : ''}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div><div className="setting-name">Card Size - Channels</div></div>
              </div>
              <div className="settings-toggle-group">
                {[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }].map(option => (
                  <button
                    key={option.value}
                    onClick={() => { setChannelsCardSize(option.value); showNotification(`Channels card size set to ${option.label}`, 'success'); }}
                    className={`settings-toggle-btn ${channelsCardSize === option.value ? 'active' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div><div className="setting-name">Card Size - Library</div></div>
              </div>
              <div className="settings-toggle-group">
                {[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }].map(option => (
                  <button
                    key={option.value}
                    onClick={() => { setLibraryCardSize(option.value); showNotification(`Library card size set to ${option.label}`, 'success'); }}
                    className={`settings-toggle-btn ${libraryCardSize === option.value ? 'active' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div><div className="setting-name">Theme</div></div>
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

            <div className="setting-row">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Hide Watched Videos</div>
                  <div className="setting-desc">Hide videos you've already watched from all video lists</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={hideWatched}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setHideWatched(newValue);
                    try {
                      await updateSettings.mutateAsync({ hide_watched: newValue ? 'true' : 'false' });
                      showNotification(newValue ? 'Watched videos will be hidden' : 'Watched videos will be shown', 'success');
                    } catch {
                      setHideWatched(!newValue);
                      showNotification('Failed to save setting', 'error');
                    }
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Hide Videos in Playlists</div>
                  <div className="setting-desc">Hide videos that are already added to a playlist</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={hidePlaylisted}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setHidePlaylisted(newValue);
                    try {
                      await updateSettings.mutateAsync({ hide_playlisted: newValue ? 'true' : 'false' });
                      showNotification(newValue ? 'Playlisted videos will be hidden' : 'Playlisted videos will be shown', 'success');
                    } catch {
                      setHidePlaylisted(!newValue);
                      showNotification('Failed to save setting', 'error');
                    }
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Hide Empty Libraries</div>
                  <div className="setting-desc">Hide libraries with no videos</div>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={hideEmptyLibraries}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setHideEmptyLibraries(newValue);
                    try {
                      await updateSettings.mutateAsync({ hide_empty_libraries: newValue ? 'true' : 'false' });
                      showNotification(newValue ? 'Empty libraries hidden' : 'Empty libraries shown', 'success');
                    } catch {
                      setHideEmptyLibraries(!newValue);
                      showNotification('Failed to save setting', 'error');
                    }
                  }}
                />
                <span className="toggle-slider" />
              </label>
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
                  <div className="setting-desc">YT authentication for downloads</div>
                </div>
              </div>
              <div className="settings-toggle-group">
                <button onClick={() => handleCookieSourceChange('file')} className={`settings-toggle-btn ${cookieSource === 'file' ? 'active' : ''}`} title="Use cookies.txt file from downloads folder">File</button>
                <button onClick={() => handleCookieSourceChange('browser')} className={`settings-toggle-btn ${cookieSource === 'browser' ? 'active' : ''}`} title="Extract cookies from local Firefox browser">Firefox</button>
                <button onClick={() => handleCookieSourceChange('none')} className={`settings-toggle-btn ${cookieSource === 'none' ? 'active' : ''}`} title="No auth - may fail on age-restricted videos">None</button>
              </div>
            </div>

            <div className="setting-row mobile-hide-desc">
              <div className="setting-label">
                <span className={`autoscan-status ${hasApiKey ? 'active' : ''}`}></span>
                <div>
                  <div className="setting-name">API Key</div>
                  <div className="setting-desc">
                    Fetches upload dates quickly for new channels.{' '}
                    <a href="https://developers.google.com/youtube/v3/getting-started" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Get an API key</a>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={youtubeApiKey}
                    onChange={(e) => setYoutubeApiKey(e.target.value)}
                    placeholder="API key"
                    className="input text-sm py-1.5 px-2 pr-8 w-28 sm:w-40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
                <button onClick={handleSaveApiKey} disabled={apiKeySaving} className="settings-action-btn">
                  {apiKeySaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="setting-row flex-col !items-stretch !py-0 !border-b-0">
              <div className="flex items-center justify-between py-3.5">
                <div className="setting-label">
                  <span className={`autoscan-status ${autoScan.autoRefresh ? 'active' : ''}`}></span>
                  <div>
                    <div className="setting-name">Auto-Scan</div>
                    <div className="setting-desc">Check channels on schedule</div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={autoScan.autoRefresh} onChange={(e) => autoScan.setAutoRefresh(e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className={`autoscan-config ${autoScan.autoRefresh ? 'show' : ''}`}>
                <div className="flex items-center gap-2 w-full">
                  <div className="mode-pills">
                    <button onClick={() => autoScan.handleModeSwitch('times')} className={`mode-pill ${autoScan.scanMode === 'times' ? 'active' : ''}`}>Set Times</button>
                    <button onClick={() => autoScan.handleModeSwitch('interval')} className={`mode-pill ${autoScan.scanMode === 'interval' ? 'active' : ''}`}>Interval</button>
                  </div>
                  <button onClick={autoScan.handleSave} className="mode-pill active ml-auto">
                    {!autoScan.serverAutoRefresh && autoScan.autoRefresh ? 'Enable' : (autoScan.serverAutoRefresh && !autoScan.autoRefresh ? 'Disable' : 'Save')}
                  </button>
                </div>

                <span className="config-divider"></span>

                {autoScan.scanMode === 'times' && (
                  <div className="preset-times">
                    {autoScan.PRESET_TIMES.map((time) => (
                      <button key={time} className={`preset-time-btn ${autoScan.selectedPresetTimes.includes(time) ? 'selected' : ''}`} onClick={() => autoScan.togglePresetTime(time)}>{time}</button>
                    ))}
                  </div>
                )}

                {autoScan.scanMode === 'interval' && (
                  <div className="interval-inline">
                    <span className="interval-label">Every</span>
                    <select className="interval-select" value={autoScan.scanInterval} onChange={(e) => autoScan.setScanInterval(parseInt(e.target.value))}>
                      <option value={6}>6 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={12}>12 hours</option>
                    </select>
                    <span className="interval-label">from</span>
                    <div className="time-chip">
                      <input
                        type="text"
                        value={String(autoScan.intervalHour).padStart(2, '0')}
                        maxLength={2}
                        onChange={(e) => {
                          let val = parseInt(e.target.value.replace(/\D/g, '')) || 1;
                          if (val > 12) val = 12;
                          if (val < 1) val = 1;
                          autoScan.setIntervalHour(val);
                        }}
                      />
                      <span className="sep">:</span>
                      <input
                        type="text"
                        value={String(autoScan.intervalMinute).padStart(2, '0')}
                        maxLength={2}
                        onChange={(e) => {
                          let val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                          if (val > 59) val = 59;
                          if (val < 0) val = 0;
                          autoScan.setIntervalMinute(val);
                        }}
                      />
                    </div>
                    <div className="ampm-toggle">
                      <button className={`ampm-btn ${autoScan.intervalAmPm === 'AM' ? 'active' : ''}`} onClick={() => autoScan.setIntervalAmPm('AM')}>AM</button>
                      <button className={`ampm-btn ${autoScan.intervalAmPm === 'PM' ? 'active' : ''}`} onClick={() => autoScan.setIntervalAmPm('PM')}>PM</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SYSTEM Section */}
        <div className="settings-section">
          <div className="section-header cursor-pointer" onClick={() => toggleSection('system')}>
            <SystemIcon />
            System
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                  .then(() => window.location.replace('/login'))
                  .catch(() => window.location.replace('/login'));
              }}
              className="md:hidden ml-auto mr-2 px-4 py-1.5 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-hover transition-all"
            >
              Logout
            </button>
            <ChevronIcon collapsed={collapsedSections.system} />
          </div>

          <div className={`section-content ${collapsedSections.system ? 'collapsed' : ''}`}>
            <div className="setting-row flex-col !items-stretch gap-3">
              <div className="flex items-center justify-between">
                <div className="setting-label">
                  <div>
                    <div className="setting-name">Password</div>
                    <div className="setting-desc">Change your account password</div>
                  </div>
                </div>
                <button onClick={() => passwordChange.setShowForm(!passwordChange.showForm)} className="settings-action-btn">
                  <KeyIcon />
                  Change Password
                </button>
              </div>

              {passwordChange.showForm && (
                <form onSubmit={passwordChange.handleSubmit} className="expandable-content -mx-4 -mb-3.5 rounded-none space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Current Password</label>
                      <input type="password" value={passwordChange.currentPassword} onChange={(e) => passwordChange.setCurrentPassword(e.target.value)} placeholder="Current password" className="input text-sm py-1.5 px-3 w-full" disabled={passwordChange.isLoading} autoComplete="current-password" autoFocus />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">New Password</label>
                      <input type="password" value={passwordChange.newPassword} onChange={(e) => passwordChange.setNewPassword(e.target.value)} placeholder="New password" className="input text-sm py-1.5 px-3 w-full" disabled={passwordChange.isLoading} autoComplete="new-password" />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Confirm Password</label>
                      <input type="password" value={passwordChange.confirmPassword} onChange={(e) => passwordChange.setConfirmPassword(e.target.value)} placeholder="Confirm password" className="input text-sm py-1.5 px-3 w-full" disabled={passwordChange.isLoading} autoComplete="new-password" />
                    </div>
                  </div>
                  {passwordChange.error && (
                    <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-xs">{passwordChange.error}</div>
                  )}
                  <button type="submit" disabled={passwordChange.isLoading} className="settings-action-btn disabled:opacity-50">
                    {passwordChange.isLoading ? 'Saving...' : 'Save Password'}
                  </button>
                </form>
              )}
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div><div className="setting-name">Can't Access your Account?</div></div>
              </div>
              <button onClick={() => setShowResetAuthModal(true)} className="settings-action-btn text-red-400 hover:text-red-300">Reset</button>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <div>
                  <div className="setting-name">Clear Logs</div>
                  <div className="setting-desc">Delete log entries</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const result = await api.clearLogs('current');
                      showNotification(result.message || 'Current log cleared', 'success');
                      queryClient.invalidateQueries({ queryKey: ['logs'] });
                    } catch (error) {
                      showNotification('Failed to clear logs', 'error');
                    }
                  }}
                  className="settings-action-btn"
                >
                  Current
                </button>
                <button
                  onClick={async () => {
                    try {
                      const result = await api.clearLogs('all');
                      showNotification(result.message || 'All logs cleared', 'success');
                      queryClient.invalidateQueries({ queryKey: ['logs'] });
                    } catch (error) {
                      showNotification('Failed to clear logs', 'error');
                    }
                  }}
                  className="settings-action-btn text-red-400 hover:text-red-300"
                >
                  All
                </button>
              </div>
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
                      <button
                        key={level}
                        onClick={async () => {
                          setLogLevel(level);
                          try {
                            await updateSettings.mutateAsync({ log_level: level });
                            showNotification(`Log level changed to ${level}`, 'success');
                          } catch (error) {
                            showNotification(getUserFriendlyError(error.message, 'save settings'), 'error');
                          }
                        }}
                        className={`settings-toggle-btn ${logLevel === level ? 'active' : ''}`}
                        title={tip}
                      >
                        {level === 'WARNING' ? 'WARN' : level}
                      </button>
                    ))}
                  </div>
                  <button onClick={toggleLogs} className="settings-action-btn">{showLogs ? 'Hide' : 'View'} Logs</button>
                </div>
              </div>

              <div className={`log-viewer ${showLogs ? 'expanded' : ''}`}>
                <div className="log-header">
                  {logsData?.total_lines && <span className="text-xs text-text-muted">Showing last 500 of {logsData.total_lines} lines</span>}
                </div>
                <div className="log-content" ref={logContentRef}>
                  {logsData?.logs && logsData.logs.length > 0 ? (
                    logsData.logs.map((line, index) => {
                      const levelMatch = line.match(/^(.* - )(\[(?:ERROR|WARNING|INFO|API|DEBUG)\])( - .*)$/);
                      if (levelMatch) {
                        const [, before, level, after] = levelMatch;
                        const levelClass = level.includes('ERROR') ? 'error' : level.includes('WARNING') ? 'warn' : level.includes('INFO') ? 'info' : level.includes('API') ? 'api' : 'debug';
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

      {/* Database Maintenance Modals */}
      <DatabaseMaintenanceModal
        isOpen={dbMaintenance.showRepairModal}
        onClose={() => dbMaintenance.setShowRepairModal(false)}
        repairData={dbMaintenance.repairData}
        missingMetadataData={dbMaintenance.missingMetadataData}
        onOpenNotFound={dbMaintenance.openNotFoundModal}
        onOpenShrinkDB={dbMaintenance.openShrinkDBModal}
        onOpenMetadataFix={dbMaintenance.openMetadataFixModal}
      />

      <SelectionListModal
        isOpen={dbMaintenance.showNotFoundModal}
        onClose={() => dbMaintenance.setShowNotFoundModal(false)}
        title="Unavailable Videos"
        items={(dbMaintenance.repairData?.not_found_videos || []).map(v => ({
          id: v.id,
          title: v.title,
          subtitle: v.channel_name
        }))}
        selectedIds={dbMaintenance.selectedNotFoundVideos}
        setSelectedIds={dbMaintenance.setSelectedNotFoundVideos}
        onAction={dbMaintenance.handleRemoveNotFoundVideos}
        isLoading={dbMaintenance.isRemoving}
        actionText="Remove"
        emptyMessage="✓ No videos to remove"
      />

      <SelectionListModal
        isOpen={dbMaintenance.showShrinkDBModal}
        onClose={() => dbMaintenance.setShowShrinkDBModal(false)}
        title="Purge Channels"
        items={(dbMaintenance.repairData?.deletable_channels || []).map(c => ({
          id: c.id,
          title: c.title,
          subtitle: `${c.video_count} video${c.video_count !== 1 ? 's' : ''} • No library videos`
        }))}
        selectedIds={dbMaintenance.selectedChannels}
        setSelectedIds={dbMaintenance.setSelectedChannels}
        onAction={dbMaintenance.handlePurgeChannels}
        isLoading={dbMaintenance.isRemoving}
        actionText="Purge"
        emptyMessage="✓ No channels to purge"
        headerMessage="Select empty channels to permanently remove:"
      />

      <MetadataFixModal
        isOpen={dbMaintenance.showMetadataFixModal}
        onClose={() => dbMaintenance.setShowMetadataFixModal(false)}
        data={dbMaintenance.missingMetadataData}
        onFix={dbMaintenance.handleFixMetadata}
        isFixing={dbMaintenance.isFixingMetadata}
        hasApiKey={hasApiKey}
      />

      {/* Reset Auth Confirmation Modal */}
      {showResetAuthModal && (
        <ConfirmModal
          isOpen={showResetAuthModal}
          onCancel={() => setShowResetAuthModal(false)}
          onConfirm={handleResetAuth}
          title="Wipe Credentials?"
          message="This will delete your credentials and return to initial setup."
          confirmText="Wipe Credentials"
          confirmStyle="danger"
        />
      )}

    </div>
    </>
  );
}
