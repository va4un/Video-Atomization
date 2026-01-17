"use client";

import { useState, useEffect } from "react";

interface ProcessingStatusProps {
  wasabiKey: string;
  fileName: string;
  status: {
    transcriptGenerated: boolean;
    clipsCreated: boolean;
    errors?: string[];
  };
}

export function ProcessingStatus({ wasabiKey, fileName, status: initialStatus }: ProcessingStatusProps) {
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);
  const [currentStep, setCurrentStep] = useState<string>("Initializing...");
  const [localStatus, setLocalStatus] = useState(initialStatus);

  // Reset state when wasabiKey or fileName changes (new file uploaded)
  useEffect(() => {
    console.log('ProcessingStatus: New file detected', { wasabiKey, fileName });
    // Reset all state for new file
    setStatusLogs([
      "✓ Video uploaded to Wasabi",
      "Waiting for upload to complete...",
      "Starting video processing...",
    ]);
    setCurrentStep("Waiting for upload to complete...");
    setIsProcessing(true);
    setLocalStatus({
      transcriptGenerated: false,
      clipsCreated: false,
      errors: [],
    });
  }, [wasabiKey, fileName]);

  useEffect(() => {
    // Update logs when transcript is generated
    if (localStatus.transcriptGenerated) {
      setStatusLogs(prev => {
        if (!prev.some(log => log.includes("Transcript generated"))) {
          return [
            ...prev,
            "✓ Video downloaded from Wasabi",
            "✓ Audio extracted using ffmpeg",
            "✓ Transcript generated with segments using AssemblyAI",
            "✓ Detected key moments",
            "Creating video clips in multiple formats...",
          ];
        }
        return prev;
      });
      setCurrentStep("Creating video clips in multiple formats...");
    }
  }, [localStatus.transcriptGenerated]);

  useEffect(() => {
    // Update logs when clips are created
    if (localStatus.clipsCreated) {
      setStatusLogs(prev => {
        if (!prev.some(log => log.includes("Processing complete"))) {
          return [
            ...prev,
            "✓ Clips created in both formats (16:9 & 9:16)",
            "✓ Uploading clips to Wasabi...",
            "Processing complete. All clips created and uploaded.",
          ];
        }
        return prev;
      });
      setIsProcessing(false);
      setCurrentStep("Processing completed successfully!");
    }
  }, [localStatus.clipsCreated]);

  // Poll for status updates with real-time progress
  useEffect(() => {
    if (!wasabiKey) return;
    
    let pollCount = 0;
    let isMounted = true;
    
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      
      try {
        pollCount++;
        const response = await fetch(`/api/processing-status?wasabiKey=${encodeURIComponent(wasabiKey)}`);
        if (response.ok) {
          const data = await response.json();
          
          // Update local status based on API response
          const apiStatus = data.status;
          
          // Update transcript status
          setLocalStatus(prev => {
            if (apiStatus.transcriptGenerated && !prev.transcriptGenerated) {
              return { ...prev, transcriptGenerated: true };
            }
            return prev;
          });
          
          // Update clips status
          setLocalStatus(prev => {
            if (apiStatus.clipsCreated && !prev.clipsCreated) {
              return { ...prev, clipsCreated: true };
            }
            return prev;
          });
          
          // Show processing status if video exists but clips don't
          if (apiStatus.processing && pollCount % 4 === 0) {
            // Update every 12 seconds (4 polls * 3 seconds)
            setStatusLogs(prev => {
              const lastLog = prev[prev.length - 1];
              // Only add new status if we don't have recent updates
              if (!lastLog || !lastLog.includes("Processing")) {
                return [...prev, `Processing... (${pollCount * 3}s elapsed)`];
              }
              return prev;
            });
          }
          
          // Show clip count if available
          if (data.clipCount > 0 && data.clipCount < (data.expectedClips || 999)) {
            setStatusLogs(prev => {
              const clipLog = `✓ ${data.clipCount} clip(s) uploaded so far...`;
              if (!prev.some(log => log.includes(`${data.clipCount} clip`))) {
                return [...prev, clipLog];
              }
              return prev;
            });
          }
          
          // Stop polling if both are complete
          if (apiStatus.clipsCreated && apiStatus.transcriptGenerated) {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Failed to poll status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [wasabiKey]);

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/download-clips?wasabiKey=${encodeURIComponent(wasabiKey)}`);
      
      if (!response.ok) {
        const error = await response.json();
        alert(`Failed to download clips: ${error.error || 'Unknown error'}`);
        return;
      }

      // Get the zip file as a blob
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^/.]+$/, '')}-clips.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download clips. Please try again.');
    }
  };

  if (!isProcessing && localStatus.clipsCreated && localStatus.transcriptGenerated) {
    return (
      <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p className="text-green-800 dark:text-green-200 font-medium">
            Processing completed successfully!
          </p>
        </div>
        <div className="text-sm text-green-700 dark:text-green-300 space-y-1 mb-4">
          <div>✓ Transcript generated</div>
          <div>✓ Key moments detected</div>
          <div>✓ Clips created (horizontal & vertical)</div>
          <div>✓ Clips uploaded to Wasabi</div>
        </div>
        <button
          onClick={handleDownload}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download All Clips
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-blue-800 dark:text-blue-200 font-medium">
            Processing in progress...
          </p>
        </div>

        <div className="bg-black dark:bg-gray-900 rounded p-3 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
          <div className="space-y-1">
            {statusLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-gray-500">$</span>
                <span>{log}</span>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start gap-2">
                <span className="text-gray-500">$</span>
                <span className="animate-pulse">{currentStep}</span>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center gap-2">
            {localStatus.transcriptGenerated ? (
              <span className="text-green-600">✓</span>
            ) : (
              <span className="animate-pulse">⟳</span>
            )}
            <span>Transcript Generation</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {localStatus.clipsCreated ? (
              <span className="text-green-600">✓</span>
            ) : (
              <span className="animate-pulse">⟳</span>
            )}
            <span>Clip Creation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
