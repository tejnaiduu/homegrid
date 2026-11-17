import { Link, useNavigate } from 'react-router-dom';
import { Zap, LogOut, CircleUserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationMenu from './NotificationMenu.jsx';

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try { await logout(); } finally { navigate('/login'); }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to={user ? '/dashboard' : '/'}>
          <span className="brand-mark"><Zap size={19} /></span>
          <span>Homegrid</span>
        </Link>
        <div className="topbar-right">
          {user ? (
            <>
              <Link className="button button-small button-outline profile-link" to="/profile">
                <CircleUserRound size={16} aria-hidden="true" />
                <span className="profile-link-name">{user.name}</span>
              </Link>
              <NotificationMenu user={user} />
              {user.roles.includes('ADMIN') && <Link className="button button-small button-outline" to="/admin/dashboard">Admin</Link>}
              {user.roles.includes('SHOP_OWNER') && <Link className="button button-small button-outline" to="/shop/dashboard">Shop</Link>}
              {user.roles.includes('CUSTOMER') && <Link className="button button-small button-outline" to="/customer/dashboard">Customer</Link>}
              {user.roles.includes('ELECTRICIAN') && <Link className="button button-small button-outline" to="/electrician/dashboard">Electrician</Link>}
              <button className="button button-quiet button-small" onClick={handleLogout}><LogOut size={15} /> Logout</button>
            </>
          ) : <Link className="button button-small button-outline" to="/login">Login</Link>}
        </div>
      </header>
      {children}
      <footer className="footer">Homegrid · Electrical material requests and shop fulfilment</footer>
    </div>
  );
}
