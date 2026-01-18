import { useState } from 'react';

// Platform instructions
const platformInstructions = {
  docker: {
    name: 'Docker',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.119a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
      </svg>
    ),
    steps: [
      'Pull the latest image:',
      <code key="cmd" className="block mt-1 bg-dark-primary px-3 py-2 rounded text-sm font-mono">docker pull thenunner/ytandchill:latest</code>,
      'Restart your container with the new image'
    ]
  },
  windows: {
    name: 'Windows',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
      </svg>
    ),
    steps: [
      'Run the launcher script:',
      <code key="cmd" className="block mt-1 bg-dark-primary px-3 py-2 rounded text-sm font-mono">windows-start.bat</code>,
      'Select option [2] Update from the menu'
    ]
  },
  linux: {
    name: 'Linux / macOS',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.168 1.132.082 1.734.513.105.937.402 1.09.7.264-.524.293-1.471.143-2.336-.149-.867-.478-1.667-.795-2.067-.36-.467-.815-.835-1.285-.835-.376-.266-.4-.537.075-.537.627 0 1.274.468 1.67 1.068.368.601.6 1.336.667 2.134.07.066.136.002.162-.135.09-.47.101-1.003.004-1.537-.09-.535-.316-1.001-.616-1.335-.297-.335-.718-.535-1.197-.535-.147 0-.307.031-.48.089-.06-.066-.127-.142-.189-.2-.062-.059-.116-.117-.175-.175.327-.066.602-.133.878-.202.32-.075.64-.2.961-.399.312-.2.556-.468.687-.869.101-.335.093-.736-.076-1.137-.052-.067-.098-.135-.175-.202.068-.068.133-.002.198.132z"/>
      </svg>
    ),
    steps: [
      'Run the launcher script:',
      <code key="cmd" className="block mt-1 bg-dark-primary px-3 py-2 rounded text-sm font-mono">./linux.sh</code>,
      'Select option [2] Update from the menu'
    ]
  }
};

export default function UpdateModal({ isOpen, onClose, currentVersion, latestVersion, serverPlatform = 'docker' }) {
  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);

  if (!isOpen) return null;

  // Use server-detected platform (docker, windows, or linux)
  const detectedPlatform = serverPlatform;
  const primaryPlatform = platformInstructions[detectedPlatform] || platformInstructions.docker;
  const otherPlatforms = Object.entries(platformInstructions).filter(([key]) => key !== detectedPlatform);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-text-primary">Update Available</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Version Comparison */}
        <div className="bg-dark-tertiary rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-4 text-lg">
            <span className="text-text-secondary font-mono">v{currentVersion}</span>
            <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span className="text-accent font-mono font-bold">v{latestVersion}</span>
          </div>
        </div>

        {/* Primary Platform Instructions */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent">{primaryPlatform.icon}</span>
            <h3 className="font-semibold text-text-primary">{primaryPlatform.name}</h3>
            <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Detected</span>
          </div>
          <ol className="space-y-2 text-sm text-text-secondary">
            {primaryPlatform.steps.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                {typeof step === 'string' ? (
                  <>
                    <span className="text-text-muted">{idx + 1}.</span>
                    <span>{step}</span>
                  </>
                ) : (
                  <div className="w-full pl-5">{step}</div>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Other Platforms Toggle */}
        <button
          onClick={() => setShowOtherPlatforms(!showOtherPlatforms)}
          className="w-full flex items-center justify-between py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>Other platforms</span>
          <svg
            className={`w-4 h-4 transition-transform ${showOtherPlatforms ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {/* Other Platforms Content */}
        {showOtherPlatforms && (
          <div className="space-y-4 pt-2 border-t border-dark-border">
            {otherPlatforms.map(([key, platform]) => (
              <div key={key} className="pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-text-secondary">{platform.icon}</span>
                  <h4 className="font-medium text-text-primary text-sm">{platform.name}</h4>
                </div>
                <ol className="space-y-1 text-xs text-text-secondary">
                  {platform.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-2">
                      {typeof step === 'string' ? (
                        <>
                          <span className="text-text-muted">{idx + 1}.</span>
                          <span>{step}</span>
                        </>
                      ) : (
                        <div className="w-full pl-4">{step}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-dark-border">
          <a
            href="https://github.com/thenunner/ytandchill/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="btn bg-dark-tertiary text-text-primary hover:bg-dark-hover flex-1 text-center"
          >
            View Changelog
          </a>
          <button
            onClick={onClose}
            className="btn bg-accent text-white hover:bg-accent-hover flex-1"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
