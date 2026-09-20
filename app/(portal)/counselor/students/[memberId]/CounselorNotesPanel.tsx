'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import {
  MEMBER_REQUEST_FAILURE,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import styles from './notesPanel.module.css';

/**
 * Notes card on the counselor student record (Notes tab). Kit chrome:
 * `.wa-kit-card` + `.wa-kit-stat-label` card head + `.wa-kit-meta` captions;
 * layout in notesPanel.module.css (`--wa-*` only, 13px floor). The heading
 * stays an h3 — the page's Notes panel owns the h2 above this card.
 *
 * Loading follows the #2404 pattern: `fetchWithTimeout` with the effect's
 * AbortSignal, so a hung request fails visibly and a request cancelled by a
 * re-render or unmount never paints "Couldn't load notes". Failures read as
 * one plain sentence from lib/portal/memberRequestFailure, never the server body.
 */

/** Long enough for a slow notes read, short enough that a hung request still fails visibly. */
const NOTES_REQUEST_TIMEOUT_MS = 15000;

interface Note {
  id: string;
  content: string;
  createdAt: string;
  author: { fullName: string | null; email: string };
  /** Server-side author gate: DELETE 404s for anyone else's note. */
  canDelete?: boolean;
}

export default function CounselorNotesPanel({ memberId }: { memberId: string }) {
  const tCommon = useTranslations('common');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const draftRevision = useRef(0);
  const notesRevision = useRef(0);
  const saveInFlight = useRef(false);
  const loadRequest = useRef(0);

  const fetchNotes = useCallback(async (signal?: AbortSignal) => {
    const request = ++loadRequest.current;
    const revision = notesRevision.current;
    /** False once a newer load started or this one was cancelled — then nothing may paint. */
    const current = () => request === loadRequest.current && !signal?.aborted;
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/notes`, { signal }, NOTES_REQUEST_TIMEOUT_MS);
      if (!current()) return;
      if (!res.ok) {
        setFetchError(await readMemberRequestFailure(res));
        return;
      }
      const data = await res.json();
      if (!current() || revision !== notesRevision.current) return;
      if (Array.isArray(data)) setNotes(data);
      else setFetchError(MEMBER_REQUEST_FAILURE.generic);
    } catch (e) {
      // Cancelled by a re-render or unmount: not a failure, and nothing to paint.
      if (!current()) return;
      setFetchError(describeMemberRequestException(e));
    } finally {
      if (current()) setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNotes(controller.signal);
    return () => {
      controller.abort();
      loadRequest.current += 1;
    };
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
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/notes`, {
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
      setError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Error saving note' }, 'counselor-note'));
    } finally {
      saveInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    setDeleteError('');
    setDeleting(true);
    try {
      const res = await fetchWithTimeout(`/api/counselor/members/${memberId}/notes`, {
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
    <div className="wa-kit-card">
      <div className={styles.head}>
        <h3 className={`wa-kit-stat-label ${styles.title}`}>Counselor Notes</h3>
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
        <div className={styles.compose}>
          <label htmlFor={`counselor-note-${memberId}`} className="wa-sr-only">
            Counselor note
          </label>
          <textarea
            id={`counselor-note-${memberId}`}
            value={newNote}
            onChange={(e) => { draftRevision.current += 1; setNewNote(e.target.value); setSaveStatus(''); }}
            maxLength={5000}
            placeholder="Write a note about this member..."
            rows={3}
            className={styles.textarea}
          />
          {error && <p role="alert" className={styles.alert}>{error}</p>}
          <div className={styles.actions}>
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

      {saveStatus && <p role="status" className={`wa-kit-meta ${styles.status}`}>{saveStatus}</p>}

      {deleteError && (
        <p className={styles.alert}>
          {deleteError}
        </p>
      )}

      {fetchError && (
        <p role="alert" className={styles.alert}>
          Couldn’t load notes. {fetchError}{' '}
          <button type="button" className={styles.addButton} onClick={() => void fetchNotes()} disabled={loading}>
            {loading ? 'Loading…' : 'Try again'}
          </button>
        </p>
      )}

      {loading && <p className={`wa-kit-meta ${styles.status}`}>Loading notes…</p>}

      {!loading && !fetchError && notes.length === 0 && !adding && (
        <p className={`wa-kit-meta ${styles.empty}`}>
          No notes yet. Add one to track progress.
        </p>
      )}

      <div className={styles.list}>
        {notes.map((note) => (
          <div key={note.id} className={styles.note}>
            <div className={styles.noteHead}>
              <p className={`wa-kit-meta ${styles.noteMeta}`}>
                {new Date(note.createdAt).toLocaleDateString('en-US')} · {note.author.fullName ?? note.author.email}
              </p>
              {note.canDelete ? (
                <button type="button"
                  onClick={() => setConfirmDeleteId(note.id)}
                  className={styles.deleteButton}
                  title="Delete note"
                  aria-label="Delete note"
                >
                  ×
                </button>
              ) : null}
            </div>
            <p className={styles.noteBody}>
              {note.content}
            </p>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete note?"
        body="This note will be permanently deleted. This cannot be undone."
        confirmLabel="Delete note"
        danger
        busy={deleting}
        onConfirm={() => { if (confirmDeleteId) handleDelete(confirmDeleteId); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
