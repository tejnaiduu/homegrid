import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminSetupPage() {
  const { bootstrapAdmin } = useAuth();
  const navigate = useNavigate();
  const [available, setAvailable] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', setupToken: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest('/auth/admin-setup/status')
      .then((result) => { if (active) setAvailable(result.data.available); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await bootstrapAdmin(form);
      navigate(user.roles.includes('ADMIN') ? '/admin/dashboard' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout auth-layout-single">
      <section className="auth-card auth-card-wide">
        <div className="eyebrow">INITIAL ADMIN SETUP</div>
        <h1>Create the first admin</h1>
        <p className="muted">This private setup is available only until the first administrator is created. Keep the setup key secret.</p>
        {error && <div className="alert alert-error">{error}</div>}
        {available === null && !error && <p className="muted">Checking admin setup…</p>}
        {available === false && (
          <div className="alert alert-success">
            Admin setup is closed. <Link to="/login">Sign in</Link> with an existing administrator account.
          </div>
        )}
        {available && (
          <form onSubmit={handleSubmit} className="form-stack">
            <label>Full name
              <input value={form.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" minLength={2} maxLength={100} required />
            </label>
            <label>Email address
              <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" maxLength={160} />
            </label>
            <label>Phone number
              <input type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" maxLength={20} />
            </label>
            <label>Admin password
              <input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" minLength={12} required />
            </label>
            <label>One-time setup key
              <input type="password" value={form.setupToken} onChange={(event) => update('setupToken', event.target.value)} autoComplete="off" required />
            </label>
            <button className="button button-primary button-full" disabled={busy}>
              {busy ? 'Creating admin…' : 'Create admin account'}
            </button>
          </form>
        )}
        {available !== true && <p className="auth-foot"><Link to="/login">Return to sign in</Link></p>}
      </section>
    </main>
  );
}
