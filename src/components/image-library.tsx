'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { api, type PublicLibraryImage } from '@/lib/client';
import { filesToAttachments, formatBytes } from '@/lib/email-attachments';
import { MAX_IMAGE_BYTES, type ImageAlign } from '@/lib/inline-images';
import { ActionButton, Modal } from './ui';

const ACCEPT = 'image/png,image/jpeg,image/gif';
export const imageUrl = (id: string) => `/api/images/${id}`;

/** Uploads picked files to the image library; returns the ones that were stored. Throws with the server's reason. */
async function uploadImages(files: File[]): Promise<PublicLibraryImage[]> {
  const tooBig = files.find((f) => f.size > MAX_IMAGE_BYTES);
  if (tooBig) throw new Error(`${tooBig.name} is ${formatBytes(tooBig.size)} — images can be at most ${formatBytes(MAX_IMAGE_BYTES)} each.`);
  const out: PublicLibraryImage[] = [];
  for (const f of await filesToAttachments(files)) {
    out.push((await api<{ image: PublicLibraryImage }>('/api/images', { filename: f.filename, contentBase64: f.contentBase64 })).image);
  }
  return out;
}

/**
 * The image library: upload pictures, pick one, delete old ones. Whatever is
 * picked gets embedded in the e-mail itself, so it keeps showing for the
 * recipient after this app is closed.
 */
export function ImageLibraryModal({
  title,
  showPlacementOptions = false,
  onPick,
  onDeleted,
  onClose,
}: {
  title: string;
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
  const inputRef = useRef<HTMLInputElement>(null);

  const getComputedWidth = (): number | undefined => {
    if (sizePreset === 'full') return undefined;
    if (sizePreset === 'custom') return Math.max(32, Math.min(2000, Number(customWidth) || 420));
    return Number(sizePreset);
  };

  const handleInsert = (imgToInsert?: PublicLibraryImage) => {
    const target = imgToInsert || selectedImage;
    if (!target) return;
    onPick(target, { width: getComputedWidth(), align });
  };

  const load = useCallback(async () => {
    try {
      setImages((await api<{ images: PublicLibraryImage[] }>('/api/images')).images);
    } catch (err) {
      setError((err as Error).message);
      setImages([]);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<{ images: PublicLibraryImage[] }>('/api/images').then(
      (data) => {
        if (!cancelled) {
          setImages(data.images);
          if (showPlacementOptions && data.images.length > 0 && !selectedImage) {
            setSelectedImage(data.images[0]);
          }
        }
      },
      (err) => { if (!cancelled) { setError((err as Error).message); setImages([]); } }
    );
    return () => { cancelled = true; };
  }, [showPlacementOptions, selectedImage]);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const added = await uploadImages(files);
      if (added.length === 1) {
        if (showPlacementOptions) {
          setSelectedImage(added[0]);
          await load();
          return;
        }
        onPick(added[0]);
        return;
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
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
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFiles} />
        <ActionButton variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload image
        </ActionButton>
        <span className="text-xs text-slate-500 dark:text-slate-400">PNG, JPEG or GIF, up to {formatBytes(MAX_IMAGE_BYTES)} each.</span>
      </div>
      {error && <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100">{error}</p>}

      {images === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : images.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No images yet. Upload one to use it.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="grid max-h-[40vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {images.map((img) => {
              const isSelected = selectedImage?.id === img.id;
              return (
                <li
                  key={img.id}
                  className={`relative overflow-hidden rounded-xl border transition ${
                    showPlacementOptions && isSelected
                      ? 'border-amber-500 ring-2 ring-amber-500/40 dark:border-amber-400'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (showPlacementOptions) {
                        setSelectedImage(img);
                      } else {
                        onPick(img);
                      }
                    }}
                    onDoubleClick={() => {
                      if (showPlacementOptions) {
                        handleInsert(img);
                      }
                    }}
                    className="block w-full cursor-pointer bg-slate-100 p-2 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                    aria-label={`Select ${img.filename}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local file served by this app */}
                    <img src={imageUrl(img.id)} alt="" className="mx-auto h-24 w-full object-contain" />
                  </button>
                  {showPlacementOptions && isSelected && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-500 p-1 text-white shadow-xs">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                    <span className="min-w-0 truncate" title={img.filename}>
                      {img.filename} <span className="text-slate-500 dark:text-slate-400">· {formatBytes(img.size)}</span>
                    </span>
                    {confirmDelete === img.id ? (
                      <button className="shrink-0 cursor-pointer font-semibold text-rose-600" onClick={() => remove(img.id)}>Delete?</button>
                    ) : (
                      <button className="shrink-0 cursor-pointer text-slate-500 hover:text-rose-600" aria-label={`Delete ${img.filename}`} onClick={() => setConfirmDelete(img.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {showPlacementOptions && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-3 dark:border-white/10 dark:bg-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Image Placement & Size
                  {selectedImage && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">({selectedImage.filename})</span>}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Double-click an image or adjust below and click Insert</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Location / Alignment */}
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

                {/* Sizing */}
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

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200 dark:border-white/10">
                <button type="button" className="btn text-xs !py-1.5" onClick={onClose}>Cancel</button>
                <ActionButton
                  variant="primary"
                  disabled={!selectedImage}
                  onClick={() => handleInsert()}
                >
                  Insert image into message
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="hint">Deleting an image here does not affect messages already in the queue — they keep their own copy.</p>
    </Modal>
  );
}

/** A settings field holding one library image: thumbnail, choose / change, remove. */
export function ImageField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        {value && (
          <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local file served by this app */}
            <img src={imageUrl(value)} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <button className="btn" onClick={() => setOpen(true)}><ImagePlus className="h-4 w-4" />{value ? 'Change' : 'Choose image'}</button>
        {value && <button className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:text-rose-600 dark:text-slate-400" onClick={() => onChange('')}>Remove</button>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {open && (
        <ImageLibraryModal
          title={label}
          onClose={() => setOpen(false)}
          onPick={(img) => { onChange(img.id); setOpen(false); }}
          onDeleted={(id) => { if (id === value) onChange(''); }}
        />
      )}
    </div>
  );
}
