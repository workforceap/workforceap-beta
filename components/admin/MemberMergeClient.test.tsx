import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MemberMergeClient from './MemberMergeClient';

const mockSuggestions = [
  { id: 'm1', fullName: 'Alice Smith', email: 'alice@example.com' },
  { id: 'm2', fullName: 'Bob Jones', email: 'bob@example.com' },
];

const mockPreview = {
  primary: { id: 'm1', fullName: 'Alice Smith', email: 'alice@example.com', phone: '555-1234', enrolledProgram: 'Tech', assessmentCompleted: true },
  secondary: { id: 'm2', fullName: 'Bob Jones', email: 'bob@example.com', phone: null, enrolledProgram: null, assessmentCompleted: false },
  conflicts: [] as { field: string; message: string }[],
  relationsToRepoint: [{ model: 'Application', field: 'memberId', count: 3, moving: 3, keptOnSecondary: 0 }],
  scalarFieldsToMerge: ['phone'],
};

describe('MemberMergeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders search inputs', () => {
    render(<MemberMergeClient />);
    expect(screen.getAllByPlaceholderText(/search by name or email/i)).toHaveLength(2);
    expect(screen.getByText(/primary \(keep this record\)/i)).toBeInTheDocument();
    expect(screen.getByText(/duplicate \(merge into primary\)/i)).toBeInTheDocument();
  });

  it('shows suggestions when typing in primary search', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve(mockSuggestions),
    });

    render(<MemberMergeClient />);
    const inputs = screen.getAllByPlaceholderText(/search by name or email/i);
    fireEvent.change(inputs[0]!, { target: { value: 'Ali' } });

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
  });

  it('selects primary and shows selected card', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve(mockSuggestions),
    });

    render(<MemberMergeClient />);
    const inputs = screen.getAllByPlaceholderText(/search by name or email/i);
    fireEvent.change(inputs[0]!, { target: { value: 'Ali' } });

    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
  });

  it('fetches preview when both primary and secondary are selected', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ preview: mockPreview }),
      });

    render(<MemberMergeClient />);
    const inputs = screen.getAllByPlaceholderText(/search by name or email/i);

    fireEvent.change(inputs[0]!, { target: { value: 'Ali' } });
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));

    fireEvent.change(inputs[1]!, { target: { value: 'Bob' } });
    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bob Jones'));

    await waitFor(() => {
      expect(screen.getByText(/what will be merged/i)).toBeInTheDocument();
    });
  });

  it('tells the admin which records will stay on the duplicate', async () => {
    // The preview used to report only a total, so a merge that would leave
    // rows behind looked identical to one that moves everything — and before
    // the collision planner, that same case aborted the merge outright.
    const previewWithCollision = {
      ...mockPreview,
      relationsToRepoint: [
        { model: 'pointsTransaction', field: 'userId', count: 3, moving: 2, keptOnSecondary: 1 },
      ],
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ preview: previewWithCollision }) });

    render(<MemberMergeClient />);
    const inputs = screen.getAllByPlaceholderText(/search by name or email/i);
    fireEvent.change(inputs[0]!, { target: { value: 'Ali' } });
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.change(inputs[1]!, { target: { value: 'Bob' } });
    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bob Jones'));

    await waitFor(() => expect(screen.getByText(/what will be merged/i)).toBeInTheDocument());
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
    const kept = document.querySelectorAll('[data-merge-kept]');
    expect(kept).toHaveLength(1);
    expect(kept.length).toBeGreaterThan(0);
    for (const node of kept) {
      expect(node.textContent).toMatch(/kept on the duplicate/);
    }
    expect(document.querySelector('[data-merge-kept-note]')?.textContent).toMatch(/Nothing is deleted/);
  });

  it('blocks merge when conflicts exist', async () => {
    const previewWithConflicts = {
      ...mockPreview,
      conflicts: [{ field: 'email', message: 'Different emails' }],
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockSuggestions) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ preview: previewWithConflicts }),
      });

    render(<MemberMergeClient />);
    const inputs = screen.getAllByPlaceholderText(/search by name or email/i);

    fireEvent.change(inputs[0]!, { target: { value: 'Ali' } });
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));

    fireEvent.change(inputs[1]!, { target: { value: 'Bob' } });
    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Bob Jones'));

    await waitFor(() => {
      expect(screen.getByText(/conflicts detected — merge blocked/i)).toBeInTheDocument();
    });

    const mergeBtn = screen.getByRole('button', { name: /confirm merge/i });
    expect(mergeBtn).toBeDisabled();
  });

  it('disables confirm merge until both members selected and no conflicts', async () => {
    render(<MemberMergeClient />);
    expect(screen.queryByRole('button', { name: /confirm merge/i })).not.toBeInTheDocument();
  });
});
