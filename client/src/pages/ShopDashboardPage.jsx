import { useEffect, useState } from 'react';
import { Bell, ClipboardList, Package, Plus, RefreshCw, Store } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const emptyBranch = { branchName: '', phone: '', line1: '', city: '' };

function normalizeRequestCodeInput(value) {
  const cleaned = value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  if (!cleaned) return '';
  return cleaned.startsWith('EL-') ? cleaned : `EL-${cleaned}`;
}

export default function ShopDashboardPage() {
  const [shop, setShop] = useState(null);
  const [branches, setBranches] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [orderBranchId, setOrderBranchId] = useState('');
  const [orderLines, setOrderLines] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryForm, setInventoryForm] = useState({ branchId: '', productId: '', customName: '', unit: 'PCS', sku: '', quantityOnHand: '', sellingPrice: '', lowStockThreshold: '' });
  const [profile, setProfile] = useState({ businessName: '', contactPhone: '', gstNumber: '' });
  const [branch, setBranch] = useState(emptyBranch);
  const [requestCode, setRequestCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadShop() {
    setLoading(true); setError('');
    try {
      const [shopResult, branchResult, inventoryResult, ordersResult, returnResult, lowStockResult, productResult, movementResult] = await Promise.all([
        apiRequest('/shop/profile'), apiRequest('/shop/branches'), apiRequest('/shop/inventory'), apiRequest('/shop/orders'), apiRequest('/shop/returns?status=PENDING'), apiRequest('/shop/inventory/low-stock'), apiRequest('/products?limit=100'), apiRequest('/shop/inventory/movements'),
      ]);
      setShop(shopResult.data.shop); setBranches(branchResult.data.branches); setInventory(inventoryResult.data.items);
      setOrders(ordersResult.data.orders); setReturnRequests(returnResult.data.returns);
      setLowStock(lowStockResult.data.items);
      setProducts(productResult.data.items);
      setMovements(movementResult.data.movements);
      if (shopResult.data.shop) setProfile({ businessName: shopResult.data.shop.businessName, contactPhone: shopResult.data.shop.contactPhone || '', gstNumber: shopResult.data.shop.gstNumber || '' });
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadShop(); }, []);
  useEffect(() => {
    const loadNotifications = () => apiRequest('/notifications').then((result) => setNotifications(result.data.notifications)).catch(() => {});
    loadNotifications();
    window.addEventListener('homegrid:notification', loadNotifications);
    return () => window.removeEventListener('homegrid:notification', loadNotifications);
  }, []);

  async function saveProfile(event) {
    event.preventDefault(); setError(''); setMessage('');
    try { const result = await apiRequest('/shop/profile', { method: 'PUT', body: JSON.stringify(profile) }); setShop(result.data.shop); setMessage('Shop profile saved.'); }
    catch (requestError) { setError(requestError.message); }
  }

  async function addBranch(event) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      await apiRequest('/shop/branches', { method: 'POST', body: JSON.stringify({ branchName: branch.branchName, phone: branch.phone, address: { line1: branch.line1, city: branch.city } }) });
      setBranch(emptyBranch); setMessage('Branch added.'); await loadShop();
    } catch (requestError) { setError(requestError.message); }
  }

  async function moveStock(item, movementType) {
    const quantity = window.prompt(`Quantity to ${movementType === 'SALE_OUT' ? 'remove' : 'add'} for ${item.customName || item.productId?.name || item.sku}`);
    if (quantity === null) return;
    setError(''); setMessage('');
    try { await apiRequest(`/shop/inventory/${item._id}/stock`, { method: 'POST', body: JSON.stringify({ quantity: Number(quantity), movementType }) }); setMessage('Stock updated.'); await loadShop(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function requestAccess(event) {
    event.preventDefault(); setError(''); setMessage('');
    try { await apiRequest(`/shop/requests/${encodeURIComponent(requestCode.trim())}/access-request`, { method: 'POST' }); setMessage('Access request sent to the customer.'); setRequestCode(''); }
    catch (requestError) { setError(requestError.message); }
  }

  async function addInventory(event) {
    event.preventDefault(); setError(''); setMessage('');
    const product = products.find((entry) => entry._id === inventoryForm.productId);
    if ((!product && !inventoryForm.customName.trim()) || !inventoryForm.branchId || !inventoryForm.sku || Number(inventoryForm.sellingPrice) < 0) return setError('Branch, product or custom name, SKU and valid selling price are required.');
    try { await apiRequest('/shop/inventory', { method: 'POST', body: JSON.stringify({ branchId: inventoryForm.branchId, productId: product?._id, customName: inventoryForm.customName || undefined, unit: product?.unit || inventoryForm.unit, sku: inventoryForm.sku, quantityOnHand: Number(inventoryForm.quantityOnHand || 0), sellingPricePaise: Math.round(Number(inventoryForm.sellingPrice) * 100), lowStockThreshold: Number(inventoryForm.lowStockThreshold || 0) }) }); setInventoryForm({ branchId: '', productId: '', customName: '', unit: 'PCS', sku: '', quantityOnHand: '', sellingPrice: '', lowStockThreshold: '' }); setMessage('Inventory item added.'); await loadShop(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function lookupRequest(event) {
    event.preventDefault(); setError(''); setMessage('');
    try { const result = await apiRequest(`/shop/requests/${encodeURIComponent(lookupCode.trim())}`); setLookupResult(result.data); setOrderBranchId(branches[0]?._id || ''); setOrderLines({}); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createOrder() {
    const lines = Object.entries(orderLines).filter(([, quantity]) => Number(quantity) > 0).map(([requestItemId, offeredQty]) => ({ requestItemId, offeredQty: Number(offeredQty), inventoryItemId: lookupResult.items.find((item) => item.itemId === requestItemId)?.inventory.find((stock) => stock.branchId === orderBranchId)?.id }));
    if (!orderBranchId || !lines.length || lines.some((line) => !line.inventoryItemId)) return setError('Select a branch and positive quantities with available stock.');
    try { await apiRequest(`/shop/requests/${lookupResult.request.requestCode}/orders`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ branchId: orderBranchId, lines }) }); setMessage('Order submitted and stock reserved.'); setLookupResult(null); setOrderLines({}); await loadShop(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function fulfilOrder(orderId) {
    setError(''); setMessage('');
    try { await apiRequest(`/shop/orders/${orderId}/fulfil`, { method: 'POST' }); setMessage('Order fulfilled and invoice issued.'); await loadShop(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function decideReturnRequest(returnId, decision) {
    setError(''); setMessage('');
    try {
      await apiRequest(`/shop/returns/${returnId}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      setMessage(decision === 'APPROVE' ? 'Return approved and stock restored.' : 'Return rejected.');
      await loadShop();
    } catch (requestError) { setError(requestError.message); }
  }

  async function cancelOrder(orderId) {
    if (!window.confirm('Cancel this order and release its reservations?')) return;
    setError(''); setMessage('');
    try { await apiRequest(`/shop/orders/${orderId}/cancel`, { method: 'POST' }); setMessage('Order cancelled and reservations released.'); await loadShop(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function markNotificationRead(notification) {
    try { await apiRequest(`/notifications/${notification._id}/read`, { method: 'PATCH' }); setNotifications((current) => current.map((entry) => entry._id === notification._id ? { ...entry, isRead: true } : entry)); }
    catch (requestError) { setError(requestError.message); }
  }

  if (loading) return <main className="dashboard-page"><div className="page-loading">Loading shop workspace...</div></main>;

  return (
    <main className="dashboard-page shop-page">
      <section className="dashboard-hero"><div><div className="eyebrow">SHOP OWNER · OPERATIONS</div><h1>{shop?.businessName || 'Set up your shop'}</h1><p>Manage branches and stock available for future material requests.</p></div><button className="button button-outline admin-refresh" onClick={loadShop}><RefreshCw size={16} /> Refresh</button></section>
      {error && <div className="alert alert-error admin-alert">{error}</div>}{message && <div className="alert alert-success admin-alert">{message}</div>}
      <section className="admin-panel shop-notifications"><div className="panel-heading"><div><div className="eyebrow">NOTIFICATIONS</div><h2><Bell size={16} /> {notifications.filter((entry) => !entry.isRead).length} unread</h2></div></div>{notifications.length ? notifications.slice(0, 5).map((notification) => <button className={`notification-item ${notification.isRead ? '' : 'notification-unread'}`} key={notification._id} onClick={() => markNotificationRead(notification)}><strong>{notification.title}</strong><span>{notification.message}</span></button>) : <p className="muted small-note">No notifications yet.</p>}</section>
      <section className="shop-form-grid">
        <form className="admin-panel form-stack" onSubmit={saveProfile}><div className="panel-heading"><div><div className="eyebrow">BUSINESS PROFILE</div><h2>Shop details</h2></div><Store size={20} /></div><label>Business name<input value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} required /></label><label>Contact phone<input value={profile.contactPhone} onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })} /></label><label>GST number<input value={profile.gstNumber} onChange={(e) => setProfile({ ...profile, gstNumber: e.target.value })} /></label><button className="button button-primary">Save profile</button>{shop && <span className="status-pill status-next">Verification: {shop.verificationStatus}</span>}</form>
        <form className="admin-panel form-stack" onSubmit={addBranch}><div className="panel-heading"><div><div className="eyebrow">BRANCH MANAGEMENT</div><h2>Add branch</h2></div><Plus size={20} /></div><label>Branch name<input value={branch.branchName} onChange={(e) => setBranch({ ...branch, branchName: e.target.value })} required /></label><label>Phone<input value={branch.phone} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} /></label><label>Address line<input value={branch.line1} onChange={(e) => setBranch({ ...branch, line1: e.target.value })} required /></label><label>City<input value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} required /></label><button className="button button-primary" disabled={!shop}>Add branch</button></form>
        <form className="admin-panel form-stack" onSubmit={requestAccess}><div className="panel-heading"><div><div className="eyebrow">CUSTOMER ACCESS</div><h2>Request material access</h2></div><Package size={20} /></div><label>Material Request ID<input value={requestCode} onChange={(e) => setRequestCode(normalizeRequestCodeInput(e.target.value))} placeholder="EL-..." required /></label><button className="button button-primary" disabled={!shop}>Request approval</button></form>
        <form className="admin-panel form-stack" onSubmit={addInventory}><div className="panel-heading"><div><div className="eyebrow">INVENTORY SETUP</div><h2>Add stock item</h2></div><Package size={20} /></div><label>Branch<select value={inventoryForm.branchId} onChange={(e) => setInventoryForm({ ...inventoryForm, branchId: e.target.value })} required><option value="">Select branch</option>{branches.map((entry) => <option value={entry._id} key={entry._id}>{entry.branchName}</option>)}</select></label><label>Catalogue product<select value={inventoryForm.productId} onChange={(e) => setInventoryForm({ ...inventoryForm, productId: e.target.value })}><option value="">None - custom item</option>{products.map((entry) => <option value={entry._id} key={entry._id}>{entry.name} · {entry.unit}</option>)}</select></label><label>Custom item name<input value={inventoryForm.customName} onChange={(e) => setInventoryForm({ ...inventoryForm, customName: e.target.value, productId: '' })} placeholder="Optional if catalogue product is selected" /></label><div className="form-grid"><label>SKU<input value={inventoryForm.sku} onChange={(e) => setInventoryForm({ ...inventoryForm, sku: e.target.value.toUpperCase() })} required /></label><label>Unit<select value={inventoryForm.unit} onChange={(e) => setInventoryForm({ ...inventoryForm, unit: e.target.value })}><option>PCS</option><option>METRE</option><option>ROLL</option><option>BOX</option><option>SET</option><option>KG</option><option>OTHER</option></select></label></div><div className="form-grid"><label>Quantity<input type="number" min="0" step="0.001" value={inventoryForm.quantityOnHand} onChange={(e) => setInventoryForm({ ...inventoryForm, quantityOnHand: e.target.value })} /></label><label>Selling price (₹)<input type="number" min="0" step="0.01" value={inventoryForm.sellingPrice} onChange={(e) => setInventoryForm({ ...inventoryForm, sellingPrice: e.target.value })} required /></label></div><label>Low-stock threshold<input type="number" min="0" step="0.001" value={inventoryForm.lowStockThreshold} onChange={(e) => setInventoryForm({ ...inventoryForm, lowStockThreshold: e.target.value })} /></label><button className="button button-primary" disabled={!shop || !branches.length}>Add inventory item</button></form>
        <form className="admin-panel form-stack" onSubmit={lookupRequest}><div className="panel-heading"><div><div className="eyebrow">REQUEST LOOKUP</div><h2>Supply a request</h2></div><ClipboardList size={20} /></div><label>Material Request ID<input value={lookupCode} onChange={(e) => setLookupCode(normalizeRequestCodeInput(e.target.value))} placeholder="EL-..." required /></label><button className="button button-primary" disabled={!shop}>Look up request</button></form>
      </section>
      {lookupResult && <section className="admin-panel request-order-panel"><div className="panel-heading"><div><div className="eyebrow">AVAILABLE REQUIREMENTS</div><h2>{lookupResult.request.requestCode}</h2></div><span className="status-pill status-readonly">{lookupResult.request.status}</span></div><label className="order-branch-label">Supply from branch<select value={orderBranchId} onChange={(e) => setOrderBranchId(e.target.value)}><option value="">Select branch</option>{branches.map((entry) => <option value={entry._id} key={entry._id}>{entry.branchName}</option>)}</select></label><div className="table-wrap"><table><thead><tr><th>Material</th><th>Remaining</th><th>Available</th><th>Supply</th></tr></thead><tbody>{lookupResult.items.map((item) => { const stock = item.inventory.find((entry) => entry.branchId === orderBranchId); return <tr key={item.itemId}><td><strong>{item.name}</strong><small>{item.brandPreference || item.unit}</small></td><td>{item.remainingQty} {item.unit}</td><td>{stock?.availableQty || 0} {item.unit}</td><td><input className="quantity-input" type="number" min="0" max={Math.min(item.remainingQty, stock?.availableQty || 0)} step="0.001" value={orderLines[item.itemId] || ''} onChange={(e) => setOrderLines({ ...orderLines, [item.itemId]: e.target.value })} /></td></tr>; })}</tbody></table></div><button className="button button-primary" onClick={createOrder}>Reserve and create order</button></section>}
      <section className="admin-panel shop-inventory-panel"><div className="panel-heading"><div><div className="eyebrow">STOCK CONTROL</div><h2>Inventory</h2></div><span className="status-pill status-ready">{inventory.length} items</span></div>{!inventory.length ? <div className="empty-state"><Package size={23} /><p>No inventory items yet. Add catalogue-linked inventory through the API.</p></div> : <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Branch</th><th>On hand</th><th>Available</th><th>Price</th><th>Stock</th></tr></thead><tbody>{inventory.map((item) => <tr key={item._id}><td>{item.sku}</td><td><strong>{item.customName || item.productId?.name || 'Custom item'}</strong><small>{item.unit}</small></td><td>{branches.find((entry) => entry._id === item.branchId)?.branchName || '-'}</td><td>{item.quantityOnHand}</td><td>{item.quantityOnHand - item.quantityReserved}</td><td>₹{(item.sellingPricePaise / 100).toLocaleString('en-IN')}</td><td><button className="table-action" onClick={() => moveStock(item, 'PURCHASE_IN')}>Stock in</button> <button className="table-action" onClick={() => moveStock(item, 'SALE_OUT')}>Stock out</button></td></tr>)}</tbody></table></div>}</section>
      <section className="admin-panel shop-inventory-panel"><div className="panel-heading"><div><div className="eyebrow">ORDER HISTORY</div><h2>Shop orders</h2></div><span className="status-pill status-ready">{orders.length} orders</span></div>{!orders.length ? <div className="empty-state"><Package size={23} /><p>No shop orders yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Request</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderCode}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></td><td>{order.requestId?.requestCode || '-'}</td><td><span className="status-pill status-readonly">{order.status}</span></td><td>₹{(order.totalPaise / 100).toLocaleString('en-IN')}</td><td>{['ACCEPTED', 'PARTIALLY_FULFILLED'].includes(order.status) && <><button className="table-action" onClick={() => fulfilOrder(order._id)}>Fulfil</button> <button className="table-action" onClick={() => cancelOrder(order._id)}>Cancel</button></>}</td></tr>)}</tbody></table></div>}</section>
      <section className="admin-panel shop-inventory-panel"><div className="panel-heading"><div><div className="eyebrow">CUSTOMER RETURNS</div><h2>Return requests</h2></div><span className="status-pill status-next">{returnRequests.length} pending</span></div><p className="muted small-note">Approved quantities are added back to inventory and recorded as RETURN_IN.</p>{!returnRequests.length ? <div className="empty-state"><Package size={23} /><p>No pending return requests.</p></div> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Order</th><th>Item</th><th>Quantity</th><th>Reason</th><th>Decision</th></tr></thead><tbody>{returnRequests.map((returnRequest) => <tr key={returnRequest._id}><td>{returnRequest.customerId?.name || '-'}</td><td>{returnRequest.orderId?.orderCode || '-'}</td><td><strong>{returnRequest.itemName}</strong></td><td>{returnRequest.quantity} {returnRequest.unit}</td><td>{returnRequest.reason}</td><td><button className="table-action" onClick={() => decideReturnRequest(returnRequest._id, 'APPROVE')}>Approve & restock</button> <button className="table-action" onClick={() => decideReturnRequest(returnRequest._id, 'REJECT')}>Reject</button></td></tr>)}</tbody></table></div>}</section>
      <section className="admin-panel shop-inventory-panel"><div className="panel-heading"><div><div className="eyebrow">LOW STOCK</div><h2>Restock alerts</h2></div><span className="status-pill status-next">{lowStock.length} alerts</span></div>{!lowStock.length ? <div className="empty-state"><Package size={23} /><p>No low-stock products.</p></div> : <div className="compact-list">{lowStock.map((item) => <div key={item._id}><strong>{item.customName || item.productId?.name || item.sku}</strong><span>Available: {item.quantityOnHand - item.quantityReserved} {item.unit} · Threshold: {item.lowStockThreshold}</span></div>)}</div>}</section>
      <section className="admin-panel shop-inventory-panel"><div className="panel-heading"><div><div className="eyebrow">STOCK MOVEMENTS</div><h2>Inventory history</h2></div><span className="status-pill status-ready">{movements.length} movements</span></div>{!movements.length ? <div className="empty-state"><Package size={23} /><p>No stock movements recorded yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Item</th><th>Movement</th><th>Quantity</th><th>Performed by</th><th>Date</th></tr></thead><tbody>{movements.slice(0, 30).map((movement) => <tr key={movement._id}><td>{movement.inventoryItemId?.customName || movement.inventoryItemId?.sku || '-'}</td><td><span className="status-pill status-readonly">{movement.movementType}</span></td><td>{movement.quantity}</td><td>{movement.performedBy?.name || '-'}</td><td>{new Date(movement.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
    </main>
  );
}