type InquiryFormOptions = {
  formId: string;
  errorId: string;
  successId: string;
  endpoint: string;
  successRedirect?: string;
  hideOnSuccess?: boolean;
};

/** Stable while an unchanged inquiry retries; editing creates a new logical submission. */
export function createInquirySubmissionId() {
  let previous = '';
  let submissionId = '';
  return (payload: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(Object.entries(payload).filter(([key]) => key !== 'cf_turnstile_response' && key !== 'submission_id'));
    if (fingerprint !== previous) {
      previous = fingerprint;
      submissionId = crypto.randomUUID();
    }
    return submissionId;
  };
}

/** Progressive enhancement only: the form action/method remains the native fallback. */
export function bindPublicInquiryForm(options: InquiryFormOptions): void {
  const form = document.getElementById(options.formId);
  if (!(form instanceof HTMLFormElement) || typeof window.fetch !== 'function' || typeof globalThis.crypto?.randomUUID !== 'function') return;
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const error = document.getElementById(options.errorId);
  const success = document.getElementById(options.successId);
  const idleLabel = button?.textContent ?? '';
  const submissionId = createInquirySubmissionId();
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    if (error) error.hidden = true;
    if (success) { success.hidden = true; success.classList.remove('show'); }
    const payload: Record<string, unknown> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') payload[key === 'cf-turnstile-response' ? 'cf_turnstile_response' : key] = value.trim();
    });
    payload.submission_id = submissionId(payload);
    pending = true;
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }
    try {
      const response = await window.fetch(options.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'We could not confirm your inquiry. Please retry or contact info@workforceap.org.');
      if (success) {
        success.textContent = 'Your inquiry was saved. Thank you for contacting our team.';
        success.hidden = false;
        success.classList.add('show');
      }
      if (options.hideOnSuccess) form.hidden = true;
      if (options.successRedirect) window.location.assign(options.successRedirect);
    } catch (cause) {
      if (error) {
        error.textContent = cause instanceof Error ? cause.message : 'Network error. Please retry or contact info@workforceap.org.';
        error.hidden = false;
      }
      const turnstile = (window as Window & { turnstile?: { reset(): void } }).turnstile;
      try { turnstile?.reset(); } catch { /* CAPTCHA widget may already be gone. */ }
    } finally {
      pending = false;
      if (button) { button.disabled = false; button.textContent = idleLabel; }
    }
  });
}

export function bindSponsorshipInquiry(): void {
  const scope = document.getElementById('partner-sponsorship');
  if (!scope) return;
  const select = scope.querySelector<HTMLSelectElement>('#wgInterest');
  scope.querySelectorAll<HTMLElement>('[data-tier]').forEach((link) => {
    link.addEventListener('click', () => {
      const tier = link.dataset.tier;
      if (!select || !tier) return;
      const index = Array.from(select.options).findIndex((option) => option.text.startsWith(tier));
      if (index >= 0) select.selectedIndex = index;
    });
  });
  bindPublicInquiryForm({ formId: 'wgInquiry', errorId: 'wgError', successId: 'wgOk', endpoint: '/api/contact' });
}
