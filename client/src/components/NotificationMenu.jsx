import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { apiRequest } from '../services/api.js';

export default function NotificationMenu({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    let active = true;
    setNotifications([]);
    setError('');
    setLoading(true);

    async function loadNotifications() {
      try {
        const result = await apiRequest('/notifications');
        if (active) setNotifications(result.data.notifications);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadNotifications();
    window.addEventListener('homegrid:notification', loadNotifications);
    return () => {
      active = false;
      window.removeEventListener('homegrid:notification', loadNotifications);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function markAsRead(notification) {
    if (notification.isRead) return;
    setError('');
    try {
      await apiRequest(`/notifications/${notification._id}/read`, { method: 'PATCH' });
      setNotifications((current) => current.map((entry) => (
        entry._id === notification._id ? { ...entry, isRead: true } : entry
      )));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="notification-trigger"
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-popover"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <section
          className="notification-popover"
          id="notification-popover"
          aria-label="Notifications"
        >
          <header className="notification-popover-header">
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span>
            </div>
            <button
              className="notification-close"
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </header>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {loading ? (
            <p className="notification-empty">Loading notifications…</p>
          ) : notifications.length ? (
            <div className="notification-list">
              {notifications.slice(0, 8).map((notification) => (
                <button
                  className={`notification-item ${notification.isRead ? '' : 'notification-unread'}`}
                  key={notification._id}
                  type="button"
                  onClick={() => markAsRead(notification)}
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <small>{new Date(notification.createdAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          ) : !error ? (
            <p className="notification-empty">No notifications yet.</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
