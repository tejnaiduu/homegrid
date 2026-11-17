import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading your workspace…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !user.roles.some((role) => allowedRoles.includes(role))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
