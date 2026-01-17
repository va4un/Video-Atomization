"use client"; // only for Next.js

import { useState, useEffect } from "react";
import { useUploadFiles } from "@better-upload/client";
import { UploadDropzone } from "@/components/ui/upload-dropzone";
import { ProcessingStatus } from "@/components/ui/processing-status";

export function Uploader() {
  const { control } = useUploadFiles({
    route: "video",
  });

  const [uploadedFile, setUploadedFile] = useState<{
    wasabiKey: string;
    fileName: string;
    uploadId: string; // Unique identifier for this upload
  } | null>(null);

  // Reset uploaded file when a new upload starts
  useEffect(() => {
    if (control.isPending) {
      setUploadedFile(prev => {
        if (prev) {
          console.log('New upload started, clearing previous file status');
          return null;
        }
        return prev;
      });
    }
  }, [control.isPending]);

  // Watch for uploaded files - detect changes in file name or new uploads
  useEffect(() => {
    if (control.uploadedFiles && control.uploadedFiles.length > 0) {
      const file = control.uploadedFiles[0];
      
      // Extract the key from the file object - better-upload provides it in different ways
      // Try multiple properties to find the key
      let wasabiKey: string | undefined;
      
      // Method 1: Direct key property
      if ((file as any).key) {
        wasabiKey = (file as any).key;
      }
      // Method 2: objectInfo.key (most common)
      else if ((file as any).objectInfo?.key) {
        wasabiKey = (file as any).objectInfo.key;
      }
      // Method 3: Extract from URL
      else if ((file as any).url) {
        const url = (file as any).url;
        const urlParts = url.split('/');
        wasabiKey = urlParts[urlParts.length - 1];
      }
      // Method 4: Use filename as fallback (will need to match in processing-status)
      else {
        wasabiKey = file.name;
      }
      
      if (wasabiKey) {
        // Create a unique upload ID based on key, name, and timestamp
        // This helps detect when a new file is uploaded even if it has the same name
        const fileSize = (file as any).size || 0;
        const uploadTimestamp = Date.now();
        const uploadId = `${wasabiKey}-${file.name}-${fileSize}-${uploadTimestamp}`;
        
        const newFileInfo = {
          wasabiKey,
          fileName: file.name || 'video.mp4',
          uploadId,
        };
        
        // Always update to ensure we have the latest file info
        // The ProcessingStatus component will detect changes via key prop
        setUploadedFile(prev => {
          // Check if this is a different file (different key, name, or upload)
          const isNewFile = !prev || 
                           prev.wasabiKey !== newFileInfo.wasabiKey || 
                           prev.fileName !== newFileInfo.fileName ||
                           prev.uploadId !== newFileInfo.uploadId;
          
          if (isNewFile) {
            console.log('New file uploaded detected:', { 
              wasabiKey, 
              fileName: file.name,
              uploadId,
              previousFile: prev,
              fileObject: Object.keys(file as any)
            });
            return newFileInfo;
          } else {
            console.log('Same file, no update needed:', { wasabiKey, fileName: file.name });
            return prev; // Return previous to avoid unnecessary re-render
          }
        });
      } else {
        console.warn('Could not extract wasabiKey from uploaded file:', file);
      }
    } else {
      // Reset when no files are uploaded
      setUploadedFile(prev => {
        if (prev) {
          console.log('Uploaded files cleared, resetting state');
          return null;
        }
        return prev; // Return previous to avoid unnecessary re-render
      });
    }
  }, [control.uploadedFiles]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <UploadDropzone
        control={control}
        accept="video/*"
        description={{
          maxFiles: 1,
          maxFileSize: "10GB",
          fileTypes: "MP4, MOV, AVI, MKV, WebM",
        }}
      />
      
      {uploadedFile && (
        <ProcessingStatus
          key={uploadedFile.uploadId}
          wasabiKey={uploadedFile.wasabiKey}
          fileName={uploadedFile.fileName}
          status={{
            transcriptGenerated: false,
            clipsCreated: false,
          }}
        />
      )}
    </div>
  );
}
