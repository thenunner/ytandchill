import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import {
  useScanImportFolder,
  useImportState,
  useResolveImportPending,
  useResetImport,
  useSmartIdentify,
  useExecuteSmartImport,
} from '../api/queries';
import LoadingSpinner from '../components/LoadingSpinner';
import { CheckmarkIcon } from '../components/icons';

export default function Import() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // Queries
  const { data: scanData, isLoading: scanLoading, refetch: refetchScan } = useScanImportFolder();
  const { data: stateData, refetch: refetchState } = useImportState();

  // Mutations
  const smartIdentify = useSmartIdentify();
  const executeSmartImport = useExecuteSmartImport();
  const resolvePending = useResolveImportPending();
  const resetImport = useResetImport();

  // Local state
  const [currentStep, setCurrentStep] = useState('setup'); // setup, identifying, review, importing, complete
  const [identifyResult, setIdentifyResult] = useState(null);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentPendingIdx, setCurrentPendingIdx] = useState(0);
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  // Start Smart Import - identifies videos directly without scanning channels
  const handleSmartImport = async () => {
    setCurrentStep('identifying');

    try {
      const result = await smartIdentify.mutateAsync();
      setIdentifyResult(result);

      if (result.pending && result.pending.length > 0) {
        // Some files need user selection
        setPendingMatches(result.pending);
        setCurrentPendingIdx(0);
        setCurrentStep('review');
      } else if (result.identified && result.identified.length > 0) {
        // All files identified - proceed to import
        setCurrentStep('importing');
        await executeSmartImport.mutateAsync(result.identified);
        await refetchState();
        setCurrentStep('complete');
      } else {
        // Nothing identified
        showNotification('No videos could be identified', 'warning');
        setCurrentStep('complete');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      setCurrentStep('setup');
    }
  };

  // Handle resolving a pending match (user selects video)
  const handleSelectMatch = async (skip = false) => {
    const pending = pendingMatches[currentPendingIdx];

    if (!skip && !selectedVideoId) {
      showNotification('Please select a video', 'error');
      return;
    }

    try {
      if (!skip) {
        // Find selected video and add to identified list
        const selectedVideo = pending.matches.find(m => m.id === selectedVideoId);
        if (selectedVideo) {
          const match = {
            file: pending.file,
            filename: pending.filename,
            video: selectedVideo,
            match_type: 'user_selected',
            channel_info: {
              channel_id: selectedVideo.channel_id,
              channel_title: selectedVideo.channel_title,
              channel_url: `https://youtube.com/channel/${selectedVideo.channel_id}`,
            },
          };

          // Add to identified and import immediately
          await executeSmartImport.mutateAsync([match]);
        }
      }

      // Move to next pending
      if (currentPendingIdx < pendingMatches.length - 1) {
        setCurrentPendingIdx(prev => prev + 1);
        setSelectedVideoId(null);
      } else {
        // All pending resolved
        await refetchState();

        // Import any remaining identified files
        if (identifyResult?.identified?.length > 0) {
          setCurrentStep('importing');
          await executeSmartImport.mutateAsync(identifyResult.identified);
        }

        setCurrentStep('complete');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Reset and start over
  const handleReset = async () => {
    await resetImport.mutateAsync();
    await refetchScan();
    setCurrentStep('setup');
    setIdentifyResult(null);
    setPendingMatches([]);
    setCurrentPendingIdx(0);
    setSelectedVideoId(null);
  };

  // View channels (navigate to channels tab)
  const handleViewChannels = () => {
    navigate('/');
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
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
          <p className="text-text-secondary text-sm mb-2">
            <strong>Tip:</strong> Name files with their YouTube video ID for instant matching:
          </p>
          <pre className="bg-dark-tertiary rounded p-3 text-left text-sm font-mono text-text-muted">
{`dQw4w9WgXcQ.mp4  (video ID)
My Video Title.mp4  (will search)`}
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

  // State: Import Complete
  if (currentStep === 'complete') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
            <CheckmarkIcon className="w-8 h-8 text-accent-text" strokeWidth={3} />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Import Complete</h2>
          <button
            onClick={handleViewChannels}
            className="btn btn-primary text-lg px-8 py-3 mt-4"
          >
            View Library
          </button>
        </div>

        {/* Summary */}
        {identifyResult && (
          <div className="space-y-4">
            {identifyResult.summary && (
              <div className="bg-dark-secondary border border-dark-border rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-accent-text">{identifyResult.summary.identified}</div>
                    <div className="text-sm text-text-secondary">Imported</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-400">{identifyResult.summary.pending}</div>
                    <div className="text-sm text-text-secondary">Resolved</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-text-muted">{identifyResult.summary.failed}</div>
                    <div className="text-sm text-text-secondary">Failed</div>
                  </div>
                </div>
              </div>
            )}

            {/* Failed files */}
            {identifyResult.failed?.length > 0 && (
              <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border">
                  <h3 className="font-semibold text-text-secondary">Not Found ({identifyResult.failed.length})</h3>
                </div>
                <div className="divide-y divide-dark-border max-h-48 overflow-y-auto">
                  {identifyResult.failed.map((item, idx) => (
                    <div key={idx} className="px-4 py-2 text-sm">
                      <div className="text-text-primary truncate">{item.filename}</div>
                      <div className="text-text-muted">{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Only show if there are failed files still in the folder */}
        {identifyResult?.failed?.length > 0 && (
          <div className="mt-6 text-center">
            <button onClick={handleReset} className="btn btn-secondary">
              Retry Failed Files
            </button>
          </div>
        )}
      </div>
    );
  }

  // State: Reviewing pending matches
  if (currentStep === 'review' && pendingMatches.length > 0) {
    const pending = pendingMatches[currentPendingIdx];

    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-text-primary">Select Correct Video</h2>
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
          {pending.local_duration && (
            <div className="text-sm text-text-muted mt-1">
              Duration: {formatDuration(pending.local_duration)}
            </div>
          )}
        </div>

        <div className="space-y-2 mb-6">
          <div className="text-sm text-text-secondary mb-2">
            {pending.match_type === 'multiple_duration'
              ? 'Multiple videos match the duration:'
              : 'Search results (select best match):'
            }
          </div>
          {pending.matches.map((video) => (
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
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedVideoId === video.id ? 'border-accent bg-accent' : 'border-text-secondary'
                }`}>
                  {selectedVideoId === video.id && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary truncate">{video.title}</div>
                  <div className="text-text-muted text-sm flex items-center gap-2">
                    <span>{formatDuration(video.duration)}</span>
                    {video.duration_match && (
                      <span className="text-accent-text text-xs bg-accent/20 px-1.5 py-0.5 rounded">Duration Match</span>
                    )}
                    <span className="text-text-secondary">• {video.channel_title}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleSelectMatch(true)}
            className="btn btn-secondary flex-1"
          >
            Skip
          </button>
          <button
            onClick={() => handleSelectMatch(false)}
            disabled={!selectedVideoId}
            className="btn btn-primary flex-1 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    );
  }

  // State: Identifying / Importing progress
  if (currentStep === 'identifying' || currentStep === 'importing') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-accent border-t-transparent rounded-full mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            {currentStep === 'identifying' ? 'Identifying Videos...' : 'Importing Videos...'}
          </h2>
          <p className="text-text-secondary">
            {currentStep === 'identifying'
              ? 'Searching YouTube to match your files'
              : 'Organizing files into your library'
            }
          </p>
        </div>
      </div>
    );
  }

  // State: Setup - Files found, ready to import
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Import Videos</h1>
        <p className="text-text-secondary">
          Found <span className="text-accent-text font-semibold">{scanData.count}</span> video file{scanData.count !== 1 ? 's' : ''} to import
        </p>
      </div>

      {/* File List */}
      <div className="bg-dark-secondary border border-dark-border rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-dark-border">
          <h3 className="font-semibold text-text-primary">Files</h3>
        </div>
        <div className="divide-y divide-dark-border max-h-64 overflow-y-auto">
          {scanData.files?.slice(0, 20).map((file, idx) => (
            <div key={idx} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-text-primary truncate">{file.name}</div>
                <div className="text-text-muted text-sm">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            </div>
          ))}
          {scanData.files?.length > 20 && (
            <div className="px-4 py-3 text-center text-text-muted text-sm">
              ...and {scanData.files.length - 20} more files
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-dark-tertiary border border-dark-border rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-text-primary mb-2">How Smart Import Works</h3>
        <ul className="text-sm text-text-secondary space-y-1">
          <li>• Files named with video ID (11 chars) are matched instantly</li>
          <li>• Other files are searched on YouTube by title</li>
          <li>• Duration is used to verify matches</li>
          <li>• You'll confirm any uncertain matches</li>
        </ul>
      </div>

      {/* Import Button */}
      <button
        onClick={handleSmartImport}
        disabled={smartIdentify.isLoading}
        className="btn btn-primary w-full py-3 text-lg disabled:opacity-50"
      >
        {smartIdentify.isLoading ? 'Starting...' : 'Start Smart Import'}
      </button>

      {/* Info */}
      <p className="text-center text-text-muted text-sm mt-4">
        No need to specify channels - videos are identified automatically
      </p>
    </div>
  );
}
