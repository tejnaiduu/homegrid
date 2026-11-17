import { useEffect, useRef, useState } from 'react';
import { Bell, ClipboardList, FileText, QrCode, RefreshCw, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getApiBase } from '../services/api.js';

const DEFAULT_API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

function money(paise = 0) { return `₹${(paise / 100).toLocaleString('en-IN')}`; }
function pending(item) { return Math.max(0, item.requestedQty - item.reservedQty - item.fulfilledQty); }
function normalizeRequestCodeInput(value) {
  const cleaned = value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  if (!cleaned) return '';
  return cleaned.startsWith('EL-') ? cleaned : `EL-${cleaned}`;
}

export default function CustomerDashboardPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accessRequests, setAccessRequests] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [returns, setReturns] = useState([]);
  const [returnForms, setReturnForms] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [requestCode, setRequestCode] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getApiBase().then((resolvedBase) => { if (active) setApiBase(resolvedBase); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function loadRequests() {
    setLoading(true); setError('');
    try { const result = await apiRequest('/requests'); setRequests(result.data.requests); if (result.data.requests[0]) await selectRequest(result.data.requests[0]); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  async function selectRequest(request) {
    setSelected(request); setError('');
    try {
      const [detail, invoiceResult, summaryResult, purchaseResult, returnResult] = await Promise.all([
        apiRequest(`/requests/${request.id}`), apiRequest(`/requests/${request.id}/invoices`), apiRequest(`/requests/${request.id}/purchase-summary`), apiRequest(`/requests/${request.id}/purchases`), apiRequest(`/requests/${request.id}/returns`),
      ]);
      setSelected(detail.data.request); setInvoices(invoiceResult.data.invoices); setSummary(summaryResult.data.summary);
      setPurchases(purchaseResult.data.orders); setReturns(returnResult.data.returns);
      const accessResult = await apiRequest(`/requests/${request.id}/shop-access-requests`);
      setAccessRequests(accessResult.data.requests);
    } catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { loadRequests(); }, []);
  useEffect(() => {
    const loadNotifications = () => apiRequest('/notifications').then((result) => setNotifications(result.data.notifications)).catch(() => {});
    loadNotifications();
    window.addEventListener('wireflow:notification', loadNotifications);
    return () => window.removeEventListener('wireflow:notification', loadNotifications);
  }, []);

  async function lookupRequest(event) {
    event.preventDefault(); setError('');
    try {
      const result = await apiRequest(`/requests/by-code/${encodeURIComponent(requestCode.trim())}`);
      const request = result.data.request;
      setRequests((current) => current.some((entry) => entry.id === request.id) ? current : [request, ...current]);
      setRequestCode(''); await selectRequest(request);
    } catch (requestError) { setError(requestError.message); }
  }

  async function markNotificationRead(notification) {
    try {
      await apiRequest(`/notifications/${notification._id}/read`, { method: 'PATCH' });
      setNotifications((current) => current.map((entry) => entry._id === notification._id ? { ...entry, isRead: true } : entry));
    } catch (requestError) { setError(requestError.message); }
  }

  function downloadInvoice(invoiceId) { window.open(`${apiBase}/invoices/${invoiceId}/pdf`, '_blank', 'noopener,noreferrer'); }

  function openQrLink(event) {
    event.preventDefault();
    const value = qrValue.trim();
    const token = value.includes('/access/') ? value.split('/access/')[1].split(/[?#]/)[0] : value;
    if (!token) return setError('Enter a valid QR access link or token.');
    navigate(`/access/${encodeURIComponent(token)}`);
  }

  async function startScanner() {
    setScannerError('');
    if (!('BarcodeDetector' in window)) return setScannerError('Camera scanning is not supported in this browser. Paste the QR link instead.');
    if (!navigator.mediaDevices?.getUserMedia) return setScannerError('Camera access is unavailable. Paste the QR link instead.');
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); setScanning(true); }
    catch { setScannerError('Camera permission was denied. Paste the QR link instead.'); }
  }

  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return undefined;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let active = true;
    const scan = async () => {
      if (!active) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) { setQrValue(codes[0].rawValue); setScanning(false); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; return; }
      } catch { /* Camera frames can be unavailable while the video starts. */ }
      window.setTimeout(scan, 250);
    };
    video.play().then(scan).catch(() => setScannerError('Unable to start the camera preview.'));
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  }, [scanning]);

  function printInvoices() { window.print(); }
  function downloadSummary() { window.open(`${apiBase}/requests/${selected.id}/purchase-summary/pdf`, '_blank', 'noopener,noreferrer'); }
  async function decideAccess(shopId, decision) {
    try { await apiRequest(`/requests/${selected.id}/shop-access/${shopId}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }); await selectRequest(selected); }
    catch (requestError) { setError(requestError.message); }
  }
  function remainingReturnQty(order, line, lineIndex) {
    const alreadyReturnedOrPending = returns
      .filter((entry) => {
        const orderId = entry.orderId?._id || entry.orderId;
        return String(orderId) === order._id
          && entry.orderLineIndex === lineIndex
          && ['PENDING', 'PROCESSING', 'APPROVED'].includes(entry.status);
      })
      .reduce((total, entry) => total + entry.quantity, 0);
    return Math.max(0, line.fulfilledQty - alreadyReturnedOrPending);
  }
  function updateReturnForm(orderId, lineIndex, field, value) {
    const key = `${orderId}:${lineIndex}`;
    setReturnForms((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }
  async function submitReturn(event, order, lineIndex) {
    event.preventDefault(); setError(''); setMessage('');
    const key = `${order._id}:${lineIndex}`;
    const form = returnForms[key] || {};
    try {
      await apiRequest(`/requests/${selected.id}/returns`, {
        method: 'POST',
        body: JSON.stringify({ orderId: order._id, lineIndex, quantity: Number(form.quantity), reason: form.reason }),
      });
      setReturnForms((current) => ({ ...current, [key]: { quantity: '', reason: '' } }));
      setMessage('Return request sent to the shop for review.');
      await selectRequest(selected);
    } catch (requestError) { setError(requestError.message); }
  }
  if (loading && !requests.length) return <main className="dashboard-page"><div className="page-loading">Loading customer workspace...</div></main>;

  return (
    <main className="dashboard-page customer-page">
      <section className="dashboard-hero"><div><div className="eyebrow">CUSTOMER · PURCHASE TRACKING</div><h1>Your material requests</h1><p>Track original requirements, fulfilled quantities and shop invoices from one place.</p></div><button className="button button-outline admin-refresh" onClick={loadRequests}><RefreshCw size={16} /> Refresh</button></section>
      {error && <div className="alert alert-error admin-alert">{error}</div>}
      {message && <div className="alert alert-success admin-alert">{message}</div>}
      <section className="customer-tools"><form className="admin-panel request-lookup-form" onSubmit={lookupRequest}><div className="eyebrow">OPEN REQUEST</div><div className="inline-form"><input value={requestCode} onChange={(e) => setRequestCode(normalizeRequestCodeInput(e.target.value))} placeholder="Enter Material Request ID" required /><button className="button button-primary">Open</button></div></form><form className="admin-panel request-lookup-form" onSubmit={openQrLink}><div className="eyebrow"><QrCode size={13} /> QR ACCESS</div><div className="inline-form"><input value={qrValue} onChange={(e) => setQrValue(e.target.value)} placeholder="Paste scanned QR link or token" required /><button className="button button-primary">Open</button></div><button type="button" className="button button-outline scanner-button" onClick={startScanner}>Use camera</button>{scannerError && <p className="scanner-error">{scannerError}</p>}{scanning && <video ref={videoRef} className="qr-camera" muted playsInline />}</form><section className="admin-panel notification-panel"><div className="panel-heading"><div><div className="eyebrow">NOTIFICATIONS</div><h2><Bell size={16} /> {notifications.filter((entry) => !entry.isRead).length} unread</h2></div></div>{notifications.length ? notifications.slice(0, 4).map((notification) => <button className={`notification-item ${notification.isRead ? '' : 'notification-unread'}`} key={notification._id} onClick={() => markNotificationRead(notification)}><strong>{notification.title}</strong><span>{notification.message}</span></button>) : <p className="muted small-note">No notifications yet.</p>}</section></section>
      {!requests.length ? <section className="admin-panel empty-state customer-empty"><ClipboardList size={28} /><h2>No requests linked yet</h2><p>Your electrician will need to link a material request to your account.</p></section> : <section className="customer-layout"><aside className="admin-panel request-list"><div className="panel-heading"><div><div className="eyebrow">MY REQUESTS</div><h2>{requests.length} request{requests.length === 1 ? '' : 's'}</h2></div></div>{requests.map((request) => <button className={`request-list-item ${selected?.id === request.id ? 'request-list-active' : ''}`} key={request.id} onClick={() => selectRequest(request)}><strong>{request.requestCode}</strong><span>{request.status.replaceAll('_', ' ')}</span></button>)}</aside>
        {selected && <section className="admin-panel customer-detail"><div className="panel-heading"><div><div className="eyebrow">MATERIAL REQUEST</div><h2>{selected.requestCode}</h2></div><div><span className="status-pill status-ready">{selected.status}</span>{invoices.length > 0 && <button className="table-action" onClick={printInvoices}>Print summary</button>}{summary && <button className="table-action" onClick={downloadSummary}>Summary PDF</button>}</div></div>{accessRequests.length > 0 && <div className="access-request-box"><h3>Shop access requests</h3>{accessRequests.map((access) => <article key={access._id}><div><strong>{access.shopId?.businessName || 'Electrical shop'}</strong><small>{access.shopId?.contactPhone || 'Contact unavailable'}</small></div><div><button className="table-action" onClick={() => decideAccess(access.shopId._id, 'APPROVE')}>Approve</button> <button className="table-action" onClick={() => decideAccess(access.shopId._id, 'REJECT')}>Reject</button></div></article>)}</div>}<div className="table-wrap"><table><thead><tr><th>Material</th><th>Requested</th><th>Reserved</th><th>Fulfilled</th><th>Remaining</th></tr></thead><tbody>{selected.items.map((item) => <tr key={item.itemId}><td><strong>{item.name}</strong><small>{item.brandPreference || item.category || item.itemType}</small></td><td>{item.requestedQty} {item.unit}</td><td>{item.reservedQty} {item.unit}</td><td>{item.fulfilledQty} {item.unit}</td><td>{pending(item)} {item.unit}</td></tr>)}</tbody></table></div><div className="purchase-summary-grid"><div><Wallet size={18} /><span>Purchase total</span><strong>{money(summary?.totalPaise)}</strong></div><div><FileText size={18} /><span>Issued invoices</span><strong>{invoices.length}</strong></div></div>{purchases.length > 0 && <div className="invoice-list"><h3>Shop purchases</h3><p className="muted small-note">Approved returns are added back to shop stock. Refunds are not processed in WireFlow.</p>{purchases.map((order) => <article className="customer-order" key={order._id}><div className="customer-order-heading"><div><strong>{order.shopId?.businessName || 'Electrical shop'}</strong><small>{order.orderCode} · {order.status}</small></div><strong>{money(order.totalPaise)}</strong></div>{order.status === 'FULFILLED' && order.lines.length > 0 && <div className="return-line-list">{order.lines.map((line, lineIndex) => { const key = `${order._id}:${lineIndex}`; const form = returnForms[key] || {}; const availableQty = remainingReturnQty(order, line, lineIndex); return <div className="return-line" key={key}><div><strong>{line.itemNameSnapshot}</strong><small>Fulfilled: {line.fulfilledQty} {line.unit} · Returnable: {availableQty} {line.unit}</small></div>{availableQty > 0 && <form className="return-request-form" onSubmit={(event) => submitReturn(event, order, lineIndex)}><label>Quantity<input aria-label={`Return quantity for ${line.itemNameSnapshot}`} type="number" min="0.001" max={availableQty} step="0.001" value={form.quantity || ''} onChange={(event) => updateReturnForm(order._id, lineIndex, 'quantity', event.target.value)} required /></label><label>Reason<input aria-label={`Return reason for ${line.itemNameSnapshot}`} value={form.reason || ''} onChange={(event) => updateReturnForm(order._id, lineIndex, 'reason', event.target.value)} maxLength={500} required /></label><button className="button button-outline">Request return</button></form>}</div>; })}</div>}</article>)}</div>}{returns.length > 0 && <div className="invoice-list"><h3>Return request history</h3>{returns.map((returnRequest) => <article key={returnRequest._id}><div><strong>{returnRequest.itemName} · {returnRequest.quantity} {returnRequest.unit}</strong><small>{returnRequest.orderId?.orderCode || 'Shop order'} · {returnRequest.reason}{returnRequest.decisionReason ? ` · ${returnRequest.decisionReason}` : ''}</small></div><span className={`status-pill ${returnRequest.status === 'APPROVED' ? 'status-ready' : returnRequest.status === 'PENDING' ? 'status-next' : 'status-readonly'}`}>{returnRequest.status}</span></article>)}</div>}{invoices.length > 0 && <div className="invoice-list"><h3>Shop invoices</h3>{invoices.map((invoice) => <article key={invoice._id}><div><strong>{invoice.invoiceNumber}</strong><small>{invoice.sellerSnapshot?.businessName || 'Electrical shop'}</small></div><div><strong>{money(invoice.totalPaise)}</strong><button className="table-action" onClick={() => downloadInvoice(invoice._id)}>Download PDF</button></div></article>)}</div>}</section>}
      </section>}
    </main>
  );
}