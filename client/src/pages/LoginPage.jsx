import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Phone, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const user = await login(identifier, password);
      navigate(user.roles.includes('ADMIN') ? '/admin/dashboard' : user.roles.includes('SHOP_OWNER') ? '/shop/dashboard' : user.roles.includes('CUSTOMER') ? '/customer/dashboard' : user.roles.includes('ELECTRICIAN') ? '/electrician/dashboard' : '/dashboard');
    }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="eyebrow">WELCOME BACK</div>
        <h1>Sign in to WireFlow</h1>
        <p className="muted">Access your electrical material workspace.</p>
        <form onSubmit={handleSubmit} className="form-stack">
          <label>Phone or email
            <span className="input-wrap"><Phone size={17} /><input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Phone number or email" required /></span>
          </label>
          <label>Password
            <span className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /></span>
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary button-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
        </form>
        <p className="auth-foot">New to WireFlow? <Link to="/register">Create an account</Link></p>
      </section>
      <aside className="auth-aside">
        <div className="aside-icon"><Zap size={28} /></div>
        <div className="eyebrow">ONE REQUEST. MULTIPLE SHOPS.</div>
        <h2>Keep every material and purchase connected.</h2>
        <p>Electricians prepare the list, customers follow it, and shops fulfil only the quantities they have in stock.</p>
      </aside>
    </main>
  );
}
