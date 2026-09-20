'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import styles from './notesPanel.module.css';

interface SessionNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: { fullName: string | null; email: string };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdvisorSessionNotesPanel({ memberId }: { memberId: string }) {
  const tCommon = useTranslations('common');
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const draftRevision = useRef(0);
  const notesRevision = useRef(0);
  const saveInFlight = useRef(false);
  const loadRequest = useRef(0);

  const fetchNotes = useCallback(async () => {
    const request = ++loadRequest.current;
    const revision = notesRevision.current;
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/session-notes`, {}, 15000);
      if (request !== loadRequest.current) return;
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = await res.json();
      if (request === loadRequest.current && revision === notesRevision.current) {
        if (Array.isArray(data)) setNotes(data);
        else setFetchError(true);
      }
    } catch {
      if (request === loadRequest.current) setFetchError(true);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void fetchNotes();
    return () => { loadRequest.current += 1; };
  }, [fetchNotes]);

  const handleAdd = async () => {
    if (!newNote.trim() || saveInFlight.current) return;
    const submittedRevision = draftRevision.current;
    const submittedContent = newNote.trim();
    saveInFlight.current = true;
    setSubmitting(true);
    setError('');
    setSaveStatus('');
    try {
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/session-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: submittedContent }),
      }, 15000);
      if (!res.ok) throw new Error('Failed to save note');
      const note = await res.json();
      notesRevision.current += 1;
      setNotes((prev) => [note, ...prev.filter((existing) => existing.id !== note.id)]);
      if (draftRevision.current === submittedRevision) {
        setNewNote('');
        setAdding(false);
        setSaveStatus('Note saved.');
      } else {
        setSaveStatus('Note saved. Your newer edits are still unsaved.');
      }
    } catch (e) {
      setError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Error saving note' }, 'advisor-session-note'));
    } finally {
      saveInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    setDeleteError('');
    setDeleting(true);
    try {
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/session-notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      }, 15000);
      if (!res.ok) throw new Error('Failed to delete note');
      notesRevision.current += 1;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      setDeleteError('Could not delete note. Please try again.');
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div style={{
      background: 'var(--surface-container, #fff)',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      border: '1px solid var(--outline-variant, #ebe7e7)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: 0 }}>
          Session Notes
        </h3>
        {!adding && (
          <button type="button"
            onClick={() => { setAdding(true); setSaveStatus(''); }}
            className={styles.addButton}
          >
            + Add Note
          </button>
        )}
      </div>

      {adding && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor={`session-note-${memberId}`} className="wa-sr-only">
            Session note
          </label>
          <textarea
            id={`session-note-${memberId}`}
            value={newNote}
            onChange={(e) => { draftRevision.current += 1; setNewNote(e.target.value); setSaveStatus(''); }}
            maxLength={5000}
            placeholder="Write a session note about this member..."
            rows={4}
            style={{
              width: '100%',
              border: '1px solid var(--outline-variant)',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'inherit',
              resize: 'vertical',
              background: 'var(--surface-container-low)',
              color: 'var(--color-on-surface)',
              boxSizing: 'border-box',
            }}
          />
          {error && <p role="alert" style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', margin: '0.25rem 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button"
              onClick={handleAdd}
              disabled={submitting || !newNote.trim()}
              className={styles.saveButton}
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button"
              disabled={submitting}
              onClick={() => { draftRevision.current += 1; setAdding(false); setNewNote(''); setError(''); setSaveStatus(''); }}
              className={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveStatus && <p role="status" style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}>{saveStatus}</p>}

      {deleteError && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', margin: '0 0 0.5rem' }}>
          {deleteError}
        </p>
      )}

      {fetchError && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-accent, #b00020)', margin: '0 0 0.5rem' }}>
          Couldn’t load notes.{' '}
          <button type="button" className={styles.addButton} onClick={() => void fetchNotes()} disabled={loading}>
            {loading ? 'Loading…' : 'Try again'}
          </button>
        </p>
      )}

      {loading && <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Loading notes…</p>}

      {!loading && !fetchError && notes.length === 0 && !adding && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
          No session notes yet. Add one to track progress.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {notes.map((note) => (
          <div key={note.id} style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: '0.75rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                {formatDateTime(note.createdAt)} · {note.author.fullName ?? note.author.email}
              </p>
              <button type="button"
                onClick={() => setConfirmDeleteId(note.id)}
                className={styles.deleteButton}
                title="Delete note"
                aria-label="Delete note"
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: 0, whiteSpace: 'pre-wrap' }}>
              {note.content}
            </p>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete session note?"
        body="This session note will be permanently deleted. This cannot be undone."
        confirmLabel="Delete note"
        danger
        busy={deleting}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
