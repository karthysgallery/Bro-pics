'use client';

import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';

interface UploaderProps {
  onUploadComplete: (result: { path: string; url: string; widthPx?: number; heightPx?: number }) => void;
  accept?: string;
  maxSizeBytes?: number;
  label?: string;
  description?: string;
  className?: string;
}

export function Uploader({
  onUploadComplete,
  accept = 'image/*,.heic,.heif',
  maxSizeBytes = 25 * 1024 * 1024,
  label = 'Upload an image',
  description = 'PNG, JPG, HEIC up to 25MB',
  className = '',
}: UploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > maxSizeBytes) {
      setError(`File is too large (max ${Math.round(maxSizeBytes / (1024 * 1024))}MB)`);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(20);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Call the existing server upload endpoint
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Upload failed');
      }

      const data = await res.json();
      setProgress(100);
      onUploadComplete({
        path: data.originalPath || data.path || '',
        url: data.originalUrl || data.url || '',
        widthPx: data.widthPx,
        heightPx: data.heightPx,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-gold bg-gold/5'
            : uploading
            ? 'border-line bg-tint/40 cursor-wait'
            : 'border-line hover:border-gold/60 bg-paper'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          disabled={uploading}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-tint text-ink flex items-center justify-center">
            {uploading ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.85" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </div>
          <div className="text-xs">
            <span className="font-semibold text-ink">{label}</span>
            <span className="text-ink/60 block mt-0.5">{description}</span>
          </div>

          {uploading && (
            <div className="w-48 bg-tint rounded-full h-1.5 overflow-hidden mt-2">
              <div
                className="bg-gold h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between p-2 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-semibold underline ml-2 hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
