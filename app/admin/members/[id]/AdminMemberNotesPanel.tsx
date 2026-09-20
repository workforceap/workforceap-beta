'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_FAILURE,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';
import styles from './notesPanel.module.css';

/**
 * Admin member record — Notes tab card. Reuses the counselor notes panel
 * pattern (`app/(portal)/counselor/students/[memberId]/CounselorNotesPanel`)
 * on the existing admin route `/api/admin/members/[id]/notes` (GET list,
 * POST { content }); that route has no DELETE, so none is offered here.
 * Kit chrome: `.wa-kit-card` + `.wa-kit-stat-label` head + `.wa-kit-meta`
 * captions; layout in notesPanel.module.css (`--wa-*` only, 13px floor).
 * The heading is an h3 — the page's Notes panel owns the h2 above this card.
 */

const NOTES_REQUEST_TIMEOUT_MS = 15000;

interface Note {
  id: string;
  content: string;
  createdAt: string;
  author: { fullName: string | null; email: string };
}

export default function AdminMemberNotesPanel({ memberId }: { memberId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const saveInFlight = useRef(false);
  const loadRequest = useRef(0);

  const fetchNotes = useCallback(async (signal?: AbortSignal) => {
    const request = ++loadRequest.current;
    const current = () => request === loadRequest.current && !signal?.aborted;
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetchWithTimeout(`/api/admin/members/${memberId}/notes`, { signal }, NOTES_REQUEST_TIMEOUT_MS);
      if (!current()) return;
      if (!res.ok) {
        setFetchError(await readMemberRequestFailure(res));
        return;
      }
      const data: unknown = await res.json();
      if (!current()) return;
      if (Array.isArray(data)) setNotes(data as Note[]);
      else setFetchError(MEMBER_REQUEST_FAILURE.generic);
    } catch (e) {
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
    const content = newNote.trim();
    if (!content || saveInFlight.current) return;
    saveInFlight.current = true;
    setSubmitting(true);
    setError('');
    setSaveStatus('');
    try {
      const res = await fetchWithTimeout(`/api/admin/members/${memberId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }, NOTES_REQUEST_TIMEOUT_MS);
      if (!res.ok) {
        setError(await readMemberRequestFailure(res));
        return;
      }
      const note = (await res.json()) as Note;
      setNotes((prev) => [note, ...prev.filter((existing) => existing.id !== note.id)]);
      setNewNote('');
      setAdding(false);
      setSaveStatus('Note saved.');
    } catch (e) {
      setError(describeMemberRequestException(e));
    } finally {
      saveInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={`wa-kit-stat-label ${styles.title}`}>Staff notes</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setSaveStatus(''); }}
            className="btn btn-outline btn-sm"
          >
            + Add note
          </button>
        )}
      </div>

      {adding && (
        <div className={styles.compose}>
          <label htmlFor={`admin-member-note-${memberId}`} className="wa-sr-only">
            Staff note
          </label>
          <textarea
            id={`admin-member-note-${memberId}`}
            value={newNote}
            onChange={(e) => { setNewNote(e.target.value); setSaveStatus(''); }}
            maxLength={5000}
            placeholder="Write a note about this member…"
            rows={3}
            className={styles.textarea}
          />
          {error && <p role="alert" className={styles.alert}>{error}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleAdd}
              disabled={submitting || !newNote.trim()}
              className="btn btn-primary btn-sm"
            >
              {submitting ? 'Saving…' : 'Save note'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => { setAdding(false); setNewNote(''); setError(''); setSaveStatus(''); }}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveStatus && <p role="status" className={`wa-kit-meta ${styles.status}`}>{saveStatus}</p>}

      {fetchError && (
        <p role="alert" className={styles.alert}>
          Couldn’t load notes. {fetchError}{' '}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void fetchNotes()} disabled={loading}>
            {loading ? 'Loading…' : 'Try again'}
          </button>
        </p>
      )}

      {loading && <p className={`wa-kit-meta ${styles.status}`}>Loading notes…</p>}

      {!loading && !fetchError && notes.length === 0 && !adding && (
        <p className={`wa-kit-meta ${styles.empty}`}>
          No staff notes yet. Add one to record context other admins and counselors should see.
        </p>
      )}

      <div className={styles.list}>
        {notes.map((note) => (
          <div key={note.id} className={styles.note}>
            <p className={`wa-kit-meta ${styles.noteMeta}`}>
              {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {note.author?.fullName ?? note.author?.email ?? 'Staff'}
            </p>
            <p className={styles.noteBody}>{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
