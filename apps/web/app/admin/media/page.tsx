'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { AdminDrawer } from '../../../components/admin/AdminDrawer';
import { ConfirmModal } from '../../../components/admin/AdminModal';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { MediaAsset } from '@bro-pics/shared';

type MediaTypeFilter = 'all' | 'image' | 'video';

export default function AdminMediaLibraryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [mediaList, setMediaList] = useState<(MediaAsset & { url: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');

  // Selected Asset Drawer State
  const [selectedAsset, setSelectedAsset] = useState<(MediaAsset & { url: string }) | null>(null);
  const [editAlt, setEditAlt] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Upload Modal / State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Archive Confirmation
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [assetToArchive, setAssetToArchive] = useState<(MediaAsset & { url: string }) | null>(null);

  // Fetch Media
  const fetchMedia = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/media', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load media');
      const data = await res.json();
      setMediaList(data.media || []);
    } catch {
      showToast('Error loading media assets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [user]);

  // Filtered Assets
  const filteredMedia = useMemo(() => {
    return mediaList.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.alt.toLowerCase().includes(q) ||
          item.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [mediaList, typeFilter, searchQuery]);

  // Open Asset Drawer
  const handleOpenAsset = (asset: MediaAsset & { url: string }) => {
    setSelectedAsset(asset);
    setEditAlt(asset.alt);
    setEditTags(asset.tags?.join(', ') || '');
  };

  // Update Alt / Tags
  const handleUpdateAsset = async () => {
    if (!user || !selectedAsset) return;
    setIsUpdating(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/media/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alt: editAlt.trim(),
          tags: editTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) throw new Error('Failed to update asset metadata');
      showToast('Media details updated', 'success');
      setSelectedAsset(null);
      fetchMedia();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      showToast(msg, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Direct Upload Flow
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !user) return;
    if (!uploadAlt.trim()) {
      showToast('Alt text is required for accessibility', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);

    try {
      const token = await user.getIdToken();
      const isVideo = uploadFile.type.startsWith('video/');
      const fileType = isVideo ? 'video' : 'image';

      // 1. Dimensions
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

      setUploadProgress(35);

      // 2. Signed URL
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

      setUploadProgress(65);

      // 3. PUT bytes
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type },
        body: uploadFile,
      });

      if (!putRes.ok) throw new Error('Failed to upload file bytes');
      setUploadProgress(85);

      // 4. Create Media doc
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

      if (!createRes.ok) throw new Error('Failed to register media asset');

      setUploadProgress(100);
      showToast('Asset uploaded to media library', 'success');
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadAlt('');
      setUploadTags('');
      fetchMedia();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Archive Media Asset
  const handleArchiveAsset = async (force = false) => {
    if (!user || !assetToArchive) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/media/${assetToArchive.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: false, force }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 409) {
          if (confirm(`This asset is referenced in ${errData.details?.usageRefs?.length || 'some'} place(s). Force archive anyway?`)) {
            return handleArchiveAsset(true);
          }
          return;
        }
        throw new Error(errData.error?.message || 'Failed to archive asset');
      }

      showToast('Asset archived', 'success');
      setShowArchiveConfirm(false);
      setAssetToArchive(null);
      setSelectedAsset(null);
      fetchMedia();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error archiving asset';
      showToast(msg, 'error');
    }
  };

  const copyUrlToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('Copied public URL to clipboard', 'info');
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Media Library
          </h1>
          <p className="text-xs text-ink/60">
            Upload and manage product photography, lifestyle mockups, marketing banners, and customer showcase videos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-semibold transition-colors shadow-xs"
        >
          + Upload Asset
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 border-b border-line sm:border-b-0">
          {(['all', 'image', 'video'] as MediaTypeFilter[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                typeFilter === type
                  ? 'bg-ink text-gold font-bold shadow-xs'
                  : 'text-ink/60 hover:text-ink hover:bg-field'
              }`}
            >
              {type === 'all' ? 'All Assets' : `${type}s`} (
              {mediaList.filter((m) => type === 'all' || m.type === type).length}
              )
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/40 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by alt text or tag..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
          />
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-field animate-pulse" />
          ))}
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="p-16 border border-line rounded-2xl bg-paper text-center space-y-3">
          <span className="text-3xl block">🖼️</span>
          <p className="text-xs text-ink/60">No media assets found matching your criteria.</p>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 rounded-xl bg-gold text-ink text-xs font-semibold"
          >
            Upload First Asset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredMedia.map((asset) => (
            <div
              key={asset.id}
              onClick={() => handleOpenAsset(asset)}
              className="group relative rounded-2xl border border-line bg-paper overflow-hidden cursor-pointer hover:border-gold hover:shadow-md transition-all flex flex-col"
            >
              <div className="relative aspect-square bg-field/50 overflow-hidden flex items-center justify-center">
                {asset.type === 'image' ? (
                  <img
                    src={asset.url}
                    alt={asset.alt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-ink/70">
                    <span className="text-3xl mb-1">🎬</span>
                    <span className="text-2xs font-semibold uppercase">Video</span>
                  </div>
                )}

                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-ink/70 text-paper text-[10px] font-mono backdrop-blur-xs">
                  {asset.width}×{asset.height}
                </div>
              </div>

              <div className="p-3 space-y-1">
                <p className="text-xs font-semibold text-ink truncate" title={asset.alt}>
                  {asset.alt || 'Untitled'}
                </p>
                <div className="flex items-center justify-between text-2xs text-ink/50">
                  <span className="font-mono">{(((asset.sizeBytes ?? 0) / 1024)).toFixed(0)} KB</span>
                  {asset.usageRefs?.length ? (
                    <span className="text-gold font-bold">
                      {asset.usageRefs.length} ref{asset.usageRefs.length > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span>0 refs</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset Detail Drawer */}
      <AdminDrawer
        isOpen={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        title="Asset Details"
        subtitle={selectedAsset?.alt}
      >
        {selectedAsset && (
          <div className="space-y-5">
            {/* Preview Box */}
            <div className="rounded-xl border border-line bg-field/40 overflow-hidden flex items-center justify-center p-2 max-h-64">
              {selectedAsset.type === 'image' ? (
                <img
                  src={selectedAsset.url}
                  alt={selectedAsset.alt}
                  className="max-h-60 object-contain rounded-lg shadow-xs"
                />
              ) : (
                <video
                  src={selectedAsset.url}
                  controls
                  className="max-h-60 rounded-lg w-full"
                />
              )}
            </div>

            {/* Quick Copy Public URL */}
            <div className="space-y-1.5">
              <label className="text-2xs font-bold text-ink uppercase tracking-wider block">
                Public Storage URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={selectedAsset.url}
                  className="w-full px-3 py-1.5 text-2xs rounded-xl border border-line bg-field text-ink/70 font-mono truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyUrlToClipboard(selectedAsset.url)}
                  className="px-3 py-1.5 rounded-xl bg-ink text-gold hover:bg-ink/80 text-xs font-semibold transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Edit Alt & Tags */}
            <FormField label="Alt Text & Description" required>
              <input
                type="text"
                value={editAlt}
                onChange={(e) => setEditAlt(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            <FormField label="Tags (comma separated)">
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="frames, oak, promo"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
              />
            </FormField>

            {/* Technical Metadata */}
            <div className="p-3.5 rounded-xl border border-line bg-field space-y-1.5 text-2xs text-ink/70">
              <span className="font-bold text-ink uppercase tracking-wider block">Asset Specifications</span>
              <div className="flex justify-between">
                <span>Dimensions:</span>
                <span className="font-mono font-semibold">{selectedAsset.width} × {selectedAsset.height} px</span>
              </div>
              <div className="flex justify-between">
                <span>File Size:</span>
                <span className="font-mono font-semibold">{(((selectedAsset.sizeBytes ?? 0) / 1024)).toFixed(1)} KB</span>
              </div>
              <div className="flex justify-between">
                <span>Storage Path:</span>
                <span className="font-mono truncate max-w-[200px]">{selectedAsset.path}</span>
              </div>
            </div>

            {/* Usage References */}
            <div className="space-y-2">
              <span className="text-2xs font-bold text-ink uppercase tracking-wider block">
                Usage References ({selectedAsset.usageRefs?.length || 0})
              </span>
              {selectedAsset.usageRefs && selectedAsset.usageRefs.length > 0 ? (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedAsset.usageRefs.map((ref, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-field border border-line text-2xs font-mono text-ink/70 flex justify-between"
                    >
                      <span>{ref.resource}: {ref.resourceId}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xs text-ink/50 italic">Not actively linked to any product or banner.</p>
              )}
            </div>

            {/* Save & Archive Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setAssetToArchive(selectedAsset);
                  setShowArchiveConfirm(true);
                }}
                className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
              >
                Archive Asset
              </button>

              <button
                type="button"
                onClick={handleUpdateAsset}
                disabled={isUpdating}
                className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs">
          <div className="bg-paper border border-line rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-ink">Upload Media Asset</h2>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-line hover:border-gold rounded-xl p-6 text-center bg-field/30 transition-colors">
                <input
                  type="file"
                  id="media-page-upload"
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
                <label htmlFor="media-page-upload" className="cursor-pointer block space-y-2">
                  <span className="text-3xl block">📁</span>
                  <span className="text-xs font-bold text-ink block">
                    {uploadFile ? uploadFile.name : 'Choose image or video'}
                  </span>
                  <span className="text-2xs text-ink/50 block">
                    Direct upload to Cloud Storage
                  </span>
                </label>
              </div>

              <FormField label="Alt Text & Description" required>
                <input
                  type="text"
                  value={uploadAlt}
                  onChange={(e) => setUploadAlt(e.target.value)}
                  placeholder="e.g. Classic Teak Wall Frame Lifestyle Mockup"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                  required
                />
              </FormField>

              <FormField label="Tags (comma separated)">
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="frames, teak, hero"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
                />
              </FormField>

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
                  onClick={() => setShowUploadModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || isUploading}
                  className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Upload Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Archive Confirm Modal */}
      <ConfirmModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={() => handleArchiveAsset(false)}
        title="Archive Media Asset"
        message={`Are you sure you want to archive "${assetToArchive?.alt}"? If this asset is actively used on the storefront, archiving may display a broken image.`}
        confirmText="Archive Asset"
        variant="danger"
      />
    </div>
  );
}
