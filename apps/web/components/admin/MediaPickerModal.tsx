'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { AdminModal } from './AdminModal';
import { useToast } from '../ui/Toast';
import type { MediaAsset } from '@bro-pics/shared';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset & { url: string }) => void;
  allowedTypes?: ('image' | 'video')[];
  title?: string;
}

export function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  allowedTypes = ['image', 'video'],
  title = 'Select Media Asset',
}: MediaPickerModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
  const [mediaList, setMediaList] = useState<(MediaAsset & { url: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch library media
  useEffect(() => {
    if (!isOpen || !user) return;
    setLoading(true);

    user.getIdToken().then((token) => {
      fetch('/api/admin/media', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setMediaList(data.media || []);
        })
        .catch(() => showToast('Failed to load media assets', 'error'))
        .finally(() => setLoading(false));
    });
  }, [isOpen, user]);

  // Handle direct file upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !user) return;
    if (!uploadAlt.trim()) {
      showToast('Alt text is required for accessibility and search', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const token = await user.getIdToken();
      const isVideo = uploadFile.type.startsWith('video/');
      const fileType = isVideo ? 'video' : 'image';

      // 1. Get image/video dimensions
      let width = 1200;
      let height = 800;

      if (!isVideo) {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 1200, height: 800 });
          img.src = URL.createObjectURL(uploadFile);
        });
        width = dimensions.width;
        height = dimensions.height;
      }

      setUploadProgress(30);

      // 2. Request signed upload URL
      const signedRes = await fetch('/api/admin/media/upload-url', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: uploadFile.name,
          contentType: uploadFile.type,
        }),
      });

      if (!signedRes.ok) throw new Error('Failed to get signed upload URL');
      const { uploadUrl, path } = await signedRes.json();

      setUploadProgress(60);

      // 3. Direct upload to Cloud Storage
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type },
        body: uploadFile,
      });

      if (!putRes.ok) throw new Error('Failed to upload file bytes');
      setUploadProgress(85);

      // 4. Register Media doc in Firestore
      const createRes = await fetch('/api/admin/media', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          type: fileType,
          width,
          height,
          sizeBytes: uploadFile.size,
          alt: uploadAlt.trim(),
          tags: uploadTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (!createRes.ok) throw new Error('Failed to save media metadata');
      const createdData = await createRes.json();
      const newAsset = createdData.media;

      setUploadProgress(100);
      showToast('Media uploaded successfully', 'success');

      // Auto-select and close
      onSelect(newAsset);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const filteredMedia = mediaList.filter((m) => {
    if (!allowedTypes.includes(m.type as 'image' | 'video')) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.alt.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-line gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'library'
                ? 'border-gold text-ink font-bold'
                : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            Media Library ({filteredMedia.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-gold text-ink font-bold'
                : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            + Upload New File
          </button>
        </div>

        {activeTab === 'library' ? (
          <div className="space-y-3">
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by alt text or tag..."
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
            />

            {/* Media Grid */}
            <div className="max-h-80 overflow-y-auto grid grid-cols-3 gap-2.5 p-1 border border-line rounded-xl bg-field/30">
              {loading ? (
                <div className="col-span-3 p-8 text-center text-xs text-ink/40 animate-pulse">
                  Loading media assets...
                </div>
              ) : filteredMedia.length === 0 ? (
                <div className="col-span-3 p-8 text-center text-xs text-ink/50">
                  No media assets found.
                </div>
              ) : (
                filteredMedia.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-line bg-paper hover:border-gold cursor-pointer transition-all hover:shadow-xs"
                  >
                    {item.type === 'image' ? (
                      <img src={item.url} alt={item.alt} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-ink/90 text-gold text-2xs p-2 text-center">
                        <span className="text-base mb-1">▶️</span>
                        <span className="line-clamp-1">{item.alt}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-ink/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-paper text-2xs">
                      <p className="font-bold truncate">{item.alt}</p>
                      <p className="text-paper/60 font-mono text-[10px]">
                        {item.width}×{item.height}px
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="border-2 border-dashed border-line hover:border-gold rounded-xl p-6 text-center bg-field/30 transition-colors">
              <input
                type="file"
                id="media-modal-file"
                accept="image/*,video/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setUploadFile(e.target.files[0]);
                    if (!uploadAlt) {
                      setUploadAlt(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                    }
                  }
                }}
                className="hidden"
              />
              <label htmlFor="media-modal-file" className="cursor-pointer block space-y-2">
                <span className="text-2xl block">📁</span>
                <span className="text-xs font-bold text-ink block">
                  {uploadFile ? uploadFile.name : 'Click to select an image or video'}
                </span>
                <span className="text-2xs text-ink/50 block">
                  PNG, JPG, WEBP, or MP4 up to 50MB
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-2xs font-bold text-ink uppercase tracking-wider block mb-1">
                  Alt Text & Description (Required)
                </label>
                <input
                  type="text"
                  value={uploadAlt}
                  onChange={(e) => setUploadAlt(e.target.value)}
                  placeholder="e.g. Solid Oak Wood Frame with Matting"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  required
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-ink uppercase tracking-wider block mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="frames, oak, living-room"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            {isUploading && (
              <div className="space-y-1">
                <div className="w-full bg-field rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gold h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-2xs text-ink/60 block text-right font-mono">
                  {uploadProgress}% uploading...
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!uploadFile || isUploading}
                className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Upload & Select'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminModal>
  );
}
