import { useEffect, useState } from 'react';
import { Activity, CircleUserRound, ClipboardList, FileText, Package, RefreshCw, ShieldCheck, Store, Users } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const statCards = [
  ['users', 'Total users', Users],
  ['customers', 'Customers', CircleUserRound],
  ['electricians', 'Electricians', Activity],
  ['shops', 'Registered shops', Store],
  ['activeRequests', 'Active requests', Package],
  ['orders', 'Shop orders', ShieldCheck],
];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [report, setReport] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', category: '', brand: '', unit: 'PCS', sku: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAdminData() {
    setLoading(true); setError('');
    try {
      const [overviewResult, usersResult, shopsResult, ordersResult, productsResult, auditResult, requestResult, invoiceResult, reportResult] = await Promise.all([
        apiRequest('/admin/overview'),
        apiRequest('/admin/users?limit=8'),
        apiRequest('/admin/shops?status=PENDING'),
        apiRequest('/admin/orders'),
        apiRequest('/products?limit=100'),
        apiRequest('/admin/audit-logs?limit=8'),
        apiRequest('/requests'),
        apiRequest('/admin/invoices'),
        apiRequest('/admin/reports?days=30'),
      ]);
      setOverview(overviewResult.data.totals);
      setUsers(usersResult.data.users);
      setShops(shopsResult.data.shops);
      setOrders(ordersResult.data.orders);
      setProducts(productsResult.data.items);
      setAuditLogs(auditResult.data.logs);
      setRequests(requestResult.data.requests);
      setInvoices(invoiceResult.data.invoices);
      setReport(reportResult.data.report);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadAdminData(); }, []);

  async function changeStatus(user, status) {
    try {
      await apiRequest(`/admin/users/${user._id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadAdminData();
    } catch (requestError) { setError(requestError.message); }
  }

  async function verifyShop(shopId, status) {
    try { await apiRequest(`/admin/shops/${shopId}/verification`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadAdminData(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createProduct(event) {
    event.preventDefault(); setError('');
    try { await apiRequest('/products', { method: 'POST', body: JSON.stringify(productForm) }); setProductForm({ name: '', category: '', brand: '', unit: 'PCS', sku: '' }); await loadAdminData(); }
    catch (requestError) { setError(requestError.message); }
  }

  if (loading && !overview) return <main className="dashboard-page"><div className="page-loading">Loading administrator workspace...</div></main>;

  return (
    <main className="dashboard-page admin-page">
      <section className="dashboard-hero">
        <div><div className="eyebrow">SUPER ADMIN · LIVE OPERATIONS</div><h1>Platform overview</h1><p>Monitor Homegrid activity and keep account access in good standing.</p></div>
        <button className="button button-outline admin-refresh" onClick={loadAdminData} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </section>
      {error && <div className="alert alert-error admin-alert">{error}</div>}
      <section className="admin-stat-grid">
        {statCards.map(([key, label, Icon]) => <article className="admin-stat" key={key}><Icon size={19} /><strong>{overview?.[key] ?? 0}</strong><span>{label}</span></article>)}
      </section>
      <section className="admin-detail-grid">
        <article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">ACCOUNT CONTROL</div><h2>Recent users</h2></div><span className="status-pill status-ready">{overview?.users ?? 0} total</span></div>
          <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {users.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><small>{user.email || user.phone || 'No contact provided'}</small></td><td>{user.roles.join(', ')}</td><td><span className={`status-pill ${user.accountStatus === 'ACTIVE' ? 'status-ready' : 'status-next'}`}>{user.accountStatus}</span></td><td>{user.accountStatus === 'ACTIVE' ? <button className="table-action" onClick={() => changeStatus(user, 'SUSPENDED')}>Suspend</button> : <button className="table-action" onClick={() => changeStatus(user, 'ACTIVE')}>Activate</button>}</td></tr>)}
          </tbody></table></div>
        </article>
        <article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">PLATFORM HEALTH</div><h2>Operational totals</h2></div></div><dl className="admin-list"><div><dt>Verified shops</dt><dd>{overview?.verifiedShops ?? 0}</dd></div><div><dt>Pending shop approvals</dt><dd>{overview?.pendingShops ?? 0}</dd></div><div><dt>Completed requests</dt><dd>{overview?.completedRequests ?? 0}</dd></div><div><dt>Issued invoices</dt><dd>{overview?.invoices ?? 0}</dd></div><div><dt>Gross sales value</dt><dd>₹{((overview?.salesPaise ?? 0) / 100).toLocaleString('en-IN')}</dd></div></dl></article>
        <article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">REPORTING</div><h2>30-day performance</h2></div><span className="status-pill status-ready">{report?.rangeDays ?? 30} days</span></div>{!report ? <div className="empty-state"><Activity size={23} /><p>No report data available yet.</p></div> : <div className="compact-list">{report.salesByDay.slice(-7).map((day) => <div key={day.date}><strong>{day.date}</strong><span>₹{(day.totalPaise / 100).toLocaleString('en-IN')} · {day.invoiceCount} invoices</span></div>)}<div><strong>Sales total</strong><span>₹{((report.totalSalesPaise ?? 0) / 100).toLocaleString('en-IN')}</span></div><div><strong>Average invoice</strong><span>₹{((report.avgInvoiceValuePaise ?? 0) / 100).toLocaleString('en-IN')}</span></div></div>}</article>
        <article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">SHOP VERIFICATION</div><h2>Pending shops</h2></div><span className="status-pill status-next">{shops.length} pending</span></div>{!shops.length ? <div className="empty-state"><Store size={23} /><p>No pending shop approvals.</p></div> : <div className="admin-shop-list">{shops.map((shop) => <article key={shop._id}><div><strong>{shop.businessName}</strong><small>{shop.ownerUserId?.name || 'Owner'} · {shop.contactPhone || shop.ownerUserId?.phone || 'No phone'}</small></div><div><button className="table-action" onClick={() => verifyShop(shop._id, 'VERIFIED')}>Verify</button> <button className="table-action" onClick={() => verifyShop(shop._id, 'REJECTED')}>Reject</button></div></article>)}</div>}</article>
      </section>
      <section className="admin-panel admin-orders-panel"><div className="panel-heading"><div><div className="eyebrow">ORDER MONITORING</div><h2>Recent shop orders</h2></div><span className="status-pill status-ready">{orders.length} orders</span></div>{!orders.length ? <div className="empty-state"><Package size={23} /><p>No shop orders recorded yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Shop</th><th>Request</th><th>Status</th><th>Total</th></tr></thead><tbody>{orders.slice(0, 20).map((order) => <tr key={order._id}><td><strong>{order.orderCode}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></td><td>{order.shopId?.businessName || '-'}</td><td>{order.requestId?.requestCode || '-'}</td><td><span className="status-pill status-readonly">{order.status}</span></td><td>₹{(order.totalPaise / 100).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>}</section>
      <section className="admin-detail-grid admin-catalogue-grid"><form className="admin-panel form-stack" onSubmit={createProduct}><div className="panel-heading"><div><div className="eyebrow">PRODUCT CATALOGUE</div><h2>Add product</h2></div><Package size={20} /></div><label>Name<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required /></label><div className="form-grid"><label>Category<input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} required /></label><label>Unit<select value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}><option>PCS</option><option>METRE</option><option>ROLL</option><option>BOX</option><option>SET</option><option>KG</option><option>OTHER</option></select></label></div><div className="form-grid"><label>Brand<input value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} /></label><label>SKU<input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value.toUpperCase() })} /></label></div><button className="button button-primary">Add catalogue product</button></form><article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">ACTIVE CATALOGUE</div><h2>{products.length} products</h2></div></div>{!products.length ? <div className="empty-state"><Package size={23} /><p>No active catalogue products.</p></div> : <div className="compact-list">{products.slice(0, 10).map((product) => <div key={product._id}><strong>{product.name}</strong><span>{product.category} · {product.brand || 'Any brand'} · {product.unit}</span></div>)}</div>}</article></section>
      <section className="admin-panel admin-orders-panel"><div className="panel-heading"><div><div className="eyebrow">AUDIT TRAIL</div><h2>Recent administrator actions</h2></div><ShieldCheck size={19} /></div>{!auditLogs.length ? <div className="empty-state"><ShieldCheck size={23} /><p>No administrator actions recorded yet.</p></div> : <div className="compact-list">{auditLogs.map((log) => <div key={log._id}><strong>{log.action.replaceAll('_', ' ')}</strong><span>{log.performedBy?.name || 'Administrator'} · {log.entityType} · {new Date(log.createdAt).toLocaleString()}</span></div>)}</div>}</section>
      <section className="admin-panel admin-orders-panel"><div className="panel-heading"><div><div className="eyebrow">REQUEST MONITORING</div><h2>Material requests</h2></div><span className="status-pill status-ready">{requests.length} requests</span></div>{!requests.length ? <div className="empty-state"><ClipboardList size={23} /><p>No material requests recorded yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Request ID</th><th>Status</th><th>Items</th><th>Created</th></tr></thead><tbody>{requests.slice(0, 20).map((request) => <tr key={request.id}><td><strong>{request.requestCode}</strong></td><td><span className="status-pill status-readonly">{request.status}</span></td><td>{request.items.length}</td><td>{new Date(request.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
      <section className="admin-panel admin-orders-panel"><div className="panel-heading"><div><div className="eyebrow">INVOICE MONITORING</div><h2>Shop invoices</h2></div><span className="status-pill status-ready">{invoices.length} invoices</span></div>{!invoices.length ? <div className="empty-state"><FileText size={23} /><p>No shop invoices recorded yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Shop</th><th>Request</th><th>Status</th><th>Total</th></tr></thead><tbody>{invoices.slice(0, 20).map((invoice) => <tr key={invoice._id}><td><strong>{invoice.invoiceNumber}</strong><small>{new Date(invoice.issuedAt).toLocaleDateString()}</small></td><td>{invoice.shopId?.businessName || '-'}</td><td>{invoice.requestId?.requestCode || '-'}</td><td><span className={`status-pill ${invoice.status === 'ISSUED' ? 'status-ready' : 'status-next'}`}>{invoice.status}</span></td><td>₹{(invoice.totalPaise / 100).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>}</section>
    </main>
  );
}