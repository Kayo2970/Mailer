'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { api, type PublicLibraryImage } from '@/lib/client';
import { filesToAttachments, formatBytes } from '@/lib/email-attachments';
import { MAX_IMAGE_BYTES, type ImageAlign } from '@/lib/inline-images';
import { ActionButton, Modal } from './ui';

export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/gif,.png,.jpg,.jpeg,.gif';
export const imageUrl = (id: string) => `/api/images/${id}`;

/** Uploads picked files to the image library; returns the ones that were stored. Throws with the server's reason. */
export async function uploadImages(files: File[]): Promise<PublicLibraryImage[]> {
  const tooBig = files.find((f) => f.size > MAX_IMAGE_BYTES);
  if (tooBig) throw new Error(`${tooBig.name} is ${formatBytes(tooBig.size)} — images can be at most ${formatBytes(MAX_IMAGE_BYTES)} each.`);
  const out: PublicLibraryImage[] = [];
  for (const f of await filesToAttachments(files)) {
    out.push((await api<{ image: PublicLibraryImage }>('/api/images', { filename: f.filename, contentBase64: f.contentBase64 })).image);
  }
  return out;
}

/**
 * The image library modal: upload pictures, pick one, delete old ones.
 * Supports direct file chooser, drag-and-drop, card selection, and placement options.
 */
export function ImageLibraryModal({
  title,
  currentId,
  showPlacementOptions = false,
  onPick,
  onDeleted,
  onClose,
}: {
  title: string;
  currentId?: string;
  showPlacementOptions?: boolean;
  onPick: (image: PublicLibraryImage, options?: { width?: number; align: ImageAlign }) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<PublicLibraryImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [selectedImage, setSelectedImage] = useState<PublicLibraryImage | null>(null);
  const [align, setAlign] = useState<ImageAlign>('center');
  const [sizePreset, setSizePreset] = useState<'full' | '240' | '420' | '580' | 'custom'>('420');
  const [customWidth, setCustomWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getComputedWidth = (): number | undefined => {
    if (sizePreset === 'full') return undefined;
    if (sizePreset === 'custom') return Math.max(32, Math.min(2000, Number(customWidth) || 420));
    return Number(sizePreset);
  };

  const handleConfirm = (imgToInsert?: PublicLibraryImage) => {
    const target = imgToInsert || selectedImage;
    if (!target) return;
    onPick(target, showPlacementOptions ? { width: getComputedWidth(), align } : undefined);
  };

  const load = useCallback(async () => {
    try {
      const data = await api<{ images: PublicLibraryImage[] }>('/api/images');
      setImages(data.images);
      return data.images;
    } catch (err) {
      setError((err as Error).message);
      setImages([]);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ images: PublicLibraryImage[] }>('/api/images').then(
      (data) => {
        if (!cancelled) {
          setImages(data.images);
          if (data.images.length > 0) {
            const preselect = currentId ? data.images.find((i) => i.id === currentId) : null;
            setSelectedImage(preselect || (showPlacementOptions ? data.images[0] : null));
          }
        }
      },
      (err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setImages([]);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [currentId, showPlacementOptions]);

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const added = await uploadImages(files);
      const updatedList = await load();
      if (added.length > 0) {
        const newlyAdded = updatedList.find((i) => i.id === added[0].id) || added[0];
        setSelectedImage(newlyAdded);
        if (!showPlacementOptions && added.length === 1) {
          onPick(newlyAdded);
          return;
        }
      }
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await processFiles(files);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      /image\/(png|jpeg|jpg|gif)/i.test(f.type) || /\.(png|jpe?g|gif)$/i.test(f.name)
    );
    await processFiles(files);
  };

  const remove = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDelete('');
    try {
      await api('/api/images', { deleteId: id });
      onDeleted?.(id);
      if (selectedImage?.id === id) setSelectedImage(null);
      setImages((prev) => (prev || []).filter((i) => i.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div
        className="space-y-4"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
      >
        {/* Upload toolbar & dropzone banner */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_IMAGES}
              multiple
              className="sr-only"
              onChange={onFileInputChange}
            />
            <button
              type="button"
              className="btn btn-primary inline-flex cursor-pointer items-center gap-1.5 shadow-xs"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{busy ? 'Uploading…' : 'Upload image'}</span>
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              PNG, JPG or GIF up to {formatBytes(MAX_IMAGE_BYTES)}.
            </span>
          </div>

          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            You can also drag & drop files here
          </span>
        </div>

        {isDragging && (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-amber-500 bg-amber-50/80 p-6 text-sm font-semibold text-amber-900 transition dark:bg-amber-950/50 dark:text-amber-200">
            Drop image file to upload
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100">
            {error}
          </p>
        )}

        {/* Gallery */}
        {images === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-white/10">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No images in your library yet</p>
            <p className="mt-1 text-xs text-slate-400">Click &ldquo;Upload image&rdquo; above or drag an image here to get started.</p>
          </div>
        ) : (
          <div>
            <ul className="grid max-h-[42vh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
              {images.map((img) => {
                const isSelected = selectedImage?.id === img.id;
                return (
                  <li
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    onDoubleClick={() => handleConfirm(img)}
                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/50 dark:border-amber-400 dark:bg-amber-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="relative flex h-28 w-full items-center justify-center bg-slate-100/90 p-2 dark:bg-slate-800/80">
                      {/* eslint-disable-next-line @next/next/no-img-element -- app-served local asset */}
                      <img src={imageUrl(img.id)} alt="" className="max-h-full max-w-full object-contain" />
                      {isSelected && (
                        <span className="absolute right-2 top-2 rounded-full bg-amber-500 p-1 text-white shadow-md">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1.5 p-2 text-[11px]">
                      <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200" title={img.filename}>
                        {img.filename}
                      </span>
                      <span className="shrink-0 text-slate-400 dark:text-slate-500">
                        {formatBytes(img.size)}
                      </span>
                      {confirmDelete === img.id ? (
                        <button
                          type="button"
                          className="ml-1 shrink-0 font-bold text-rose-600 hover:underline"
                          onClick={(e) => remove(img.id, e)}
                        >
                          Delete?
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ml-1 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                          aria-label={`Delete ${img.filename}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(img.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Message body placement options (when called from Compose / Rich Editor) */}
        {showPlacementOptions && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-3 dark:border-white/10 dark:bg-slate-800/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Placement & Size
                {selectedImage && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">({selectedImage.filename})</span>}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Double-click an image or adjust below and click Insert</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label !mb-1 text-xs">Alignment / Location</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-slate-900" role="group" aria-label="Image alignment">
                  {([
                    { id: 'left', label: 'Left', icon: <AlignLeft className="h-3.5 w-3.5" /> },
                    { id: 'center', label: 'Center', icon: <AlignCenter className="h-3.5 w-3.5" /> },
                    { id: 'right', label: 'Right', icon: <AlignRight className="h-3.5 w-3.5" /> },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAlign(opt.id)}
                      aria-pressed={align === opt.id}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        align === opt.id
                          ? 'bg-amber-100 font-semibold text-amber-950 dark:bg-amber-900/70 dark:text-amber-200'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label !mb-1 text-xs">Width</span>
                <div className="flex flex-wrap items-center gap-1">
                  {([
                    { id: 'full', label: 'Full / Auto' },
                    { id: '240', label: '240px' },
                    { id: '420', label: '420px' },
                    { id: '580', label: '580px' },
                    { id: 'custom', label: 'Custom' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSizePreset(opt.id)}
                      className={`cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition ${
                        sizePreset === opt.id
                          ? 'bg-amber-100 font-semibold text-amber-950 dark:bg-amber-900/70 dark:text-amber-200'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {sizePreset === 'custom' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={32}
                        max={2000}
                        value={customWidth}
                        onChange={(e) => setCustomWidth(Math.max(16, Number(e.target.value) || 0))}
                        className="input !w-20 !py-0.5 text-xs"
                        aria-label="Custom image width in pixels"
                      />
                      <span className="text-xs text-slate-500">px</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal footer action bar */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedImage ? (
              <span>Selected: <strong className="text-slate-800 dark:text-slate-200">{selectedImage.filename}</strong></span>
            ) : (
              'Click an image to select it'
            )}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn text-xs !py-1.5" onClick={onClose}>
              Cancel
            </button>
            <ActionButton
              variant="primary"
              disabled={!selectedImage}
              onClick={() => handleConfirm()}
            >
              {showPlacementOptions ? 'Insert image into message' : 'Use selected image'}
            </ActionButton>
          </div>
        </div>

        <p className="hint !mt-1">
          Deleting an image here does not affect messages already in the queue — they keep their own copy.
        </p>
      </div>
    </Modal>
  );
}

/**
 * A settings field for picking a header/footer image:
 * Provides direct 1-click file upload, drag-and-drop, library browsing, and instant preview.
 */
export function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const directInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setFieldError('');
    try {
      const added = await uploadImages(files);
      if (added.length > 0) {
        onChange(added[0].id);
      }
    } catch (err) {
      setFieldError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDirectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    void handleUploadFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      /image\/(png|jpeg|jpg|gif)/i.test(f.type) || /\.(png|jpe?g|gif)$/i.test(f.name)
    );
    void handleUploadFiles(files);
  };

  return (
    <div className="space-y-1.5">
      <span className="label !mb-0">{label}</span>
      <div
        className={`flex flex-wrap items-center gap-3 rounded-xl border p-2.5 transition ${
          isDragOver
            ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/30 dark:bg-amber-950/20'
            : 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-900/40'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {/* Thumbnail Preview / Drop Target */}
        {value ? (
          <div
            className="group relative flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-2xs dark:border-white/10 dark:bg-slate-800"
            title="Current image preview (drag new image here to replace)"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- app-served local asset */}
            <img src={imageUrl(value)} alt={label} className="max-h-full max-w-full object-contain" />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-14 w-28 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/80 text-[10px] text-slate-400 dark:border-white/15 dark:bg-slate-900/50">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            ) : (
              <>
                <ImagePlus className="mb-0.5 h-4 w-4 text-slate-400" />
                <span>No image</span>
              </>
            )}
          </div>
        )}

        {/* Action buttons: Direct Upload + Library Picker + Remove */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Upload button with native file chooser */}
          <input
            ref={directInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            className="sr-only"
            disabled={uploading}
            onChange={handleDirectFile}
          />
          <button
            type="button"
            className="btn btn-primary inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold"
            disabled={uploading}
            onClick={() => directInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{uploading ? 'Uploading…' : value ? 'Upload new' : 'Upload image'}</span>
          </button>

          {/* Browse Library Modal */}
          <button
            type="button"
            className="btn inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold"
            onClick={() => setOpen(true)}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <span>{value ? 'Change from library' : 'Browse library'}</span>
          </button>

          {/* Remove button */}
          {value && (
            <button
              type="button"
              className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:text-rose-600 dark:text-slate-400"
              onClick={() => onChange('')}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {fieldError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
      )}

      {hint && <p className="hint !mt-1">{hint}</p>}

      {open && (
        <ImageLibraryModal
          title={label}
          currentId={value}
          onClose={() => setOpen(false)}
          onPick={(img) => {
            onChange(img.id);
            setOpen(false);
          }}
          onDeleted={(id) => {
            if (id === value) onChange('');
          }}
        />
      )}
    </div>
  );
}
