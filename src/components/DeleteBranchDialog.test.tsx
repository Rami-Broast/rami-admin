import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Branch } from '../api/types';

const deleteBranch = vi.fn();

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ api: { deleteBranch } }),
}));

const { DeleteBranchDialog } = await import('./DeleteBranchDialog');

const BRANCH = { id: 'b1', code: 'OLY-01', name: 'Olaya', status: 'ACTIVE' } as unknown as Branch;

function open() {
  return render(
    <DeleteBranchDialog branch={BRANCH} open onClose={vi.fn()} onDeleted={vi.fn()} />,
  );
}

/** Gets past the first "are you sure" screen. */
function advance() {
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

describe('DeleteBranchDialog', () => {
  it('warns that a branch with orders is archived, not deleted, before anything is typed', () => {
    // The whole reason this is not a one-line confirm(): the button says
    // Delete, and for most real branches the honest answer is Archive. An
    // owner has to know that before they commit, not after.
    open();
    expect(screen.getByText(/archived/i)).toBeTruthy();
  });

  it('will not submit until the code and the password are both supplied', () => {
    open();
    advance();

    const confirm = screen.getByRole('button', { name: /delete this branch/i });
    expect(confirm).toHaveProperty('disabled', true);

    // Code alone is not enough — a session left open on a counter machine can
    // read the code straight off the screen.
    fireEvent.change(screen.getByPlaceholderText('OLY-01'), { target: { value: 'OLY-01' } });
    expect(confirm).toHaveProperty('disabled', true);
  });

  it('will not submit for the wrong branch code', () => {
    open();
    advance();
    fireEvent.change(screen.getByPlaceholderText('OLY-01'), { target: { value: 'OLY-02' } });
    fireEvent.change(document.querySelector('input[type=password]')!, {
      target: { value: 'hunter2hunter2' },
    });

    expect(screen.getByRole('button', { name: /delete this branch/i })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('sends the code and the password exactly as typed', async () => {
    deleteBranch.mockResolvedValue({ outcome: 'DELETED', branch: BRANCH, reason: 'Never traded.' });
    open();
    advance();
    fireEvent.change(screen.getByPlaceholderText('OLY-01'), { target: { value: ' OLY-01 ' } });
    fireEvent.change(document.querySelector('input[type=password]')!, {
      target: { value: 'hunter2hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /delete this branch/i }));

    await waitFor(() => expect(deleteBranch).toHaveBeenCalled());
    expect(deleteBranch).toHaveBeenCalledWith('b1', {
      code: 'OLY-01',
      password: 'hunter2hunter2',
    });
  });

  it('reports what the server did, not what the button was called', async () => {
    // A branch that has traded comes back ARCHIVED. Telling the owner it was
    // deleted would be a lie about whether their data still exists — which is
    // the one thing this dialog must never get wrong.
    deleteBranch.mockResolvedValue({
      outcome: 'ARCHIVED',
      branch: BRANCH,
      reason: 'This branch has 42 orders against it, so its records were kept.',
    });
    open();
    advance();
    fireEvent.change(screen.getByPlaceholderText('OLY-01'), { target: { value: 'OLY-01' } });
    fireEvent.change(document.querySelector('input[type=password]')!, {
      target: { value: 'hunter2hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /delete this branch/i }));

    expect(await screen.findByText(/Branch archived\./i)).toBeTruthy();
    expect(screen.getByText(/42 orders/)).toBeTruthy();
  });
});
