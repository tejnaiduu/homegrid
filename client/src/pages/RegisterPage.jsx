import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', role: 'ELECTRICIAN' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const user = await register(form);
      navigate(user.roles.includes('SHOP_OWNER') ? '/shop/dashboard' : user.roles.includes('CUSTOMER') ? '/customer/dashboard' : user.roles.includes('ELECTRICIAN') ? '/electrician/dashboard' : '/dashboard');
    }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-layout auth-layout-single">
      <section className="auth-card auth-card-wide">
        <div className="eyebrow">GET STARTED</div>
        <h1>Create your account</h1>
        <p className="muted">Choose the role you want to use first. More roles can be linked to an account later by platform administration.</p>
        <form onSubmit={handleSubmit} className="form-stack">
          <label>Full name<input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your name" required minLength={2} /></label>
          <div className="form-grid">
            <label>Phone number<input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Mobile number" /></label>
            <label>Email address<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@example.com" /></label>
          </div>
          <label>Password<input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
          <label>Account type
            <select value={form.role} onChange={(e) => update('role', e.target.value)}>
              <option value="ELECTRICIAN">Electrician</option>
              <option value="CUSTOMER">Customer</option>
              <option value="SHOP_OWNER">Shop owner</option>
            </select>
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary button-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="auth-foot">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
