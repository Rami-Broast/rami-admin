import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { Branch } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from './Modal';

/**
 * Deleting a branch, in two deliberate steps.
 *
 * ## Why it is not one button and a `confirm()`
 *
 * This is the most destructive control in the panel and it sits next to
 * Suspend, Close and Duplicate — buttons someone presses without much thought
 * during ordinary work. A single browser `confirm()` is dismissed reflexively;
 * people click OK on those without reading them all day.
 *
 * So: **step one** states the consequence and asks whether to go on. **Step
 * two** asks for two things that cannot be produced by reflex — the branch's own
 * code typed out, and the operator's password. The password is not theatre: it
 * proves the person at the keyboard is the account holder and not whoever found
 * a counter machine with a session still open.
 *
 * Both are re-checked server-side. Nothing here is the actual guard.
 *
 * ## It does not promise what it cannot deliver
 *
 * A branch that has taken orders is **archived**, not deleted, because its
 * orders and settlements are what the restaurant's revenue and VAT position are
 * built from. The dialog says so up front, and afterwards it reports what the
 * server actually did rather than what the button was called — telling an owner
 * their data is gone when it is not, or the reverse, is the failure that
 * matters here.
 */
export function DeleteBranchDialog({
  branch,
  open,
  onClose,
  onDeleted,
}: {
  branch: Branch;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const { api } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ outcome: string; reason: string } | null>(null);

  const close = (): void => {
    setStep(1);
    setCode('');
    setPassword('');
    setError(null);
    setOutcome(null);
    onClose();
  };

  const codeMatches = code.trim().toUpperCase() === branch.code.toUpperCase();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteBranch(branch.id, { password, code: code.trim() });
      setOutcome({ outcome: result.outcome, reason: result.reason });
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={`Delete ${branch.name}`}>
      {outcome ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>
            {outcome.outcome === 'DELETED' ? 'Branch deleted.' : 'Branch archived.'}
          </p>
          {/* The server's own words. It knows what it did; this dialog does not
              get to summarise it into whichever verb the button used. */}
          <p className="muted" style={{ margin: 0 }}>{outcome.reason}</p>
          <div>
            <button className="btn" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : step === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0 }}>
            This removes <strong>{branch.name}</strong> ({branch.code}) from the platform. Its staff
            lose their assignment to it, and it disappears from the customer app, the POS and every
            list here.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            If this branch has ever taken an order, it is <strong>archived</strong> instead of
            deleted: hidden everywhere and unable to trade, but its orders, payments and VAT records
            are kept, because your reports are built from them. A branch that has never traded is
            removed completely.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" onClick={() => setStep(2)}>
              Continue
            </button>
            <button className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <span>
              Type <strong>{branch.code}</strong> to confirm
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder={branch.code}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span>Your password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              The password you sign in with. This confirms it is you, not a session left open.
            </span>
          </label>
          {error ? <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-danger"
              disabled={!codeMatches || password.length === 0 || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Deleting…' : 'Delete this branch'}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
