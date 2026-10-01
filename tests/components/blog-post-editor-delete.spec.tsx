import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BlogPostEditor from '@/app/admin/blog/BlogPostEditor';

/**
 * WAP-193: deleting a blog post used to exist only in the ?ui=legacy row
 * menu. The default /admin/blog kit rows open the editor, so the editor now
 * offers Delete (behind a confirmation) in edit mode.
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/components/admin/ConfirmDialog', () => ({
  default: ({ open, confirmLabel, onConfirm }: { open: boolean; confirmLabel: string; onConfirm: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Confirm">
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

const fetchMock = vi.fn();
beforeEach(() => {
  nav.push.mockReset();
  nav.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const post = {
  id: 'post-1',
  slug: 'hello',
  title: 'Hello world',
  excerpt: null,
  content: 'Body',
  coverImage: null,
  authorName: 'WorkforceAP Team',
  category: null,
  published: true,
  scheduledAt: null,
};

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe('BlogPostEditor delete', () => {
  it('deletes only after confirmation, then returns to the blog list', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    render(<BlogPostEditor mode="edit" post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete post' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/admin/blog'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/blog/post-1', { method: 'DELETE' });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('keeps the editor open and shows the error when delete fails', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { error: 'Not found' }));
    render(<BlogPostEditor mode="edit" post={post} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete post' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not found'));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('offers no delete while creating a post', () => {
    render(<BlogPostEditor mode="create" />);
    expect(screen.queryByRole('button', { name: 'Delete post' })).toBeNull();
  });
});
