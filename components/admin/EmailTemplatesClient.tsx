'use client';

import { useState, useCallback } from 'react';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';

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
};

export default function EmailTemplatesClient({ templates: initialTemplates, adminEmail }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Template>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [customVars, setCustomVars] = useState<Record<string, string>>({});
  // Kit trap for the edit modal: Tab containment + Escape + focus restore.
  const editDialogRef = useFocusTrap<HTMLDivElement>(!!editingId, { onEscape: () => setEditingId(null) });
  const [search, setSearch] = useState('');

  const selected = templates.find((t) => t.id === selectedId);

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

  const handleTestSend = async (id: string) => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: adminEmail, variables: customVars }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Send failed');
      }
      setTestResult({ ok: true, message: `Test email sent to ${adminEmail}` });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Send failed',
      });
    } finally {
      setTestSending(false);
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
                      disabled={testSending}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '0.875rem' }}
                      >
                        send
                      </span>
                      {testSending ? 'Sending…' : 'Test Send'}
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
              {testResult && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '0.75rem',
                    background: testResult.ok
                      ? 'rgba(74,155,79,0.08)'
                      : 'rgba(173,44,77,0.08)',
                    border: `1px solid ${
                      testResult.ok
                        ? 'rgba(74,155,79,0.2)'
                        : 'rgba(173,44,77,0.2)'
                    }`,
                    fontSize: '0.8125rem',
                    color: testResult.ok
                      ? 'var(--color-green, #4a9b4f)'
                      : 'var(--color-accent)',
                  }}
                >
                  {testResult.message}
                </div>
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
            <div
              className="admin-empty-state"
              style={{ textAlign: 'center', padding: '3rem 1rem' }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '2.5rem',
                  color: 'var(--color-on-surface-variant)',
                  marginBottom: '0.75rem',
                  display: 'block',
                }}
              >
                mail
              </span>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
                Select a template
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                Click any template on the left to preview, edit, or send a test.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editingId && (
        <div
          ref={editDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Edit email template"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingId(null);
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '1rem',
              width: '100%',
              maxWidth: '42rem',
              maxHeight: '90vh',
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--outline-variant)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>Edit Template</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingId(null)}
                aria-label="Close"
              >
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>

            <div
              style={{
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div>
                <label
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

            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--outline-variant)',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              {saveError ? (
                <p role="alert" style={{ margin: 0, marginRight: 'auto', fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
                  {saveError}
                </p>
              ) : null}
              <button
                className="btn btn-outline"
                onClick={() => setEditingId(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
