import { useState, useEffect } from 'react';
import { getUserFriendlyError } from '../utils/errorMessages';

const PRESET_TIMES = ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

// Convert preset time label to 24h hour value
const presetTo24h = (preset) => {
  const map = {
    '12 AM': 0, '3 AM': 3, '6 AM': 6, '9 AM': 9,
    '12 PM': 12, '3 PM': 15, '6 PM': 18, '9 PM': 21
  };
  return map[preset] ?? 0;
};

// Convert 24h hour to preset label
const hour24ToPreset = (hour24) => {
  const map = { 0: '12 AM', 3: '3 AM', 6: '6 AM', 9: '9 AM', 12: '12 PM', 15: '3 PM', 18: '6 PM', 21: '9 PM' };
  return map[hour24] || null;
};

// Convert 24h to 12h format
const to12Hour = (hour24) => {
  if (hour24 === 0) return { hour: 12, ampm: 'AM' };
  if (hour24 === 12) return { hour: 12, ampm: 'PM' };
  if (hour24 < 12) return { hour: hour24, ampm: 'AM' };
  return { hour: hour24 - 12, ampm: 'PM' };
};

// Convert 12h time to 24h
const to24Hour = (hour, ampm) => {
  if (ampm === 'AM') {
    return hour === 12 ? 0 : hour;
  } else {
    return hour === 12 ? 12 : hour + 12;
  }
};

export function useAutoScan(settings, updateSettings, showNotification) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [serverAutoRefresh, setServerAutoRefresh] = useState(false);
  const [scanMode, setScanMode] = useState('times');
  const [selectedPresetTimes, setSelectedPresetTimes] = useState(['3 AM']);
  const [scanInterval, setScanInterval] = useState(6);
  const [intervalHour, setIntervalHour] = useState(3);
  const [intervalMinute, setIntervalMinute] = useState(0);
  const [intervalAmPm, setIntervalAmPm] = useState('AM');

  // Initialize from settings
  useEffect(() => {
    if (settings) {
      const isEnabled = settings.auto_refresh_enabled === 'true';
      setAutoRefresh(isEnabled);
      setServerAutoRefresh(isEnabled);

      if (settings.auto_refresh_config) {
        try {
          const config = JSON.parse(settings.auto_refresh_config);
          setScanMode(config.mode || 'times');

          if (config.mode === 'times' && config.times) {
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
    }
  }, [settings]);

  const handleModeSwitch = (newMode) => {
    setScanMode(newMode);
  };

  const togglePresetTime = (time) => {
    if (selectedPresetTimes.includes(time)) {
      if (selectedPresetTimes.length > 1) {
        setSelectedPresetTimes(selectedPresetTimes.filter(t => t !== time));
      }
    } else {
      setSelectedPresetTimes([...selectedPresetTimes, time]);
    }
  };

  const handleSave = async () => {
    try {
      let config;

      if (scanMode === 'times') {
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

      const wasEnabled = serverAutoRefresh;
      const isNowEnabled = autoRefresh;

      if (!wasEnabled && isNowEnabled) {
        showNotification('Auto-scan enabled', 'success');
      } else if (wasEnabled && !isNowEnabled) {
        showNotification('Auto-scan disabled', 'success');
      } else {
        showNotification('Auto-scan schedule saved', 'success');
      }

      setServerAutoRefresh(autoRefresh);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'save settings'), 'error');
    }
  };

  return {
    autoRefresh,
    setAutoRefresh,
    serverAutoRefresh,
    scanMode,
    handleModeSwitch,
    selectedPresetTimes,
    togglePresetTime,
    scanInterval,
    setScanInterval,
    intervalHour,
    setIntervalHour,
    intervalMinute,
    setIntervalMinute,
    intervalAmPm,
    setIntervalAmPm,
    handleSave,
    PRESET_TIMES
  };
}
