'use client';

import { useState, useEffect } from 'react';
import type { CertTrack } from '@/lib/content/certificationTracks';
import { CERTIFICATION_TRACKS } from '@/lib/content/certificationTracks';

const SKELETON_BAR: React.CSSProperties = {
  borderRadius: '0.35rem',
  background: 'var(--surface-container-high)',
  animation: 'cert-roadmap-pulse 1.4s ease-in-out infinite',
};

/** Shaped placeholder — mirrors the track-card / cert-item layout so the
 * page doesn't jump when real data arrives. */
function CertificationRoadmapSkeleton() {
  return (
    <div className="certification-roadmap">
      <p role="status" className="sr-only">
        Loading certifications…
      </p>
      <div aria-hidden="true" style={{ ...SKELETON_BAR, height: '0.9rem', width: '70%', marginBottom: '1.5rem' }} />
      <div className="certification-tracks" aria-hidden="true">
        {[0, 1].map((trackIdx) => (
          <div
            key={trackIdx}
            className="cert-track-card"
            style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}
          >
            <div style={{ ...SKELETON_BAR, height: '1.1rem', width: '45%', marginBottom: '1rem' }} />
            <ul className="cert-track-list">
              {[0, 1, 2].map((itemIdx) => (
                <li
                  key={itemIdx}
                  className="cert-item"
                  style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}
                >
                  <div style={{ ...SKELETON_BAR, height: '1rem', width: '60%', marginBottom: '0.6rem' }} />
                  <div style={{ ...SKELETON_BAR, height: '0.75rem', width: '40%', marginLeft: '1.85rem' }} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <style>{`@keyframes cert-roadmap-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

export default function CertificationRoadmap() {
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/member/certifications')
      .then((res) => res.json())
      .then((data) => {
        if (data.certifications) {
          const rows = data.certifications as Array<{ certName: string; status?: string }>;
          setEarned(new Set(rows.map((c) => c.certName)));
          setVerified(new Set(rows.filter((c) => c.status === 'approved').map((c) => c.certName)));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async (certName: string, currentlyEarned: boolean) => {
    if (currentlyEarned && verified.has(certName)) return;
    const newEarned = !currentlyEarned;
    setEarned((prev) => {
      const next = new Set(prev);
      if (newEarned) next.add(certName);
      else next.delete(certName);
      return next;
    });
    const res = await fetch('/api/member/certifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certName, earned: newEarned }),
    });
    if (!res.ok) {
      setEarned((prev) => {
        const next = new Set(prev);
        if (newEarned) next.delete(certName);
        else next.add(certName);
        return next;
      });
    }
  };

  if (loading) return <CertificationRoadmapSkeleton />;

  return (
    <div className="certification-roadmap">
      <p className="certification-intro" style={{ marginBottom: '1.5rem', color: 'var(--color-on-surface-variant)' }}>
        Track your progress toward industry-recognized certificates. Mark certs as earned when you complete them.
      </p>
      <div className="certification-tracks">
        {CERTIFICATION_TRACKS.map((track) => (
          <CertTrackCard
            key={track.id}
            track={track}
            earned={earned}
            verified={verified}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}

function CertTrackCard({
  track,
  earned,
  verified,
  onToggle,
}: {
  track: CertTrack;
  earned: Set<string>;
  verified: Set<string>;
  onToggle: (certName: string, currentlyEarned: boolean) => void;
}) {
  return (
    <div
      className="cert-track-card"
      style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }}
    >
      <h3 className="cert-track-title">{track.name}</h3>
      <ul className="cert-track-list">
        {track.certs.map((cert) => {
          const isEarned = earned.has(cert.name);
          const isVerified = verified.has(cert.name);
          return (
            <li
              key={cert.name}
              className={`cert-item ${isEarned ? 'cert-item-earned' : ''}`}
              style={{
                background: isEarned ? 'rgba(74,155,79,0.12)' : 'var(--surface-container-lowest)',
                border: `1px solid ${isEarned ? 'var(--color-green)' : 'var(--outline-variant)'}`,
              }}
            >
              <label className="cert-item-row" style={{ minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={isEarned}
                  disabled={isVerified}
                  title={isVerified ? 'Verified by staff' : undefined}
                  onChange={() => onToggle(cert.name, isEarned)}
                  className="cert-checkbox"
                />
                <span className="cert-name">{cert.name}</span>
              </label>
              <div className="cert-meta">
                <span>{cert.cost}</span>
                <span>•</span>
                <span>{cert.timeToComplete}</span>
              </div>
              <a
                href={cert.link}
                target="_blank"
                rel="noopener noreferrer"
                className="cert-link"
              >
                Official info →
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
