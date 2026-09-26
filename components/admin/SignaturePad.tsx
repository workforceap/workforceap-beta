'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SignatureValue =
  | { kind: 'drawn'; dataUrl: string }
  | { kind: 'typed'; name: string }
  | null;

/**
 * Signature capture for the J5/J6 signing step. Two modes:
 *  - Draw: pointer-drawn signature on a canvas, exported as a transparent PNG.
 *  - Type: the signer types their name and confirms it counts as a signature.
 * Works with mouse, touch and pen (pointer events). No external library.
 */
export default function SignaturePad({
  signerName,
  value,
  onChange,
}: {
  signerName: string;
  value: SignatureValue;
  onChange: (next: SignatureValue) => void;
}) {
  const [mode, setMode] = useState<'draw' | 'type'>(value?.kind === 'typed' ? 'type' : 'draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = false;
    last.current = null;
    hasInk.current = false;
    // Keep dense signatures below the signed PNG's byte limit on high-density screens.
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1b2a6b';
  }, []);

  useEffect(() => {
    if (mode !== 'draw') return;
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, setupCanvas, signerName]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    onChange({ kind: 'drawn', dataUrl: canvas.toDataURL('image/png') });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    // A tap with no movement still counts as a dot.
    if (last.current && !hasInk.current) {
      const ctx = e.currentTarget.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#1b2a6b';
        ctx.fill();
        hasInk.current = true;
      }
    }
    last.current = null;
    commit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange(null);
  };

  const switchMode = (next: 'draw' | 'type') => {
    setMode(next);
    onChange(null);
  };

  const typedConfirmed = value?.kind === 'typed';

  return (
    <div className="wa-kit-card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={`btn ${mode === 'draw' ? '' : 'btn-outline'}`}
          style={{ minHeight: 40 }}
          onClick={() => switchMode('draw')}
          aria-pressed={mode === 'draw'}
        >
          Draw signature
        </button>
        <button
          type="button"
          className={`btn ${mode === 'type' ? '' : 'btn-outline'}`}
          style={{ minHeight: 40 }}
          onClick={() => switchMode('type')}
          aria-pressed={mode === 'type'}
        >
          Type name instead
        </button>
      </div>

      {mode === 'draw' ? (
        <>
          <canvas
            // A different signer gets a fresh bitmap; the effect above also
            // clears hasInk so a click cannot recapture the previous drawing.
            key={signerName}
            ref={canvasRef}
            role="img"
            aria-label="Signature drawing area. Draw your signature with a mouse, finger, or pen."
            style={{
              width: '100%',
              maxWidth: 520,
              height: 160,
              display: 'block',
              background: '#fff',
              border: '1px dashed var(--outline-variant, #cbd5e1)',
              borderRadius: 10,
              touchAction: 'none',
              cursor: 'crosshair',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={(e) => {
              if (drawing.current) onPointerUp(e);
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" style={{ minHeight: 36 }} onClick={clear}>
              Clear
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #64748b)' }}>
              {value?.kind === 'drawn' ? 'Signature captured.' : 'Sign above the line, then release to capture.'}
            </span>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <p
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontSize: '1.75rem',
              color: '#1b2a6b',
              margin: 0,
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid var(--outline-variant, #cbd5e1)',
              maxWidth: 520,
            }}
            aria-live="polite"
          >
            {signerName || 'Your name'}
          </p>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.9rem', lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={typedConfirmed}
              onChange={(e) => onChange(e.target.checked ? { kind: 'typed', name: signerName } : null)}
              style={{ marginTop: 4 }}
            />
            <span>
              I, <strong>{signerName || 'the signer'}</strong>, am signing these documents by typing my name, and I intend this to
              be my legal signature.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
