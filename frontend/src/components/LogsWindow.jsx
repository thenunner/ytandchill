import { useState, useRef, useEffect } from 'react';

export default function LogsWindow({ logsData, onClose }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const logEndRef = useRef(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsData]);

  const handleMouseDown = (e) => {
    // Only start drag if clicking on header
    if (e.target.closest('.logs-window-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <div
      className="fixed bg-dark-secondary border border-dark-border rounded-lg shadow-2xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '700px',
        maxHeight: '500px',
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header - Draggable */}
      <div className="logs-window-header flex items-center justify-between bg-dark-tertiary px-4 py-3 rounded-t-lg cursor-grab active:cursor-grabbing border-b border-dark-border">
        <div className="flex items-center gap-2 text-text-primary font-semibold">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          Application Logs
          {logsData?.total_lines && (
            <span className="text-xs text-text-muted ml-2">
              Showing last 500 of {logsData.total_lines} lines
            </span>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-red-400 transition-colors p-1 hover:bg-dark-hover rounded"
          title="Close and return to Settings"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Logs Content */}
      <div className="bg-dark-tertiary p-3 overflow-auto font-mono text-xs rounded-b-lg" style={{ maxHeight: '420px' }}>
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
  );
}
