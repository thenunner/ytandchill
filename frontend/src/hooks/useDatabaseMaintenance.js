import { useState } from 'react';

export function useDatabaseMaintenance(showNotification, hasApiKey) {
  // Modal visibility
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [showShrinkDBModal, setShowShrinkDBModal] = useState(false);
  const [showMetadataFixModal, setShowMetadataFixModal] = useState(false);

  // Data
  const [repairData, setRepairData] = useState(null);
  const [missingMetadataData, setMissingMetadataData] = useState(null);
  const [selectedNotFoundVideos, setSelectedNotFoundVideos] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);

  // Loading states
  const [isCheckingRepair, setIsCheckingRepair] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isFixingMetadata, setIsFixingMetadata] = useState(false);

  const handleQueueRepair = async () => {
    setIsCheckingRepair(true);
    try {
      const [repairResponse, metadataResponse] = await Promise.all([
        fetch('/api/queue/check-orphaned', { credentials: 'include' }),
        fetch('/api/settings/missing-metadata', { credentials: 'include' })
      ]);

      const data = await repairResponse.json();
      const metadataData = await metadataResponse.json();

      if (data.error) {
        showNotification(data.error, 'error');
        return;
      }

      setRepairData(data);
      setMissingMetadataData(metadataData);
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

  const closeAllModals = () => {
    setShowRepairModal(false);
    setShowNotFoundModal(false);
    setShowShrinkDBModal(false);
    setShowMetadataFixModal(false);
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

    // Data
    repairData,
    missingMetadataData,
    selectedNotFoundVideos,
    setSelectedNotFoundVideos,
    selectedChannels,
    setSelectedChannels,

    // Loading states
    isCheckingRepair,
    isRemoving,
    isFixingMetadata,

    // Actions
    handleQueueRepair,
    handleRemoveNotFoundVideos,
    handlePurgeChannels,
    handleFixMetadata,

    // Modal navigation
    openNotFoundModal,
    openShrinkDBModal,
    openMetadataFixModal,
    closeAllModals,

    // For MetadataFixModal
    hasApiKey
  };
}
