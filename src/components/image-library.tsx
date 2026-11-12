'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { api, type PublicLibraryImage } from '@/lib/client';
import { filesToAttachments, formatBytes } from '@/lib/email-attachments';
import { MAX_IMAGE_BYTES } from '@/lib/inline-images';
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
export function ImageLibraryModal({ title, onPick, onDeleted, onClose }: {
  title: string;
  onPick: (image: PublicLibraryImage) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<PublicLibraryImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
      (data) => { if (!cancelled) setImages(data.images); },
      (err) => { if (!cancelled) { setError((err as Error).message); setImages([]); } }
    );
    return () => { cancelled = true; };
  }, []);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const added = await uploadImages(files);
      // One new picture is almost always the one wanted: use it straight away.
      if (added.length === 1) { onPick(added[0]); return; }
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
        <ul className="mt-4 grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <button onClick={() => onPick(img)} className="block w-full cursor-pointer bg-slate-100 p-2 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" aria-label={`Use ${img.filename}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local file served by this app; next/image adds nothing */}
                <img src={imageUrl(img.id)} alt="" className="mx-auto h-24 w-full object-contain" />
              </button>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 truncate" title={img.filename}>{img.filename} <span className="text-slate-500 dark:text-slate-400">· {formatBytes(img.size)}</span></span>
                {confirmDelete === img.id ? (
                  <button className="shrink-0 cursor-pointer font-semibold text-rose-600" onClick={() => remove(img.id)}>Delete?</button>
                ) : (
                  <button className="shrink-0 cursor-pointer text-slate-500 hover:text-rose-600" aria-label={`Delete ${img.filename}`} onClick={() => setConfirmDelete(img.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
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
