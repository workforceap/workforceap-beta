'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Avatar } from './Avatar';
import { cropProfilePhotoToSquare } from '@/lib/portal/cropProfilePhoto';
import { PROFILE_PHOTO_ACCEPT } from '@/lib/portal/memberProfilePhoto';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

interface MemberProfilePhotoEditorProps {
  initials: string;
  photoUrl?: string | null;
  live?: boolean;
}

export function MemberProfilePhotoEditor({
  initials,
  photoUrl,
  live = false,
}: MemberProfilePhotoEditorProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const dialogTitleId = useId();
  const fileInputId = useId();
  const zoomInputId = useId();

  const [currentUrl, setCurrentUrl] = useState(photoUrl ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUrl(photoUrl ?? null);
  }, [photoUrl]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const closeDialog = () => {
    dialogRef.current?.close();
    setSelectedFile(null);
    setZoom(1);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openDialog = () => {
    if (!live) return;
    setError(null);
    dialogRef.current?.showModal();
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setZoom(1);
    setError(null);
  };

  const handleSave = async () => {
    if (!live || !selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      const cropped = await cropProfilePhotoToSquare(selectedFile, zoom);
      const fd = new FormData();
      fd.append('file', cropped, 'profile-photo.webp');
      const res = await fetch('/api/member/profile-photo/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        setError(await getErrorMessageFromResponse(res));
        return;
      }
      const refresh = await fetch('/api/member/profile-photo');
      const data = (await refresh.json().catch(() => ({}))) as { url?: string | null };
      setCurrentUrl(data.url ?? null);
      closeDialog();
      router.refresh();
    } catch {
      setError('Could not save your photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!live || !currentUrl) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch('/api/member/profile-photo', { method: 'DELETE' });
      if (!res.ok) {
        setError(await getErrorMessageFromResponse(res));
        return;
      }
      setCurrentUrl(null);
      closeDialog();
      router.refresh();
    } catch {
      setError('Could not remove your photo. Please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const busy = saving || removing;

  return (
    <div className="wa-flex wa-flex-col wa-items-center wa-gap-3" style={{ minWidth: 160 }}>
      <div className="wa-relative">
        <Avatar initials={initials || '?'} size={80} gradient src={currentUrl ?? undefined} />
        {live ? (
          <button
            type="button"
            onClick={openDialog}
            className="wa-kit-focus"
            aria-label={currentUrl ? 'Change profile photo' : 'Add profile photo'}
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '2px solid var(--wa-surface)',
              background: 'var(--wa-accent)',
              color: 'var(--wa-on-accent-control)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Camera size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {live ? (
        <p className="wa-kit-meta" style={{ maxWidth: 200, textAlign: 'center', lineHeight: 1.45, margin: 0 }}>
          {currentUrl
            ? 'Your photo appears on your profile. Use a clear, professional headshot.'
            : 'Add a professional headshot so counselors and employers can recognize you.'}
        </p>
      ) : (
        <p className="wa-kit-meta" style={{ maxWidth: 200, textAlign: 'center', lineHeight: 1.45, margin: 0 }}>
          Profile photos can be added when your account is connected.
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        className="wa-kit-focus"
        style={{
          width: 'min(92vw, 420px)',
          border: '1px solid var(--wa-border)',
          borderRadius: 'var(--wa-radius)',
          padding: 'var(--wa-pad-sm)',
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
          boxShadow: 'var(--wa-shadow-lg)',
        }}
        onClose={closeDialog}
      >
        <h2 id={dialogTitleId} style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 12 }}>
          Profile photo
        </h2>

        <div
          aria-hidden={!previewUrl}
          style={{
            width: 220,
            height: 220,
            margin: '0 auto 16px',
            borderRadius: 'var(--wa-radius-sm)',
            overflow: 'hidden',
            background: 'var(--wa-surface-2)',
            border: '1px solid var(--wa-border)',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            />
          ) : (
            <div
              className="wa-flex wa-items-center wa-justify-center"
              style={{ width: '100%', height: '100%', color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}
            >
              Choose a photo to preview
            </div>
          )}
        </div>

        <label htmlFor={fileInputId} className="wa-kit-meta" style={{ display: 'block', marginBottom: 8 }}>
          Photo file
        </label>
        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept={PROFILE_PHOTO_ACCEPT}
          onChange={onFileChange}
          disabled={busy}
          style={{ width: '100%', marginBottom: 12, fontSize: 'var(--wa-type-meta)' }}
        />

        <label htmlFor={zoomInputId} className="wa-kit-meta" style={{ display: 'block', marginBottom: 4 }}>
          Zoom
        </label>
        <input
          id={zoomInputId}
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          disabled={!selectedFile || busy}
          style={{ width: '100%', marginBottom: 16 }}
        />

        {error ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)', fontWeight: 600, marginBottom: 12 }}
          >
            {error}
          </p>
        ) : null}

        <div className="wa-flex wa-flex-wrap wa-gap-2 wa-justify-end">
          {currentUrl ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
            >
              {removing ? 'Removing…' : 'Remove photo'}
            </button>
          ) : null}
          <button type="button" onClick={closeDialog} disabled={busy} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedFile || busy}
            aria-busy={saving}
            className="wa-kit-cta wa-kit-focus"
          >
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
