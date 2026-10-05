import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage(): React.JSX.Element {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        // Show the field-level details when the backend rejected the payload
        // (validation failure carries them); otherwise the envelope message
        // (e.g. "Invalid email or password.") is what the user needs.
        setError(err.details && err.details.length > 0 ? err.details.join(' ') : err.message);
      } else {
        setError('Wrong email or password.');
      }
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: 360, maxWidth: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>
          <img src="/logo.jpeg" alt="Rami Broast" style={{ width: 200, height: 80, objectFit: 'contain', marginBottom: 12 }} />
          <p className="muted" style={{ margin: '4px 0 0' }}>Admin sign in</p>
        </div>
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <label style={{ display: 'block', margin: '12px 0 4px', fontWeight: 600 }}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus />
        <label style={{ display: 'block', margin: '12px 0 4px', fontWeight: 600 }}>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        <button className="btn" style={{ width: '100%', marginTop: 20 }} disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
