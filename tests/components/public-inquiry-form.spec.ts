import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { bindPublicInquiryForm, bindSponsorshipInquiry } from '@/marketing/src/scripts/publicInquiryForm';

const fetchMock = vi.fn();
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML = `<section id="partner-sponsorship">
    <a href="#inquiry" data-tier="Bronze">Sponsor Bronze</a>
    <form id="wgInquiry" method="post" action="/api/contact?source=sponsorship">
      <input name="source" value="sponsorship"><input name="first_name" value="Ada" required>
      <input name="last_name" value="Lovelace" required><input name="organization" value="Analytical Engines" required>
      <input name="email" type="email" value="ada@example.net" required><input name="phone" value="5125550123">
      <select id="wgInterest" name="interest"><option>Custom / not sure yet</option><option>Bronze — 5 seats ($12,000)</option></select>
      <input name="seats" value="5"><textarea name="message">Please contact me.</textarea>
      <input name="cf-turnstile-response" value="first-token"><button type="submit">Send inquiry</button>
      <p id="wgError" role="alert" hidden></p><p id="wgOk" role="status" hidden></p>
    </form></section>`;
  bindSponsorshipInquiry();
});

describe('sponsorship inquiry enhancement', () => {
  it('submits genuine fields, selected tier and CAPTCHA directly to the API', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.click(document.querySelector('[data-tier]')!);
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contact');
    expect(JSON.parse(request.body)).toMatchObject({ source: 'sponsorship', first_name: 'Ada', last_name: 'Lovelace', organization: 'Analytical Engines', email: 'ada@example.net', interest: 'Bronze — 5 seats ($12,000)', cf_turnstile_response: 'first-token' });
    await waitFor(() => expect(document.getElementById('wgOk')).toBeVisible());
    expect(document.getElementById('wgOk')).toHaveTextContent('Your inquiry was saved');
  });

  it('keeps inputs and submission key through notification failure/network retry and fresh CAPTCHA', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Your inquiry was saved. Notification unavailable.', saved: true }) });
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(document.getElementById('wgError')).toHaveTextContent('was saved'));
    expect(form.querySelector<HTMLInputElement>('[name=email]')?.value).toBe('ada@example.net');
    expect(form.querySelector('button')).toBeEnabled();
    const originalKey = JSON.parse(fetchMock.mock.calls[0][1].body).submission_id;
    form.querySelector<HTMLInputElement>('[name=cf-turnstile-response]')!.value = 'fresh-token';
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    fireEvent.submit(form);
    await waitFor(() => expect(document.getElementById('wgError')).toHaveTextContent('Network unavailable'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).submission_id).toBe(originalKey);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.submit(form);
    await waitFor(() => expect(document.getElementById('wgOk')).toBeVisible());
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).submission_id).toBe(originalKey);
  });

  it('makes an edited inquiry a new logical submission and blocks double submit while pending', async () => {
    let release!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(form.querySelector('button')).toBeDisabled();
    release({ ok: false, json: async () => ({ error: 'Try again' }) });
    await waitFor(() => expect(form.querySelector('button')).toBeEnabled());
    form.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Changed inquiry';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).submission_id).not.toBe(JSON.parse(fetchMock.mock.calls[0][1].body).submission_id);
  });

  it('uses native validity before sending', () => {
    document.querySelector<HTMLInputElement>('[name=email]')!.value = 'invalid';
    fireEvent.submit(document.querySelector('form')!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains native form submission when stable browser request IDs are unavailable', () => {
    document.body.innerHTML = '<form id="native" action="/api/contact" method="post"></form>';
    vi.stubGlobal('crypto', {});
    bindPublicInquiryForm({ formId: 'native', errorId: 'none', successId: 'none', endpoint: '/api/contact' });
    const event = new Event('submit', { cancelable: true });
    document.querySelector('form')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides the prior success receipt before an edited inquiry fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(document.getElementById('wgOk')).toBeVisible());
    form.querySelector<HTMLTextAreaElement>('textarea')!.value = 'A different inquiry';
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    fireEvent.submit(form);
    await waitFor(() => expect(document.getElementById('wgError')).toHaveTextContent('Network unavailable'));
    expect(document.getElementById('wgOk')).not.toBeVisible();
    expect(document.getElementById('wgOk')).not.toHaveClass('show');
  });
});
