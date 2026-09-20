'use client';

import { useCallback, useState } from 'react';

type EndpointResult = {
  label: string;
  url: string;
  status: number | 'ERROR';
  message?: string;
  payloadPreview?: string;
};

type ClientProbe = {
  method: string;
  ok: boolean;
  detail: string;
  preview?: string;
};

type SelfTestResult = {
  ok: boolean;
  ranAt: string;
  targetBaseUrl: string;
  inbound: {
    tokenOk: boolean | null;
    tokenDetail: string;
    statementOk: boolean | null;
    statementDetail: string;
  };
  outbound: {
    tokenOk: boolean | null;
    tokenScope: string | null;
    tokenDetail: string;
    endpoints: EndpointResult[];
  };
  client?: {
    ok: boolean | null;
    skipped?: string;
    probes: ClientProbe[];
  };
  config: {
    xapiClientIdPreview: string;
    xapiSecretSet: boolean;
    b4bClientIdPreview: string;
    b4bSecretSet: boolean;
    orgId: string;
    orgSlug: string;
    oauthUrl: string;
    apiBase: string;
  };
  recommendations: string[];
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-container-lowest)',
  border: '1px solid var(--outline-variant)',
  borderRadius: '1rem',
  padding: '1rem',
};

const btnStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: '0.65rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnDisabledStyle: React.CSSProperties = {
  ...btnStyle,
  opacity: 0.6,
  cursor: 'not-allowed',
};

function statusBadge(ok: boolean | null) {
  if (ok === true) return { text: 'PASS', color: 'var(--success)' };
  if (ok === false) return { text: 'FAIL', color: 'var(--error)' };
  return { text: 'SKIP', color: 'var(--color-on-surface-variant)' };
}

function endpointBadge(status: number | 'ERROR') {
  if (typeof status === 'number' && status >= 200 && status < 300) {
    return { text: String(status), color: 'var(--success)' };
  }
  if (typeof status === 'number' && (status === 401 || status === 403)) {
    return { text: String(status), color: 'var(--error)' };
  }
  if (status === 'ERROR') {
    return { text: 'ERR', color: 'var(--error)' };
  }
  return { text: String(status), color: 'var(--color-on-surface-variant)' };
}

export default function CourseraSelfTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/coursera/self-test');
      if (!res.ok) {
        const text = await res.text();
        setError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={runTest}
          disabled={loading}
          style={loading ? btnDisabledStyle : btnStyle}
        >
          {loading ? 'Running self-test…' : '▶ Run self-test'}
        </button>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          Tests inbound xAPI (our endpoints) + outbound B4B REST (Coursera API) from the server.
        </span>
      </div>

      {error && (
        <div role="alert" style={{ ...cardStyle, borderColor: 'var(--error)', color: 'var(--error)' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '0.75rem',
                height: '0.75rem',
                borderRadius: '50%',
                background: result.ok ? 'var(--success)' : 'var(--error)',
              }}
            />
            <strong style={{ fontSize: '1.05rem' }}>
              {result.ok ? 'All checks passed' : 'Some checks failed'}
            </strong>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>
              {new Date(result.ranAt).toLocaleString()}
            </span>
          </div>

          {/* Config summary */}
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
              marginBottom: '0.75rem',
              display: 'grid',
              gap: '0.25rem',
            }}
          >
            <div>Target: <code>{result.targetBaseUrl}</code></div>
            <div>
              xAPI client: <code>{result.config.xapiClientIdPreview}</code>{' '}
              {result.config.xapiSecretSet ? '(secret set)' : '(no secret)'}
            </div>
            <div>
              B4B client: <code>{result.config.b4bClientIdPreview}</code>{' '}
              {result.config.b4bSecretSet ? '(secret set)' : '(no secret)'}
            </div>
            <div>
              Org: <code>{result.config.orgId}</code> / <code>{result.config.orgSlug}</code>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              OAuth URL: <code>{result.config.oauthUrl}</code>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              API base: <code>{result.config.apiBase}</code>
            </div>
          </div>

          {/* Inbound */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.375rem' }}>
              Inbound xAPI
            </div>
            <div style={{ display: 'grid', gap: '0.375rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: statusBadge(result.inbound.tokenOk).color, fontWeight: 700, minWidth: '3rem' }}>
                  {statusBadge(result.inbound.tokenOk).text}
                </span>
                <span>/api/xapi/oauth/token</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  {result.inbound.tokenDetail}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: statusBadge(result.inbound.statementOk).color, fontWeight: 700, minWidth: '3rem' }}>
                  {statusBadge(result.inbound.statementOk).text}
                </span>
                <span>/api/xapi/statements</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  {result.inbound.statementDetail}
                </span>
              </div>
            </div>
          </div>

          {/* Outbound */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.375rem' }}>
              Outbound B4B
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span style={{ color: statusBadge(result.outbound.tokenOk).color, fontWeight: 700, minWidth: '3rem' }}>
                {statusBadge(result.outbound.tokenOk).text}
              </span>
              <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.85rem' }}>
                {result.config.oauthUrl || 'OAuth'}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                {result.outbound.tokenDetail}
              </span>
            </div>
            {result.outbound.endpoints.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gap: '0.25rem',
                  fontSize: '0.85rem',
                  paddingLeft: '3.5rem',
                }}
              >
                {result.outbound.endpoints.map((ep) => {
                  const badge = endpointBadge(ep.status);
                  return (
                    <div key={ep.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: badge.color, fontWeight: 700, minWidth: '2.5rem', fontVariantNumeric: 'tabular-nums' }}>
                        {badge.text}
                      </span>
                      <span style={{ flex: 1 }}>{ep.label}</span>
                      <span
                        title={ep.payloadPreview || ep.message || undefined}
                        style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {ep.payloadPreview || ep.message || ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* (g) — typed b4bClient end-to-end */}
          {result.client && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.375rem' }}>
                Typed b4bClient (end-to-end)
              </div>
              {result.client.skipped ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  Skipped: {result.client.skipped}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem' }}>
                  {result.client.probes.map((p) => (
                    <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          color: p.ok ? 'var(--success)' : 'var(--error)',
                          fontWeight: 700,
                          minWidth: '3rem',
                        }}
                      >
                        {p.ok ? 'OK' : 'FAIL'}
                      </span>
                      <span style={{ minWidth: '12rem' }}>{p.method}</span>
                      <span
                        title={p.preview || p.detail}
                        style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {p.preview || p.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.375rem' }}>Recommendations</div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
