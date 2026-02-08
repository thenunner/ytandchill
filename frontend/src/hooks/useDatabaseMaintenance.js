import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useDatabaseMaintenance(showNotification, hasApiKey) {
  const queryClient = useQueryClient();
  // Modal visibility
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [showShrinkDBModal, setShowShrinkDBModal] = useState(false);
  const [showMetadataFixModal, setShowMetadataFixModal] = useState(false);
  const [showSponsorblockModal, setShowSponsorblockModal] = useState(false);
  const [showLowQualityModal, setShowLowQualityModal] = useState(false);
  const [showSponsorblockCutModal, setShowSponsorblockCutModal] = useState(false);

  // Data
  const [repairData, setRepairData] = useState(null);
  const [missingMetadataData, setMissingMetadataData] = useState(null);
  const [sponsorblockData, setSponsorblockData] = useState(null);
  const [selectedNotFoundVideos, setSelectedNotFoundVideos] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [lowQualityData, setLowQualityData] = useState(null);
  const [selectedLowQualityVideos, setSelectedLowQualityVideos] = useState([]);
  const [sponsorblockCutData, setSponsorblockCutData] = useState(null);
  const [selectedSponsorblockCutVideos, setSelectedSponsorblockCutVideos] = useState([]);

  // Loading states
  const [isCheckingRepair, setIsCheckingRepair] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isFixingMetadata, setIsFixingMetadata] = useState(false);
  const [isFixingSponsorblock, setIsFixingSponsorblock] = useState(false);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCuttingSponsorblock, setIsCuttingSponsorblock] = useState(false);
  const [sponsorblockCutProgress, setSponsorblockCutProgress] = useState(null);

  // Watch for SSE progress updates during SponsorBlock cutting
  useEffect(() => {
    if (!isCuttingSponsorblock) {
      setSponsorblockCutProgress(null);
      return;
    }
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] === 'sponsorblock-cut-progress') {
        const data = queryClient.getQueryData(['sponsorblock-cut-progress']);
        if (data) {
          setSponsorblockCutProgress(data);
        }
      }
    });
    return unsubscribe;
  }, [isCuttingSponsorblock, queryClient]);

  const handleQueueRepair = async () => {
    setIsCheckingRepair(true);
    try {
      const [repairResponse, metadataResponse, sponsorblockResponse, sbCutResponse] = await Promise.all([
        fetch('/api/queue/check-orphaned', { credentials: 'include' }),
        fetch('/api/settings/missing-metadata', { credentials: 'include' }),
        fetch('/api/settings/missing-sponsorblock-chapters', { credentials: 'include' }),
        fetch('/api/settings/sponsorblock-cut-check', { credentials: 'include' })
      ]);

      const data = await repairResponse.json();
      const metadataData = await metadataResponse.json();
      const sbData = await sponsorblockResponse.json();
      const sbCutData = await sbCutResponse.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      setRepairData(data);
      setMissingMetadataData(metadataData);
      setSponsorblockData(sbData);
      setSponsorblockCutData(sbCutData);
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
        body: JSON.stringify({ video_ids: selectedNotFoundVideos }),
        credentials: 'include'
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
        body: JSON.stringify({ channel_ids: selectedChannels }),
        credentials: 'include'
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

  const handleFixMetadata = async () => {
    setIsFixingMetadata(true);
    try {
      const response = await fetch('/api/settings/fix-upload-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      const parts = [];
      if (data.updated > 0) {
        const method = data.method === 'api' ? 'YT API' : 'yt-dlp';
        parts.push(`${data.updated} upload date${data.updated !== 1 ? 's' : ''} via ${method}`);
      }
      if (data.thumbnails_fixed > 0) {
        parts.push(`${data.thumbnails_fixed} thumbnail${data.thumbnails_fixed !== 1 ? 's' : ''}`);
      }
      const message = parts.length > 0
        ? `Fixed ${parts.join(', ')}${data.failed > 0 ? ` (${data.failed} failed)` : ''}`
        : 'No issues found to fix';
      showNotification(message, data.failed > 0 ? 'warning' : 'success');

      setShowMetadataFixModal(false);
      setShowRepairModal(false);
      setMissingMetadataData(null);
    } catch (error) {
      showNotification('Failed to fix metadata', 'error');
    } finally {
      setIsFixingMetadata(false);
    }
  };

  const handleFixSponsorblockChapters = async () => {
    setIsFixingSponsorblock(true);
    try {
      const response = await fetch('/api/settings/fix-sponsorblock-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      // Build detailed message
      const parts = [];
      if (data.segments_fetched > 0) {
        parts.push(`${data.segments_fetched} fetched`);
      }
      if (data.chapters_embedded > 0) {
        parts.push(`${data.chapters_embedded} embedded`);
      }
      if (data.no_segments_available > 0) {
        parts.push(`${data.no_segments_available} no SB data`);
      }

      let message;
      if (parts.length > 0) {
        message = parts.join(', ');
        if (data.failed > 0) {
          message += ` (${data.failed} failed)`;
        }
      } else if (data.skipped_has_chapters > 0 || data.already_had_no_data > 0) {
        message = 'All videos already processed';
      } else {
        message = 'No videos needed processing';
      }

      const hasWarning = data.failed > 0;
      showNotification(message, hasWarning ? 'warning' : 'success');

      setShowSponsorblockModal(false);
      setShowRepairModal(false);
      setSponsorblockData(null);
    } catch (error) {
      showNotification('Failed to fix SponsorBlock chapters', 'error');
    } finally {
      setIsFixingSponsorblock(false);
    }
  };

  const handleCheckLowQuality = async () => {
    setIsCheckingQuality(true);
    setLowQualityData(null);
    setSelectedLowQualityVideos([]);
    try {
      const response = await fetch('/api/settings/low-quality-videos', { credentials: 'include' });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      setLowQualityData(data);

      if (data.count === 0) {
        showNotification('All videos are 1080p or higher!', 'success');
      }
    } catch (error) {
      showNotification(`Failed to scan videos: ${error.message}`, 'error');
    } finally {
      setIsCheckingQuality(false);
    }
  };

  const handleUpgradeVideos = async () => {
    if (selectedLowQualityVideos.length === 0) {
      showNotification('No videos selected', 'warning');
      return;
    }

    setIsUpgrading(true);
    try {
      const response = await fetch('/api/settings/upgrade-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: selectedLowQualityVideos }),
        credentials: 'include'
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      const message = `Queued ${data.upgraded} video${data.upgraded !== 1 ? 's' : ''} for upgrade`;
      showNotification(message, 'success');

      setShowLowQualityModal(false);
      setShowRepairModal(false);
      setSelectedLowQualityVideos([]);
      setLowQualityData(null);
    } catch (error) {
      showNotification('Failed to upgrade videos', 'error');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCutSponsorblockSegments = async () => {
    if (selectedSponsorblockCutVideos.length === 0) {
      showNotification('No videos selected', 'warning');
      return;
    }

    setIsCuttingSponsorblock(true);
    try {
      const response = await fetch('/api/settings/sponsorblock-cut-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_ids: selectedSponsorblockCutVideos }),
        credentials: 'include'
      });
      const data = await response.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      const parts = [];
      if (data.segments_cut > 0) {
        parts.push(`${data.segments_cut} cut`);
      }
      if (data.no_data > 0) {
        parts.push(`${data.no_data} no SB data`);
      }
      if (data.failed > 0) {
        parts.push(`${data.failed} failed`);
      }
      if (data.cancelled) {
        parts.push('cancelled');
      }

      const message = parts.length > 0 ? parts.join(', ') : 'No videos needed processing';
      const level = data.failed > 0 ? 'warning' : data.cancelled ? 'info' : 'success';
      showNotification(message, level);

      setShowSponsorblockCutModal(false);
      setShowRepairModal(false);
      setSelectedSponsorblockCutVideos([]);
      setSponsorblockCutData(null);
    } catch (error) {
      showNotification('Failed to cut SponsorBlock segments', 'error');
    } finally {
      setIsCuttingSponsorblock(false);
      queryClient.removeQueries({ queryKey: ['sponsorblock-cut-progress'] });
    }
  };

  const handleCancelSponsorblockCut = async () => {
    try {
      await fetch('/api/settings/sponsorblock-cut-cancel', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      // Ignore - the cut response will handle the cancellation result
    }
  };

  const openNotFoundModal = () => {
    setShowRepairModal(false);
    setShowNotFoundModal(true);
  };

  const openShrinkDBModal = () => {
    setShowRepairModal(false);
    setShowShrinkDBModal(true);
  };

  const openMetadataFixModal = () => {
    setShowRepairModal(false);
    setShowMetadataFixModal(true);
  };

  const openSponsorblockModal = () => {
    setShowRepairModal(false);
    setShowSponsorblockModal(true);
  };

  const openLowQualityModal = () => {
    setShowRepairModal(false);
    setShowLowQualityModal(true);
    // Automatically start scanning when modal opens
    handleCheckLowQuality();
  };

  const openSponsorblockCutModal = () => {
    setShowRepairModal(false);
    setShowSponsorblockCutModal(true);
    setSelectedSponsorblockCutVideos([]);
  };

  const closeAllModals = () => {
    setShowRepairModal(false);
    setShowNotFoundModal(false);
    setShowShrinkDBModal(false);
    setShowMetadataFixModal(false);
    setShowSponsorblockModal(false);
    setShowSponsorblockCutModal(false);
    setShowLowQualityModal(false);
  };

  return {
    // Modal visibility
    showRepairModal,
    setShowRepairModal,
    showNotFoundModal,
    setShowNotFoundModal,
    showShrinkDBModal,
    setShowShrinkDBModal,
    showMetadataFixModal,
    setShowMetadataFixModal,
    showSponsorblockModal,
    setShowSponsorblockModal,
    showLowQualityModal,
    setShowLowQualityModal,
    showSponsorblockCutModal,
    setShowSponsorblockCutModal,

    // Data
    repairData,
    missingMetadataData,
    sponsorblockData,
    sponsorblockCutData,
    selectedNotFoundVideos,
    setSelectedNotFoundVideos,
    selectedChannels,
    setSelectedChannels,
    lowQualityData,
    selectedLowQualityVideos,
    setSelectedLowQualityVideos,
    selectedSponsorblockCutVideos,
    setSelectedSponsorblockCutVideos,

    // Loading states
    isCheckingRepair,
    isRemoving,
    isFixingMetadata,
    isFixingSponsorblock,
    isCuttingSponsorblock,
    sponsorblockCutProgress,
    isCheckingQuality,
    isUpgrading,

    // Actions
    handleQueueRepair,
    handleRemoveNotFoundVideos,
    handlePurgeChannels,
    handleFixMetadata,
    handleFixSponsorblockChapters,
    handleCutSponsorblockSegments,
    handleCancelSponsorblockCut,
    handleCheckLowQuality,
    handleUpgradeVideos,

    // Modal navigation
    openNotFoundModal,
    openShrinkDBModal,
    openMetadataFixModal,
    openSponsorblockModal,
    openSponsorblockCutModal,
    openLowQualityModal,
    closeAllModals,

    // For MetadataFixModal
    hasApiKey
  };
}
