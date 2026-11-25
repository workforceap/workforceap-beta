import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import CertificationRoadmap from '@/components/portal/CertificationRoadmap';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CertificationRoadmap', () => {
  it('does not uncheck a staff-verified certificate', async () => {
    fetchMock
      .mockResolvedValueOnce(json({
        certifications: [
          { certName: 'OSHA 10', status: 'approved' },
          { certName: 'CompTIA A+', status: 'pending' },
        ],
      }))
      .mockResolvedValueOnce(json({ success: true }));
    render(<CertificationRoadmap />);

    const verified = await screen.findByRole('checkbox', { name: 'OSHA 10' });
    const pending = screen.getByRole('checkbox', { name: 'CompTIA A+' });
    expect(verified).toBeChecked();
    expect(verified).toBeDisabled();
    expect(pending).toBeChecked();
    expect(pending).toBeEnabled();

    fireEvent.click(verified);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(pending);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/member/certifications',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ certName: 'CompTIA A+', earned: false }),
      }),
    );
  });

  it('rolls the checkbox back when unchecking a verified row is refused', async () => {
    fetchMock
      .mockResolvedValueOnce(json({
        certifications: [{ certName: 'OSHA 10', status: 'pending' }],
      }))
      .mockResolvedValueOnce(json(
        { error: 'Verified certificates cannot be removed.', status: 'approved', verifiedUnchanged: true },
        409,
      ));
    render(<CertificationRoadmap />);

    const box = await screen.findByRole('checkbox', { name: 'OSHA 10' });
    expect(box).toBeEnabled();
    fireEvent.click(box);
    await waitFor(() => expect(box).toBeChecked());
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/member/certifications',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ certName: 'OSHA 10', earned: false }),
      }),
    );
  });
});
