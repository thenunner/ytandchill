import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import {
  useScanImportFolder,
  useImportState,
  useAddImportChannel,
  useSetImportChannels,
  useFetchImportChannel,
  useMatchImportFiles,
  useExecuteImport,
  useResolveImportPending,
  useSkipRemainingImport,
  useResetImport,
} from '../api/queries';
import api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import { PlusIcon, CheckmarkIcon, TrashIcon } from '../components/icons';

export default function Import() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // Queries
  const { data: scanData, isLoading: scanLoading, refetch: refetchScan } = useScanImportFolder();
  const { data: stateData, refetch: refetchState } = useImportState();

  // Mutations
  const addChannel = useAddImportChannel();
  const setChannels = useSetImportChannels();
  const fetchChannel = useFetchImportChannel();
  const matchFiles = useMatchImportFiles();
  const executeImport = useExecuteImport();
  const resolvePending = useResolveImportPending();
  const skipRemaining = useSkipRemainingImport();
  const resetImport = useResetImport();

  // Local state
  const [channelInput, setChannelInput] = useState('');
  const [importMode, setImportMode] = useState(null); // 'auto' or 'manual'
  const [currentStep, setCurrentStep] = useState('setup'); // setup, fetching, matching, importing, resolving, complete
  const [currentChannelIdx, setCurrentChannelIdx] = useState(0);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentPendingIdx, setCurrentPendingIdx] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [allMatches, setAllMatches] = useState([]); // All single matches across channels
  const [manualFileIdx, setManualFileIdx] = useState(0);
  const [manualMatches, setManualMatches] = useState([]); // Matches for current file in manual mode
  const [csvInitialized, setCsvInitialized] = useState(false); // Prevent infinite loop

  // Initialize with CSV channels if available (only once)
  useEffect(() => {
    if (
      !csvInitialized &&
      scanData?.csv_found &&
      scanData?.csv_channels?.length > 0 &&
      stateData?.channels?.length === 0
    ) {
      setCsvInitialized(true);
      setChannels.mutate(scanData.csv_channels);
    }
  }, [csvInitialized, scanData?.csv_found, scanData?.csv_channels?.length, stateData?.channels?.length]);

  // Handle adding a channel
  const handleAddChannel = async () => {
    if (!channelInput.trim()) return;

    try {
      await addChannel.mutateAsync(channelInput.trim());
      setChannelInput('');
      showNotification('Channel added', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to add channel', 'error');
    }
  };

  // Start Auto Import
  const handleAutoImport = async () => {
    setImportMode('auto');
    setCurrentStep('fetching');
    setCurrentChannelIdx(0);
    setAllMatches([]);

    // Process each channel
    for (let i = 0; i < stateData.channels.length; i++) {
      setCurrentChannelIdx(i);

      try {
        // Fetch channel metadata
        await fetchChannel.mutateAsync(i);
        await refetchState();

        // Match files
        setCurrentStep('matching');
        const matchResult = await matchFiles.mutateAsync(i);
        await refetchState();

        // Collect single matches
        if (matchResult.matches && matchResult.matches.length > 0) {
          setAllMatches(prev => [...prev, ...matchResult.matches]);
        }

        // If there are pending matches, pause and show resolution UI
        if (matchResult.pending && matchResult.pending.length > 0) {
          setPendingMatches(matchResult.pending);
          setCurrentPendingIdx(0);
          setCurrentStep('resolving');
          return; // Exit loop - will continue after resolution
        }
      } catch (error) {
        showNotification(`Error processing channel: ${error.message}`, 'error');
      }
    }

    // All channels processed - execute imports
    await executeAutoImport();
  };

  // Execute auto import with collected matches
  const executeAutoImport = async () => {
    setCurrentStep('importing');

    if (allMatches.length > 0) {
      try {
        await executeImport.mutateAsync(allMatches);
        await refetchState();
      } catch (error) {
        showNotification(`Import error: ${error.message}`, 'error');
      }
    }

    // Mark remaining as skipped
    await skipRemaining.mutateAsync();
    await refetchState();

    setCurrentStep('complete');
  };

  // Handle resolving a pending match
  const handleResolvePending = async (skip = false) => {
    const pending = pendingMatches[currentPendingIdx];

    try {
      await resolvePending.mutateAsync({
        file: pending.file,
        videoId: skip ? null : selectedVideoId,
        skip,
      });
      await refetchState();

      // Move to next pending
      if (currentPendingIdx < pendingMatches.length - 1) {
        setCurrentPendingIdx(prev => prev + 1);
        setSelectedVideoId(null);
      } else {
        // All pending resolved for this channel
        setPendingMatches([]);
        setCurrentPendingIdx(0);

        // Continue with remaining channels if any
        if (currentChannelIdx < stateData.channels.length - 1) {
          const nextIdx = currentChannelIdx + 1;
          setCurrentChannelIdx(nextIdx);
          setCurrentStep('fetching');

          // Process remaining channels
          for (let i = nextIdx; i < stateData.channels.length; i++) {
            setCurrentChannelIdx(i);

            try {
              await fetchChannel.mutateAsync(i);
              await refetchState();

              setCurrentStep('matching');
              const matchResult = await matchFiles.mutateAsync(i);
              await refetchState();

              if (matchResult.matches && matchResult.matches.length > 0) {
                setAllMatches(prev => [...prev, ...matchResult.matches]);
              }

              if (matchResult.pending && matchResult.pending.length > 0) {
                setPendingMatches(matchResult.pending);
                setCurrentPendingIdx(0);
                setCurrentStep('resolving');
                return;
              }
            } catch (error) {
              showNotification(`Error processing channel: ${error.message}`, 'error');
            }
          }

          // All channels done
          await executeAutoImport();
        } else {
          // All channels done
          await executeAutoImport();
        }
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Start Manual Import
  const handleManualImport = async () => {
    setImportMode('manual');
    setCurrentStep('fetching');
    setCurrentChannelIdx(0);

    // Fetch all channel metadata first
    for (let i = 0; i < stateData.channels.length; i++) {
      setCurrentChannelIdx(i);
      try {
        await fetchChannel.mutateAsync(i);
        await refetchState();
      } catch (error) {
        showNotification(`Error fetching channel ${i + 1}: ${error.message}`, 'error');
      }
    }

    // Start manual matching
    setCurrentStep('manual');
    setManualFileIdx(0);
    await fetchManualMatches(0);
  };

  // Fetch matches for a file in manual mode
  const fetchManualMatches = async (fileIdx) => {
    // Get all channel videos and find matches for this file
    const file = stateData?.files?.[fileIdx];
    if (!file) {
      setCurrentStep('complete');
      return;
    }

    // Match against all channels
    const matches = [];
    for (let i = 0; i < stateData.channels.length; i++) {
      try {
        const result = await matchFiles.mutateAsync(i);
        await refetchState();

        // Find matches for this specific file
        if (result.matches) {
          for (const match of result.matches) {
            if (match.file === file.path || match.filename === file.name) {
              matches.push(match);
            }
          }
        }
        if (result.pending) {
          for (const pending of result.pending) {
            if (pending.file === file.path || pending.filename === file.name) {
              matches.push({
                ...pending,
                isMultiple: true,
              });
            }
          }
        }
      } catch (error) {
        // Continue with other channels
      }
    }

    setManualMatches(matches);
  };

  // Handle manual import decision
  const handleManualDecision = async (match, skip = false) => {
    if (skip) {
      // Skip this file
      await resolvePending.mutateAsync({
        file: match.file,
        videoId: null,
        skip: true,
      });
    } else if (match.isMultiple) {
      // Need to select from multiple
      if (!selectedVideoId) {
        showNotification('Please select a video', 'error');
        return;
      }
      await resolvePending.mutateAsync({
        file: match.file,
        videoId: selectedVideoId,
        skip: false,
      });
    } else {
      // Single match - import directly
      await executeImport.mutateAsync([match]);
    }

    await refetchState();

    // Move to next file
    const nextIdx = manualFileIdx + 1;
    if (nextIdx < (stateData?.file_count || 0)) {
      setManualFileIdx(nextIdx);
      setSelectedVideoId(null);
      await fetchManualMatches(nextIdx);
    } else {
      // All files processed
      await skipRemaining.mutateAsync();
      await refetchState();
      setCurrentStep('complete');
    }
  };

  // Reset and start over
  const handleReset = async () => {
    await resetImport.mutateAsync();
    await refetchScan();
    setCurrentStep('setup');
    setImportMode(null);
    setAllMatches([]);
    setPendingMatches([]);
    setCsvInitialized(false); // Allow CSV re-initialization
  };

  // View channels (navigate to channels tab)
  const handleViewChannels = () => {
    navigate('/');
  };

  if (scanLoading) {
    return <LoadingSpinner />;
  }

  // State 1: No files in import folder
  if (!scanData?.count || scanData.count === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <svg className="w-16 h-16 text-text-muted mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <h2 className="text-xl font-semibold text-text-primary mb-4">No files to import</h2>
        <p className="text-text-secondary mb-2">
          Copy <span className="text-text-primary font-mono">.mp4</span>, <span className="text-text-primary font-mono">.webm</span>, or <span className="text-text-primary font-mono">.mkv</span> files to:
        </p>
        <code className="bg-dark-tertiary px-4 py-2 rounded-lg text-accent-text font-mono mb-6">
          {scanData?.import_path || 'downloads/imports/'}
        </code>
        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 max-w-md">
          <p className="text-text-secondary text-sm mb-2">For multiple channels, include a <span className="text-text-primary font-mono">channels.csv</span>:</p>
          <pre className="bg-dark-tertiary rounded p-3 text-left text-sm font-mono text-text-muted">
{`https://youtube.com/@channel1
https://youtube.com/@channel2
https://youtube.com/@channel3`}
          </pre>
        </div>
        <button
          onClick={() => refetchScan()}
          className="mt-6 btn btn-primary"
        >
          Refresh
        </button>
      </div>
    );
  }

  // State 5: Import Complete
  if (currentStep === 'complete') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
            <CheckmarkIcon className="w-8 h-8 text-accent-text" strokeWidth={3} />
          </div>
          <button
            onClick={handleViewChannels}
            className="btn btn-primary text-lg px-8 py-3"
          >
            Import Complete - View Channels
          </button>
        </div>

        {/* Summary Table */}
        {stateData?.imported?.length > 0 && (
          <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-dark-border">
              <h3 className="font-semibold text-text-primary">Imported ({stateData.imported.length})</h3>
            </div>
            <div className="divide-y divide-dark-border max-h-64 overflow-y-auto">
              {Object.entries(
                stateData.imported.reduce((acc, item) => {
                  const ch = item.channel || 'Unknown';
                  if (!acc[ch]) acc[ch] = { count: 0, titleMatch: 0, idMatch: 0 };
                  acc[ch].count++;
                  if (item.match_type === 'id') acc[ch].idMatch++;
                  else acc[ch].titleMatch++;
                  return acc;
                }, {})
              ).map(([channel, stats]) => (
                <div key={channel} className="px-4 py-3 flex justify-between items-center">
                  <span className="text-text-primary">{channel}</span>
                  <span className="text-text-secondary text-sm">
                    {stats.count} imported ({stats.titleMatch} title, {stats.idMatch} ID)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skipped Files */}
        {stateData?.skipped?.length > 0 && (
          <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-border">
              <h3 className="font-semibold text-text-secondary">Skipped ({stateData.skipped.length})</h3>
            </div>
            <div className="divide-y divide-dark-border max-h-48 overflow-y-auto">
              {stateData.skipped.map((item, idx) => (
                <div key={idx} className="px-4 py-2 text-sm">
                  <div className="text-text-primary truncate">{item.filename}</div>
                  <div className="text-text-muted">{item.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button onClick={handleReset} className="btn btn-secondary">
            Import More Files
          </button>
        </div>
      </div>
    );
  }

  // State 4: Resolving pending matches (multiple matches)
  if (currentStep === 'resolving' && pendingMatches.length > 0) {
    const pending = pendingMatches[currentPendingIdx];

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-text-primary">Multiple Matches Found</h2>
            <span className="text-text-secondary text-sm">
              {currentPendingIdx + 1} of {pendingMatches.length}
            </span>
          </div>
          <div className="w-full bg-dark-tertiary rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all"
              style={{ width: `${((currentPendingIdx + 1) / pendingMatches.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-6">
          <div className="text-sm text-text-secondary mb-1">File:</div>
          <div className="text-text-primary font-medium truncate">{pending.filename}</div>
        </div>

        <div className="space-y-2 mb-6">
          <div className="text-sm text-text-secondary mb-2">Select the correct video:</div>
          {pending.matches.map((video, idx) => (
            <button
              key={video.id}
              onClick={() => setSelectedVideoId(video.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedVideoId === video.id
                  ? 'border-accent bg-accent/10'
                  : 'border-dark-border bg-dark-tertiary hover:border-dark-border-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedVideoId === video.id ? 'border-accent bg-accent' : 'border-text-secondary'
                }`}>
                  {selectedVideoId === video.id && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary truncate">{video.title}</div>
                  <div className="text-text-muted text-sm">
                    {video.duration ? `${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, '0')}` : 'Unknown duration'}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleResolvePending(true)}
            className="btn btn-secondary flex-1"
          >
            Skip
          </button>
          <button
            onClick={() => handleResolvePending(false)}
            disabled={!selectedVideoId}
            className="btn btn-primary flex-1 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    );
  }

  // State 4: Fetching/Matching/Importing progress
  if (currentStep === 'fetching' || currentStep === 'matching' || currentStep === 'importing') {
    const channel = stateData?.channels?.[currentChannelIdx];
    const progress = stateData?.channels?.length
      ? ((currentChannelIdx + 1) / stateData.channels.length) * 100
      : 0;

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            {importMode === 'auto' ? 'Auto Import in Progress' : 'Processing Channels'}
          </h2>
          <p className="text-text-secondary">
            Channel {currentChannelIdx + 1} of {stateData?.channels?.length || 0}
          </p>
        </div>

        <div className="mb-8">
          <div className="w-full bg-dark-tertiary rounded-full h-3 mb-2">
            <div
              className="bg-accent h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center text-text-secondary text-sm">
            {currentStep === 'fetching' && 'Fetching channel metadata...'}
            {currentStep === 'matching' && 'Matching files...'}
            {currentStep === 'importing' && 'Importing files...'}
          </div>
        </div>

        {channel && (
          <div className="bg-dark-secondary border border-dark-border rounded-lg p-4">
            <div className="text-text-primary font-medium mb-2">
              {channel.channel_info?.channel_title || channel.url}
            </div>
            {channel.video_count > 0 && (
              <div className="text-text-secondary text-sm">
                {channel.video_count} videos in channel
              </div>
            )}
          </div>
        )}

        {stateData?.imported?.length > 0 && (
          <div className="mt-4 text-center text-text-secondary">
            {stateData.imported.length} files imported so far
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mt-8">
          <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full" />
          <span className="text-text-secondary">Processing...</span>
        </div>
      </div>
    );
  }

  // State 2 & 3: Setup - Files found, configure channels
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Import Videos</h1>
        <p className="text-text-secondary">
          Found <span className="text-accent-text font-semibold">{scanData.count}</span> video files in import folder
        </p>
      </div>

      {/* CSV Notice */}
      {scanData.csv_found && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-accent-text font-medium mb-1">
            <CheckmarkIcon className="w-5 h-5" />
            channels.csv found
          </div>
          <p className="text-text-secondary text-sm">
            {scanData.csv_channels.length} channels loaded from CSV
          </p>
        </div>
      )}

      {/* Add Channel Input */}
      {(!stateData?.channels?.length || stateData.channels.length === 0) && !scanData.csv_found && (
        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-6">
          <p className="text-text-secondary mb-4">
            No channels.csv found. Enter channel URLs to match videos:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()}
              placeholder="https://youtube.com/@..."
              className="input flex-1"
            />
            <button
              onClick={handleAddChannel}
              disabled={!channelInput.trim() || addChannel.isLoading}
              className="btn btn-primary"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Channel List */}
      {stateData?.channels?.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-text-primary">
              Channels ({stateData.channels.length})
            </h3>
            {!scanData.csv_found && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()}
                  placeholder="Add another channel..."
                  className="input w-64 text-sm"
                />
                <button
                  onClick={handleAddChannel}
                  disabled={!channelInput.trim()}
                  className="btn btn-secondary btn-sm"
                >
                  <PlusIcon />
                </button>
              </div>
            )}
          </div>

          <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">URL</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-text-secondary">Channel Name</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {stateData.channels.slice(0, 10).map((channel, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-text-primary text-sm truncate max-w-xs">
                      {channel.url}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-sm">
                      {channel.channel_info?.channel_title || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {channel.status === 'ready' ? (
                        <span className="text-accent-text text-sm">Ready</span>
                      ) : channel.status === 'fetching' ? (
                        <span className="text-yellow-400 text-sm">Fetching...</span>
                      ) : channel.status === 'error' ? (
                        <span className="text-red-400 text-sm">Error</span>
                      ) : (
                        <span className="text-text-muted text-sm">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stateData.channels.length > 10 && (
              <div className="px-4 py-3 text-center text-text-muted text-sm border-t border-dark-border">
                ...and {stateData.channels.length - 10} more channels
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Buttons */}
      {stateData?.channels?.length > 0 && (
        <div className="flex gap-4">
          <button
            onClick={handleManualImport}
            disabled={fetchChannel.isLoading}
            className="btn btn-secondary flex-1 py-3"
          >
            Import Manual
          </button>
          <button
            onClick={handleAutoImport}
            disabled={fetchChannel.isLoading}
            className="btn btn-primary flex-1 py-3"
          >
            Import Auto
          </button>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 text-center text-text-muted text-sm">
        <p><strong>Auto:</strong> Automatically imports single matches, pauses only for multiple matches</p>
        <p><strong>Manual:</strong> Confirm each file before importing</p>
      </div>
    </div>
  );
}
