import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CertificationsQueueKit,
  isImageProofHref,
  type CertSubmission,
} from '@/components/portal/kit/pages/admin-subviews/CertificationsQueueKit';
import { installNativeDialogStub } from '@/tests/helpers/nativeDialogStub';

installNativeDialogStub();

const withProof: CertSubmission = {
  id: 'cert-with-proof',
  credential: 'AWS Cloud Practitioner',
  member: 'Alex With Proof',
  meta: 'Cloud & IT · submitted today',
  proofHref: 'https://files.example.test/proof.png?token=abc',
};

const withoutProof: CertSubmission = {
  id: 'cert-no-proof',
  credential: 'CompTIA A+',
  member: 'Blake No Proof',
  meta: 'Cloud & IT · submitted today',
};

/** Astryx Button uses aria-disabled="true" when off; omits the attr when on. */
function expectAriaDisabled(el: HTMLElement, disabled: boolean) {
  if (disabled) {
    expect(el).toHaveAttribute('aria-disabled', 'true');
    return;
  }
  expect(el.getAttribute('aria-disabled')).not.toBe('true');
  expect(el).not.toBeDisabled();
}

describe('isImageProofHref', () => {
  it('detects image extensions before the query string', () => {
    expect(isImageProofHref('https://x.test/a.PNG?sig=1')).toBe(true);
    expect(isImageProofHref('https://x.test/a.pdf?sig=1')).toBe(false);
    expect(isImageProofHref(undefined)).toBe(false);
  });
});

describe('CertificationsQueueKit UI-05 no-proof Approve guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => cleanup());

  it('disables Approve when proof is missing and still allows Reject', async () => {
    render(
      <CertificationsQueueKit
        submissions={[withoutProof]}
        actionsEnabled
        awaitingCount={1}
      />,
    );

    const approve = screen.getByRole('button', { name: 'Approve' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    expectAriaDisabled(approve, true);
    expectAriaDisabled(reject, false);
    expect(screen.getAllByText('No proof').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'View proof' })).toBeNull();
  });

  it('does not POST approve when proof is missing', async () => {
    render(
      <CertificationsQueueKit
        submissions={[withoutProof]}
        actionsEnabled
      />,
    );

    const approve = screen.getByRole('button', { name: 'Approve' });
    expectAriaDisabled(approve, true);
    await userEvent.click(approve);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('enables Approve when proof exists and opens the preview dialog', async () => {
    render(
      <CertificationsQueueKit
        submissions={[withProof]}
        actionsEnabled
      />,
    );

    expectAriaDisabled(screen.getByRole('button', { name: 'Approve' }), false);
    // Mobile + desktop "View proof" controls both mount; either opens the dialog.
    await userEvent.click(screen.getAllByRole('button', { name: 'View proof' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Proof · AWS Cloud Practitioner/);
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(withProof.proofHref);
  });
});
