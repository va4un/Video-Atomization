"use client";

import { useCallback, useState, useRef } from "react";
import type { UploadHookControl } from "@better-upload/client";

interface UploadDropzoneProps {
  control: UploadHookControl<true>;
  accept?: string;
  description?: {
    maxFiles?: number;
    maxFileSize?: string;
    fileTypes?: string;
  };
}

export function UploadDropzone({
  control,
  accept = "image/*",
  description,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (description?.maxFiles && fileArray.length > description.maxFiles) {
        alert(`Maximum ${description.maxFiles} files allowed`);
        return;
      }
      control.upload(fileArray);
    },
    [control, description]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
          : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={description?.maxFiles ? description.maxFiles > 1 : true}
        onChange={handleFileInput}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-4">
        <svg
          className="w-12 h-12 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
            {isDragging
              ? "Drop files here"
              : "Drag & drop files here, or click to select"}
          </p>
          {description && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {description.fileTypes && `Types: ${description.fileTypes}`}
              {description.maxFileSize && ` • Max size: ${description.maxFileSize}`}
              {description.maxFiles && ` • Max files: ${description.maxFiles}`}
            </p>
          )}
        </div>
        {control.isPending && (
          <div className="mt-4">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Uploading... {control.averageProgress ? `${Math.round(control.averageProgress * 100)}%` : ""}
            </p>
          </div>
        )}
        {control.isError && control.error && (
          <div className="mt-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              Error: {control.error.message}
            </p>
          </div>
        )}
        {control.isSettled && control.uploadedFiles && control.uploadedFiles.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-green-600 dark:text-green-400">
              {control.uploadedFiles.length} file(s) uploaded successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

