import { useEffect, useState } from 'react';
import { Save, UserRound } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/auth/me').then((result) => setForm({ name: result.data.user.name || '', phone: result.data.user.phone || '', email: result.data.user.email || '' })).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);

  async function saveProfile(event) {
    event.preventDefault(); setSaving(true); setMessage(''); setError('');
    try { await apiRequest('/auth/me', { method: 'PATCH', body: JSON.stringify(form) }); setMessage('Profile updated.'); }
    catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="dashboard-page"><div className="page-loading">Loading profile...</div></main>;

  return <main className="dashboard-page profile-page"><section className="dashboard-hero"><div><div className="eyebrow">ACCOUNT · {user?.roles?.join(' / ')}</div><h1>Your profile</h1><p>Keep your contact details current for requests, approvals, and notifications.</p></div><UserRound size={38} /></section><form className="admin-panel profile-form form-stack" onSubmit={saveProfile}><label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>{error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<button className="button button-primary" disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save profile'}</button></form></main>;
}
