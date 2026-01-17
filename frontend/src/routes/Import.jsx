import { useState, useEffect, useRef } from 'react';
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

// Supported video extensions (browser-playable formats only, must match backend)
const VIDEO_EXTENSIONS = /\.(mp4|webm|m4v)$/i;

// Max file size (must match backend MAX_CONTENT_LENGTH)
const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]); // {name, size, status: 'pending'|'uploading'|'done'|'error', progress}
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [currentUploadProgress, setCurrentUploadProgress] = useState(0);
  const abortControllerRef = useRef(null);

  // Start Smart Import - identifies videos directly without scanning channels
  // mode: 'auto' = auto-import confident matches, 'manual' = review everything
  const handleSmartImport = async (mode = 'auto') => {
    setCurrentStep('identifying');

    try {
      const result = await smartIdentify.mutateAsync({ mode });
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

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const allFiles = Array.from(e.dataTransfer.files);

    // Filter by extension
    const videoFiles = allFiles.filter(f => VIDEO_EXTENSIONS.test(f.name));
    const unsupportedFiles = allFiles.filter(f => !VIDEO_EXTENSIONS.test(f.name));

    if (unsupportedFiles.length > 0) {
      const names = unsupportedFiles.map(f => f.name).join(', ');
      showNotification(`${unsupportedFiles.length} file(s) skipped (unsupported format): ${names}. Supported: .mp4, .webm, .m4v`, 'warning');
    }

    if (videoFiles.length === 0) {
      return;
    }

    // Check for oversized files
    const oversizedFiles = videoFiles.filter(f => f.size > MAX_FILE_SIZE);
    const droppedFiles = videoFiles.filter(f => f.size <= MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map(f => f.name).join(', ');
      showNotification(`${oversizedFiles.length} file(s) exceed 50GB limit and will be skipped: ${names}`, 'warning');
    }

    if (droppedFiles.length === 0) {
      showNotification('All files exceed the 50GB size limit', 'error');
      return;
    }

    // Initialize upload state
    const filesWithStatus = droppedFiles.map(f => ({
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending',
      progress: 0,
    }));

    setUploadFiles(filesWithStatus);
    setCurrentUploadIndex(0);
    setCurrentUploadProgress(0);
    setIsUploading(true);

    // Upload files sequentially
    for (let i = 0; i < filesWithStatus.length; i++) {
      const fileData = filesWithStatus[i];

      // Update current file to uploading
      setCurrentUploadIndex(i);
      setCurrentUploadProgress(0);
      setUploadFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'uploading' } : f
      ));

      try {
        await uploadFile(fileData.file, (progress) => {
          setCurrentUploadProgress(progress);
        });

        // Mark as done
        setUploadFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'done', progress: 100 } : f
        ));
      } catch (err) {
        // Mark as error
        setUploadFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: err.message } : f
        ));
      }
    }

    // Upload complete - refresh scan
    setIsUploading(false);
    const successCount = filesWithStatus.filter((_, i) => {
      // Check final status - we need to get it from the state
      return true; // Will be updated by the state
    }).length;

    showNotification(`Upload complete`, 'success');
    refetchScan();
  };

  // Upload a single file with progress tracking
  const uploadFile = (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Upload failed'));
            }
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        } else {
          try {
            const response = JSON.parse(xhr.responseText);
            reject(new Error(response.error || `HTTP ${xhr.status}`));
          } catch (e) {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', '/api/import/upload');
      xhr.send(formData);
    });
  };

  if (scanLoading) {
    return <LoadingSpinner />;
  }

  // State: Uploading files
  if (isUploading) {
    const completed = uploadFiles.filter(f => f.status === 'done').length;
    const failed = uploadFiles.filter(f => f.status === 'error').length;
    const total = uploadFiles.length;
    const totalBytes = uploadFiles.reduce((sum, f) => sum + f.size, 0);
    const completedBytes = uploadFiles.reduce((sum, f, idx) => {
      if (f.status === 'done') return sum + f.size;
      if (f.status === 'uploading') return sum + (f.size * currentUploadProgress / 100);
      return sum;
    }, 0);
    const overallPercent = Math.round((completedBytes / totalBytes) * 100);

    const currentFile = uploadFiles[currentUploadIndex];
    const recentCompleted = uploadFiles.filter(f => f.status === 'done').slice(-4);
    const remaining = total - completed - failed - 1;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-md">
          {/* Header - Overall Progress */}
          <div className="text-center mb-6">
            <div className="text-4xl font-mono font-bold text-text-primary mb-1">
              {completed + failed}<span className="text-text-muted">/{total}</span>
            </div>
            <div className="text-sm text-text-secondary">
              {formatBytes(completedBytes)} of {formatBytes(totalBytes)}
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="h-1 bg-dark-tertiary rounded-full mb-8 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>

          {/* Current File - Prominent */}
          {currentFile && currentFile.status === 'uploading' && (
            <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-accent-text uppercase tracking-wider">
                  Uploading
                </span>
                <span className="text-xs font-mono text-text-muted">
                  {currentUploadProgress}%
                </span>
              </div>
              <div className="text-text-primary font-medium truncate mb-3">
                {currentFile.name}
              </div>
              <div className="h-2 bg-dark-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-150"
                  style={{ width: `${currentUploadProgress}%` }}
                />
              </div>
              <div className="text-xs text-text-muted mt-2 text-right">
                {formatBytes(currentFile.size)}
              </div>
            </div>
          )}

          {/* Recent Completions - Compact Rolling List */}
          {recentCompleted.length > 0 && (
            <div className="space-y-1 mb-4">
              {recentCompleted.map((file, idx) => (
                <div
                  key={file.name + idx}
                  className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-dark-tertiary/50"
                >
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-text-secondary truncate flex-1">{file.name}</span>
                  <span className="text-text-muted text-xs font-mono">{formatBytes(file.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Queue Status */}
          {remaining > 0 && (
            <div className="text-center text-sm text-text-muted">
              {remaining} file{remaining !== 1 ? 's' : ''} in queue
            </div>
          )}

          {/* Failed Files Warning */}
          {failed > 0 && (
            <div className="mt-4 text-center text-sm text-red-400">
              {failed} file{failed !== 1 ? 's' : ''} failed
            </div>
          )}
        </div>
      </div>
    );
  }

  // State 1: No files in import folder - Show drag and drop zone
  if (!scanData?.count || scanData.count === 0) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center min-h-[60vh] text-center px-4 mx-4 my-4 border-2 border-dashed rounded-xl transition-all duration-200 ${
          isDragging
            ? 'border-accent bg-accent/10 scale-[1.02]'
            : 'border-dark-border hover:border-dark-border-light'
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-primary/90 rounded-xl z-10">
            <div className="text-center">
              <svg className="w-16 h-16 text-accent mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="text-xl font-semibold text-accent-text">Drop files to upload</div>
              <div className="text-sm text-text-secondary mt-2">.mp4, .webm, .m4v (max 50 GB)</div>
            </div>
          </div>
        )}

        {/* Default content */}
        <svg className="w-16 h-16 text-text-muted mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Drag and drop video files</h2>
        <p className="text-text-secondary mb-4">
          or copy files to:
        </p>
        <code className="bg-dark-tertiary px-4 py-2 rounded-lg text-accent-text font-mono mb-6">
          {scanData?.import_path || 'downloads/imports/'}
        </code>
        <div className="bg-dark-secondary border border-dark-border rounded-lg p-4 max-w-xl">
          <p className="text-text-secondary text-sm mb-3">
            <strong>File naming tips:</strong>
          </p>
          <pre className="bg-dark-tertiary rounded p-3 text-left text-sm font-mono text-text-muted">
{`dQw4w9WgXcQ.mp4      ← YouTube video ID (instant match)
My Video Title.mp4   ← Exact video title (searches YouTube)`}
          </pre>
          <p className="text-text-secondary text-xs mt-3">
            Files named with the 11-character YouTube ID match instantly. Other names are searched on YouTube.
          </p>
          <p className="text-text-muted text-xs mt-2">
            Max file size: 50 GB
          </p>
        </div>
        <button
          onClick={() => refetchScan()}
          className="mt-6 btn btn-secondary"
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
          <li>• Duration + channel from channels.txt used to verify matches</li>
        </ul>
      </div>

      {/* Import Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => handleSmartImport('auto')}
          disabled={smartIdentify.isLoading}
          className="btn btn-primary flex-1 py-3 text-lg disabled:opacity-50"
        >
          {smartIdentify.isLoading ? 'Starting...' : 'Auto Import'}
        </button>
        <button
          onClick={() => handleSmartImport('manual')}
          disabled={smartIdentify.isLoading}
          className="btn btn-secondary flex-1 py-3 text-lg disabled:opacity-50"
        >
          Manual Import
        </button>
      </div>

      {/* Info */}
      <p className="text-center text-text-muted text-sm mt-4">
        <strong>Auto:</strong> Imports confident matches (title + duration).
        <strong> Manual:</strong> Review every match before importing.
      </p>
    </div>
  );
}
