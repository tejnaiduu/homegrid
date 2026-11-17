import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RequestAccessPage from './pages/RequestAccessPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import ShopDashboardPage from './pages/ShopDashboardPage.jsx';
import CustomerDashboardPage from './pages/CustomerDashboardPage.jsx';
import ElectricianDashboardPage from './pages/ElectricianDashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import './styles.css';

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  return user ? <Navigate to="/dashboard" replace /> : <LoginPage />;
}

function RegisterRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  return user ? <Navigate to="/dashboard" replace /> : <RegisterPage />;
}

function RoleDashboardRedirect() {
  const { user } = useAuth();
  if (user.roles.includes('ADMIN')) return <Navigate to="/admin/dashboard" replace />;
  if (user.roles.includes('SHOP_OWNER')) return <Navigate to="/shop/dashboard" replace />;
  if (user.roles.includes('CUSTOMER')) return <Navigate to="/customer/dashboard" replace />;
  if (user.roles.includes('ELECTRICIAN')) return <Navigate to="/electrician/dashboard" replace />;
  return <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<RegisterRoute />} />
        <Route path="/access/:token" element={<RequestAccessPage />} />
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['SHOP_OWNER']} />}>
          <Route path="/shop/dashboard" element={<ShopDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['CUSTOMER']} />}>
          <Route path="/customer/dashboard" element={<CustomerDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ELECTRICIAN']} />}>
          <Route path="/electrician/dashboard" element={<ElectricianDashboardPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<RoleDashboardRedirect />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
