'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { emailTemplateTestAttemptAge, emailTemplateTestStorageKey, readEmailTemplateTestAttempt, type EmailTemplateTestAttempt } from '@/lib/admin/emailTemplateTestAttempt';

type Template = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type PreviewResponse = {
  id: string;
  key: string;
  name: string;
  subject: string;
  html: string;
  variables: string[];
  sampleData: Record<string, string>;
};

type Props = {
  templates: Template[];
  adminEmail: string;
  adminUserId: string;
};

export default function EmailTemplatesClient(props: Props) {
  // A changed Auth actor gets independent refs and state, even with the same email.
  return <ActorEmailTemplatesClient key={props.adminUserId} {...props} />;
}

function ActorEmailTemplatesClient({ templates: initialTemplates, adminEmail, adminUserId }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Template>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ templateId: string; ok: boolean; message: string } | null>(null);
  const [pendingTests, setPendingTests] = useState<Record<string, EmailTemplateTestAttempt>>({});
  const pendingTestsRef = useRef<Record<string, EmailTemplateTestAttempt>>({});
  const testSendingRef = useRef(false);
  const mountedRef = useRef(true);
  const [retryStateReady, setRetryStateReady] = useState(false);
  const [retryStateError, setRetryStateError] = useState<string | null>(null);
  const [customVars, setCustomVars] = useState<Record<string, string>>({});
  // Edit modal is an Astryx Dialog (native <dialog>): scrim, focus trap,
  // Escape, focus restore and --z-* stacking come from the design system
  // (WAP-137). Dismissal is blocked while a save is in flight.
  const handleEditOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !saving) setEditingId(null);
  };
  const [search, setSearch] = useState('');

  const selected = templates.find((t) => t.id === selectedId);
  const pendingTest = selectedId ? pendingTests[selectedId] : undefined;
  const retryExpired = pendingTest && emailTemplateTestAttemptAge(pendingTest) !== 'valid';
  const displayedTestResult = (testResult?.templateId === selectedId ? testResult : null) ?? (retryStateError ? { ok: false, message: retryStateError }
    : pendingTest ? { ok: false, message: retryExpired
      ? 'The retry window expired. Check the previous test in your inbox before sending a new test.'
      : 'The previous test outcome is not confirmed. Retry the same test to recover its provider receipt.' } : null);

  useEffect(() => {
    mountedRef.current = true;
    try {
      const raw = sessionStorage.getItem(emailTemplateTestStorageKey(adminUserId));
      const saved: unknown = raw ? JSON.parse(raw) : {};
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved state');
      const restored: Record<string, EmailTemplateTestAttempt> = {};
      for (const [id, value] of Object.entries(saved)) {
        const attempt = readEmailTemplateTestAttempt(value);
        if (!attempt || attempt.actorId !== adminUserId || attempt.templateId !== id) throw new Error('Invalid saved attempt');
        restored[id] = attempt;
      }
      pendingTestsRef.current = restored;
      setPendingTests(restored);
      setRetryStateReady(true);
    } catch {
      setRetryStateError('Saved test state could not be read. No new test was sent. Check your inbox before clearing saved browser state.');
    }
    return () => { mountedRef.current = false; };
  }, [adminUserId]);

  const loadPreview = useCallback(async (id: string, vars?: Record<string, string>) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: vars }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {
      console.error('Preview load failed:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setPreviewData(null);
    setTestResult(null);
    setCustomVars({});
    loadPreview(id);
  };

  const handleEdit = (t: Template) => {
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      subject: t.subject,
      body: t.body,
      variables: [...t.variables],
      active: t.active,
    });
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          subject: editForm.subject,
          body: editForm.body,
          variables: editForm.variables,
          active: editForm.active,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === editingId
            ? {
                ...t,
                name: updated.name,
                subject: updated.subject,
                body: updated.body,
                variables: updated.variables,
                active: updated.active,
                updatedAt: updated.updatedAt,
              }
            : t
        )
      );
      setEditingId(null);
      if (selectedId === editingId) {
        loadPreview(editingId, customVars);
      }
    } catch (e) {
      console.error('Save failed:', e);
      setSaveError('Failed to save template — try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async (id: string, startNew = false) => {
    // React's disabled state is not committed until the event returns.
    if (testSendingRef.current || !retryStateReady || retryStateError) return;
    testSendingRef.current = true;
    setTestSending(true);
    setTestResult(null);
    try {
      const current = templates.find(t => t.id === id);
      if (!current) throw new Error('Template is no longer available.');
      const attempt = (!startNew && pendingTestsRef.current[id]) || readEmailTemplateTestAttempt({
        actorId: adminUserId, templateId: id, attemptId: `${Date.now()}-${crypto.randomUUID()}`,
        templateUpdatedAt: current.updatedAt, to: adminEmail, variables: { ...customVars },
      });
      if (!attempt) throw new Error('Test inputs are invalid or too large. No test was sent.');
      if (emailTemplateTestAttemptAge(attempt) !== 'valid') throw new Error('The retry window expired. Check the previous test before sending a new test.');
      const saved = { ...pendingTestsRef.current, [id]: attempt };
      // Persist before any egress. Storage failure must not leave an accepted
      // operation without its retry key after a reload.
      try { sessionStorage.setItem(emailTemplateTestStorageKey(adminUserId), JSON.stringify(saved)); }
      catch { throw new Error('Retry state could not be saved. No test was sent.'); }
      pendingTestsRef.current = saved;
      setPendingTests(saved);
      const response = await fetchWithTimeout(`/api/admin/email-templates/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt),
      }, 30_000, async res => ({ ok: res.ok, body: await res.json() }));
      // The request may finish after logout/relogin or navigation. Leave its
      // saved operation intact rather than clearing another mounted view's state.
      if (!mountedRef.current) return;
      if (!response.ok || response.body?.ok !== true || typeof response.body?.providerMessageId !== 'string' || !response.body.providerMessageId.trim()) {
        throw new Error(response.body?.error || 'Retry the same test to recover its provider receipt.');
      }
      const remaining = { ...pendingTestsRef.current };
      delete remaining[id];
      let cleanupWarning = '';
      try {
        sessionStorage.setItem(emailTemplateTestStorageKey(adminUserId), JSON.stringify(remaining));
        pendingTestsRef.current = remaining;
        setPendingTests(remaining);
      } catch { cleanupWarning = ' Saved retry state could not be cleared; this receipt is confirmed.'; }
      setTestResult({ templateId: id, ok: true, message: `Test accepted by the email provider for ${attempt.to}.${cleanupWarning}` });
    } catch (e) {
      if (!mountedRef.current) return;
      const error = e instanceof Error ? e.message : 'Request failed';
      setTestResult({
        templateId: id,
        ok: false,
        message: pendingTestsRef.current[id] ? `Test outcome is not confirmed. ${error}` : error,
      });
    } finally {
      testSendingRef.current = false;
      if (mountedRef.current) setTestSending(false);
    }
  };

  const handleVarChange = (key: string, value: string) => {
    setCustomVars((prev) => {
      const next = { ...prev, [key]: value };
      if (selectedId) {
        loadPreview(selectedId, next);
      }
      return next;
    });
  };

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.key.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '24rem' }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '1rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface)',
              color: 'var(--color-on-surface)',
              fontSize: '0.875rem',
            }}
          />
        </div>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {filtered.length} of {templates.length} templates
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Template list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              style={{
                textAlign: 'left',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                border:
                  selectedId === t.id
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--outline-variant)',
                background:
                  selectedId === t.id
                    ? 'rgba(173,44,77,0.06)'
                    : 'var(--surface)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {t.name}
                </span>
                {!t.active && (
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '9999px',
                      background: 'var(--surface-container-high)',
                      color: 'var(--color-on-surface-variant)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Inactive
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                  lineHeight: 1.4,
                }}
              >
                {t.subject}
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {t.variables.length > 0 ? (
                  t.variables.map((v) => (
                    <code
                      key={v}
                      style={{
                        background: 'var(--surface-container)',
                        padding: '0.05rem 0.3rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {'{'}{v}{'}'}
                    </code>
                  ))
                ) : (
                  <span>No variables</span>
                )}
                <span>·</span>
                <span>Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div
              className="admin-empty-state"
              style={{ textAlign: 'center', padding: '2rem' }}
            >
              <p style={{ color: 'var(--color-on-surface-variant)' }}>
                No templates match your search.
              </p>
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div
          style={{
            position: 'sticky',
            top: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            maxHeight: 'calc(100vh - 2rem)',
            overflow: 'auto',
          }}
        >
          {selected ? (
            <>
              {/* Header */}
              <div
                className="portal-card portal-card--flat"
                style={{ padding: '1rem 1.125rem' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: '0 0 0.25rem',
                        fontSize: '1rem',
                        fontWeight: 700,
                      }}
                    >
                      {selected.name}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8125rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      Key: <code>{selected.key}</code>
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleEdit(selected)}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '0.875rem' }}
                      >
                        edit
                      </span>
                      Edit
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleTestSend(selected.id)}
                      disabled={testSending || !retryStateReady || !!retryStateError || !!retryExpired}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                        style={{ fontSize: '0.875rem' }}
                      >
                        send
                      </span>
                      {testSending ? 'Sending…' : pendingTest ? 'Retry Same Test' : 'Test Send'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Variables */}
              {selected.variables.length > 0 && (
                <div
                  className="portal-card portal-card--flat"
                  style={{ padding: '1rem 1.125rem' }}
                >
                  <h4
                    style={{
                      margin: '0 0 0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                    }}
                  >
                    Sample Variables
                  </h4>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.625rem',
                    }}
                  >
                    {selected.variables.map((v) => (
                      <div key={v}>
                        <label
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: 'var(--color-on-surface-variant)',
                            display: 'block',
                            marginBottom: '0.25rem',
                          }}
                        >
                          {'{'}{v}{'}'}
                        </label>
                        <input
                          type="text"
                          value={customVars[v] ?? previewData?.sampleData?.[v] ?? ''}
                          onChange={(e) => handleVarChange(v, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem 0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid var(--outline-variant)',
                            background: 'var(--surface)',
                            color: 'var(--color-on-surface)',
                            fontSize: '0.8125rem',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Test result */}
              {displayedTestResult && (
                <div
                  role={displayedTestResult.ok ? 'status' : 'alert'}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '0.75rem',
                    background: displayedTestResult.ok
                      ? 'rgba(74,155,79,0.08)'
                      : 'rgba(173,44,77,0.08)',
                    border: `1px solid ${
                      displayedTestResult.ok
                        ? 'rgba(74,155,79,0.2)'
                        : 'rgba(173,44,77,0.2)'
                    }`,
                    fontSize: '0.8125rem',
                    color: displayedTestResult.ok
                      ? 'var(--wa-success-dark)'
                      : 'var(--color-accent)',
                  }}
                >
                  {displayedTestResult.message}
                </div>
              )}
              {pendingTest && (
                <>
                  <p className="wa-kit-meta">A new test may send a second message. Check your inbox first; it uses the current variables and template.</p>
                  <Button label="Send a New Test" variant="secondary" isDisabled={testSending || !retryStateReady || !!retryStateError} onClick={() => handleTestSend(selected.id, true)} />
                </>
              )}

              {/* Preview */}
              <div
                className="portal-card portal-card--flat"
                style={{ padding: '1rem 1.125rem' }}
              >
                <h4
                  style={{
                    margin: '0 0 0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  Preview
                </h4>
                {previewLoading ? (
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Loading preview…
                  </p>
                ) : previewData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        Subject
                      </span>
                      <p
                        style={{
                          margin: '0.25rem 0 0',
                          fontSize: '0.9375rem',
                          fontWeight: 600,
                        }}
                      >
                        {previewData.subject}
                      </p>
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        Body
                      </span>
                      <div
                        style={{
                          marginTop: '0.5rem',
                          border: '1px solid var(--outline-variant)',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                        }}
                      >
                        <iframe
                          title="Email preview"
                          srcDoc={previewData.html}
                          style={{
                            width: '100%',
                            height: '400px',
                            border: 'none',
                            background: 'white',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Select a template to preview.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="admin-empty-state" style={{ padding: '1.5rem 1rem' }}>
              <KitEmptyState
                title="Select a template"
                description="Click any template on the left to preview, edit, or send a test."
              />
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      <Dialog isOpen={!!editingId} onOpenChange={handleEditOpenChange} purpose="form" width={672} maxHeight="90dvh" aria-label="Edit email template">
        <Layout
          header={<DialogHeader title="Edit Template" onOpenChange={saving ? undefined : handleEditOpenChange} />}
          content={
            <LayoutContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-busy={saving}>
              <div>
                <label
                  htmlFor="email-template-name"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '0.375rem',
                  }}
                >
                  Name
                </label>
                <input
                  id="email-template-name"
                  type="text"
                  value={editForm.name ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface)',
                    color: 'var(--color-on-surface)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="email-template-subject"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '0.375rem',
                  }}
                >
                  Subject
                </label>
                <input
                  id="email-template-subject"
                  type="text"
                  value={editForm.subject ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, subject: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface)',
                    color: 'var(--color-on-surface)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="email-template-body"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '0.375rem',
                  }}
                >
                  Body (HTML)
                </label>
                <textarea
                  id="email-template-body"
                  value={editForm.body ?? ''}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, body: e.target.value }))
                  }
                  rows={12}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface)',
                    color: 'var(--color-on-surface)',
                    fontSize: '0.875rem',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="email-template-variables"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: '0.375rem',
                  }}
                >
                  Variables (comma-separated)
                </label>
                <input
                  id="email-template-variables"
                  type="text"
                  value={(editForm.variables ?? []).join(', ')}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      variables: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface)',
                    color: 'var(--color-on-surface)',
                    fontSize: '0.875rem',
                  }}
                />
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-on-surface-variant)',
                    margin: '0.375rem 0 0',
                  }}
                >
                  Use {'{variableName}'} syntax in subject and body.
                </p>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!editForm.active}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                Active
              </label>
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                {saveError ? (
                  <p role="alert" style={{ margin: 0, marginRight: 'auto', fontSize: '0.85rem', color: 'var(--wa-danger)' }}>
                    {saveError}
                  </p>
                ) : null}
                <Button type="button" label="Cancel" variant="secondary" isDisabled={saving} onClick={() => setEditingId(null)} />
                <Button type="button" label={saving ? 'Saving…' : 'Save Changes'} variant="primary" isDisabled={saving} isLoading={saving} onClick={() => void handleSave()} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </div>
  );
}
