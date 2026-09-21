'use client';

import PasswordToggle from '@/components/forms/PasswordToggle';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isWeakPasswordError } from '@/lib/auth/authProviderError';
import LocalizedLink from '@/components/LocalizedLink';
import { createSupabaseBrowserClient } from '@/lib/auth/client';
import { normalizePostLoginRedirect } from '@/lib/auth/postLoginRedirect';

type Stage = 'verifying' | 'ready' | 'submitting' | 'success' | 'error';

function ResetPasswordForm() {
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const redirectTo = normalizePostLoginRedirect(searchParams?.get('redirectTo'));
  const loginHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
  const forgotPasswordHref = `/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`;
  const router = useRouter();
  const supabase = useRef(createSupabaseBrowserClient()).current;

  const [stage, setStage] = useState<Stage>('verifying');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const verification = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let active = true;
    const invalidLinkMessage = tAuth('resetPassword.linkInvalidMessage');
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setVerifyError(null);
        setStage('ready');
      }
    });

    async function exchangeToken(): Promise<string | null> {
      const code = searchParams?.get('code');
      const tokenHash = searchParams?.get('token_hash');
      const type = searchParams?.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashType = hashParams.get('type');
      let result: { error: unknown };

      if (accessToken && refreshToken && hashType === 'recovery') {
        // Server-issued fallback links have no browser PKCE verifier cookie.
        result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } else if (tokenHash && type === 'recovery') {
        result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      } else if (code && type === 'recovery') {
        result = await supabase.auth.exchangeCodeForSession(code);
      } else {
        return code || tokenHash ? invalidLinkMessage : tAuth('resetPassword.noTokenMessage');
      }

      if (result.error) return invalidLinkMessage;
      // A verified one-use token should not remain in history or be retried
      // when the member follows another link. Keep their training destination.
      const cleanUrl = new URL(window.location.href);
      for (const key of ['token_hash', 'type', 'code']) cleanUrl.searchParams.delete(key);
      cleanUrl.hash = '';
      window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search);
      return null;
    }

    // React effect replay must share the in-flight verification: the first
    // request consumes the recovery token, so issuing it twice rejects a valid link.
    verification.current ??= exchangeToken().catch(() => invalidLinkMessage);
    void verification.current.then((errorMessage) => {
      if (!active) return;
      setVerifyError(errorMessage);
      setStage(errorMessage ? 'error' : 'ready');
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError(tAuth('resetPassword.passwordTooShort'));
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setFormError(tAuth('resetPassword.passwordMismatch'));
      confirmRef.current?.focus();
      return;
    }

    setStage('submitting');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const message = error.message?.trim();
        // supabase-js reports a dropped connection as AuthRetryableFetchError
        // (status 0) and a non-JSON answer as AuthUnknownError; their messages
        // ("Failed to fetch", "Unexpected token '<'") mean nothing to a member.
        const connectionFailure =
          error.name === 'AuthRetryableFetchError' || error.name === 'AuthUnknownError' || error.status === 0;
        const retryableProviderFailure = error.status !== undefined && error.status >= 500;
        setFormError(
          connectionFailure
            ? tCommon('connectionError')
            : isWeakPasswordError(error)
              // WAP-26: clear, localised guidance instead of the provider's phrasing.
              ? tAuth('resetPassword.weakPassword')
            : !retryableProviderFailure && message && message !== '{}' && message !== '[object Object]'
              ? message
              : tAuth('resetPassword.updateFailed'),
        );
        setStage('ready');
        passwordRef.current?.focus();
        return;
      }

      setStage('success');
      setTimeout(() => router.push(redirectTo), 2000);
    } catch {
      setFormError(tAuth('resetPassword.updateFailed'));
      setStage('ready');
      passwordRef.current?.focus();
    }
  }

  if (stage === 'verifying') {
    return (
      <div className="inner-page" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h1 className="sr-only">{tAuth('resetPassword.verifying')}</h1>
        <p>{tAuth('resetPassword.verifying')}</p>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="inner-page">
        <section className="page-hero">
          <div className="page-hero-content">
            <h1>{tAuth('resetPassword.linkInvalidHeading')}</h1>
            <p role="alert">{verifyError}</p>
            <LocalizedLink href={forgotPasswordHref} className="btn btn-primary" style={{ marginTop: '1rem', minHeight: 44 }}>
              {tAuth('resetPassword.requestNewLink')}
            </LocalizedLink>
          </div>
        </section>
      </div>
    );
  }

  if (stage === 'success') {
    return (
      <div className="inner-page">
        <section className="page-hero">
          <div className="page-hero-content">
            <h1>{tAuth('resetPassword.successHeading')}</h1>
            <p role="status">{tAuth('resetPassword.successMessage')}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="inner-page">
      <section className="page-hero">
        <div className="page-hero-content">
          <h1>{tAuth('resetPassword.heading')}</h1>
          <p>{tAuth('resetPassword.subheading')}</p>
        </div>
      </section>

      <section className="content-section">
        <div className="container">
          <div style={{ maxWidth: '420px', margin: '0 auto' }}>
            <div className="apply-form">
              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="new-password">{tAuth('resetPassword.newPasswordLabel')} *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      ref={passwordRef}
                      id="new-password"
                      name="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (formError) setFormError(null); }}
                      required
                      minLength={8}
                      aria-invalid={!!formError}
                      aria-describedby="new-password-hint"
                      style={{ paddingRight: '2.75rem' }}
                    />
                    <PasswordToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      showLabel={tAuth('resetPassword.showPassword')}
                      hideLabel={tAuth('resetPassword.hidePassword')}
                      controls="new-password"
                    />
                  </div>
                  <p id="new-password-hint" className="form-hint">
                    {tAuth('resetPassword.passwordHint')}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-password">{tAuth('resetPassword.confirmPasswordLabel')} *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      ref={confirmRef}
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); if (formError) setFormError(null); }}
                      required
                      aria-invalid={!!formError}
                      aria-describedby={formError ? 'reset-password-error' : undefined}
                      style={{ paddingRight: '2.75rem' }}
                    />
                    <PasswordToggle
                      visible={showConfirm}
                      onToggle={() => setShowConfirm((v) => !v)}
                      showLabel={tAuth('resetPassword.showPassword')}
                      hideLabel={tAuth('resetPassword.hidePassword')}
                      controls="confirm-password"
                    />
                  </div>
                </div>
                {formError && (
                  <div
                    id="reset-password-error"
                    className="form-error-banner"
                    role="alert"
                    style={{
                      background: 'var(--surface-container)',
                      borderLeft: '4px solid var(--color-accent)',
                      padding: '1rem',
                      marginBottom: '1rem',
                      borderRadius: '0 8px 8px 0',
                    }}
                  >
                    {formError}
                  </div>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '1rem', minHeight: 44 }}
                  disabled={stage === 'submitting'}
                  aria-busy={stage === 'submitting'}
                >
                  <span aria-live="polite">{stage === 'submitting' ? tAuth('resetPassword.saving') : tAuth('resetPassword.submit')}</span>
                </button>
                <p style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <LocalizedLink href={loginHref}>{tAuth('resetPassword.backToLogin')}</LocalizedLink>
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResetPasswordLoadingFallback() {
  const tAuth = useTranslations('auth');
  return (
    <div className="inner-page" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
      {tAuth('resetPassword.loading')}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
