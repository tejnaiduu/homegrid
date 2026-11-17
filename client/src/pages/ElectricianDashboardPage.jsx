import { useEffect, useState } from 'react';
import { ClipboardList, Home, Plus, RefreshCw, Users } from 'lucide-react';
import { apiRequest } from '../services/api.js';

const emptyCustomer = { name: '', phone: '', email: '' };
const emptyHouse = { customerId: '', houseName: '', city: '', line1: '' };

export default function ElectricianDashboardPage() {
  const [customers, setCustomers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [requestItems, setRequestItems] = useState([]);
  const [requestForm, setRequestForm] = useState({ customerId: '', houseId: '', productId: '', requestedQty: '', brandPreference: '' });
  const [customItem, setCustomItem] = useState({ name: '', unit: 'PCS', requestedQty: '', brandPreference: '' });
  const [createdRequest, setCreatedRequest] = useState(null);
  const [requests, setRequests] = useState([]);
  const [purchaseDetails, setPurchaseDetails] = useState(null);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [house, setHouse] = useState(emptyHouse);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadWorkspace() {
    setLoading(true); setError('');
    try {
      const [customerResult, houseResult, productResult, requestResult] = await Promise.all([apiRequest('/customers'), apiRequest('/houses'), apiRequest('/products?limit=100'), apiRequest('/requests')]);
      setCustomers(customerResult.data.customers); setHouses(houseResult.data.houses);
      setProducts(productResult.data.items);
      setRequests(requestResult.data.requests);
      if (!house.customerId && customerResult.data.customers[0]) setHouse((current) => ({ ...current, customerId: customerResult.data.customers[0]._id }));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadWorkspace(); }, []);

  async function addCustomer(event) {
    event.preventDefault(); setError(''); setMessage('');
    try { await apiRequest('/customers', { method: 'POST', body: JSON.stringify(customer) }); setCustomer(emptyCustomer); setMessage('Customer added.'); await loadWorkspace(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function addHouse(event) {
    event.preventDefault(); setError(''); setMessage('');
    try { await apiRequest('/houses', { method: 'POST', body: JSON.stringify({ customerId: house.customerId, houseName: house.houseName, address: { line1: house.line1, city: house.city } }) }); setHouse({ ...emptyHouse, customerId: house.customerId }); setMessage('House added.'); await loadWorkspace(); }
    catch (requestError) { setError(requestError.message); }
  }

  function addCatalogueItem(event) {
    event.preventDefault();
    const product = products.find((entry) => entry._id === requestForm.productId);
    if (!product || Number(requestForm.requestedQty) <= 0) return setError('Choose a product and enter a positive quantity.');
    setRequestItems((items) => [...items, { itemType: 'CATALOG', productId: product._id, name: product.name, unit: product.unit, requestedQty: Number(requestForm.requestedQty), brandPreference: requestForm.brandPreference || product.brand }]);
    setRequestForm({ ...requestForm, productId: '', requestedQty: '', brandPreference: '' }); setError('');
  }

  function addCustomItem(event) {
    event.preventDefault();
    if (!customItem.name || Number(customItem.requestedQty) <= 0) return setError('Custom item name and positive quantity are required.');
    setRequestItems((items) => [...items, { itemType: 'CUSTOM', ...customItem, requestedQty: Number(customItem.requestedQty) }]);
    setCustomItem({ name: '', unit: 'PCS', requestedQty: '', brandPreference: '' }); setError('');
  }

  async function createRequest(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!requestForm.customerId || !requestForm.houseId || !requestItems.length) return setError('Select a customer, house and at least one material.');
    try { const result = await apiRequest('/requests', { method: 'POST', body: JSON.stringify({ customerId: requestForm.customerId, houseId: requestForm.houseId, items: requestItems, shopAccessMode: 'APPROVED_ONLY' }) }); setCreatedRequest(result.data.request); setRequestItems([]); setMessage('Material request created.'); await loadWorkspace(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createQr() {
    try { const result = await apiRequest(`/requests/${createdRequest.id}/customer-qr`, { method: 'POST' }); setCreatedRequest({ ...createdRequest, accessUrl: result.data.accessUrl }); }
    catch (requestError) { setError(requestError.message); }
  }

  async function viewPurchases(request) {
    setError('');
    try { const result = await apiRequest(`/requests/${request.id}/purchases`); setPurchaseDetails({ request, orders: result.data.orders }); }
    catch (requestError) { setError(requestError.message); }
  }

  async function shareRequest() {
    if (!createdRequest?.accessUrl) return;
    const text = `Homegrid material request ${createdRequest.requestCode}: ${createdRequest.accessUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Material request ${createdRequest.requestCode}`, text }); return; } catch { /* User cancelled sharing. */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <main className="dashboard-page"><div className="page-loading">Loading electrician workspace...</div></main>;

  return (
    <main className="dashboard-page electrician-page">
      <section className="dashboard-hero"><div><div className="eyebrow">ELECTRICIAN · PROJECT SETUP</div><h1>Build the material notebook</h1><p>Create customers and houses before preparing a shared material request.</p></div><button className="button button-outline admin-refresh" onClick={loadWorkspace}><RefreshCw size={16} /> Refresh</button></section>
      {error && <div className="alert alert-error admin-alert">{error}</div>}{message && <div className="alert alert-success admin-alert">{message}</div>}
      <section className="shop-form-grid">
        <form className="admin-panel form-stack" onSubmit={addCustomer}><div className="panel-heading"><div><div className="eyebrow">CUSTOMER MANAGEMENT</div><h2>Add customer</h2></div><Users size={20} /></div><label>Full name<input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} required /></label><label>Phone<input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} required /></label><label>Email<input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label><button className="button button-primary"><Plus size={16} /> Add customer</button></form>
        <form className="admin-panel form-stack" onSubmit={addHouse}><div className="panel-heading"><div><div className="eyebrow">HOUSE MANAGEMENT</div><h2>Add house</h2></div><Home size={20} /></div><label>Customer<select value={house.customerId} onChange={(e) => setHouse({ ...house, customerId: e.target.value })} required><option value="">Select customer</option>{customers.map((entry) => <option value={entry._id} key={entry._id}>{entry.name} · {entry.phone}</option>)}</select></label><label>House or project name<input value={house.houseName} onChange={(e) => setHouse({ ...house, houseName: e.target.value })} placeholder="New House" required /></label><label>Address line<input value={house.line1} onChange={(e) => setHouse({ ...house, line1: e.target.value })} required /></label><label>City<input value={house.city} onChange={(e) => setHouse({ ...house, city: e.target.value })} required /></label><button className="button button-primary" disabled={!customers.length}><Plus size={16} /> Add house</button></form>
      </section>
      <section className="electrician-lists"><article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">MY CUSTOMERS</div><h2>{customers.length} customers</h2></div></div>{!customers.length ? <div className="empty-state"><Users size={23} /><p>No customers yet.</p></div> : <div className="compact-list">{customers.map((entry) => <div key={entry._id}><strong>{entry.name}</strong><span>{entry.phone}{entry.email ? ` · ${entry.email}` : ''}</span></div>)}</div>}</article><article className="admin-panel"><div className="panel-heading"><div><div className="eyebrow">MY HOUSES</div><h2>{houses.length} houses</h2></div></div>{!houses.length ? <div className="empty-state"><Home size={23} /><p>No houses yet.</p></div> : <div className="compact-list">{houses.map((entry) => <div key={entry._id}><strong>{entry.houseName}</strong><span>{entry.address?.city || 'City not set'}</span></div>)}</div>}</article></section>
      <section className="admin-panel request-composer"><div className="panel-heading"><div><div className="eyebrow">MATERIAL REQUEST</div><h2>Create a shared material list</h2></div></div><form className="form-grid request-target-form" onSubmit={(event) => event.preventDefault()}><label>Customer<select value={requestForm.customerId} onChange={(e) => setRequestForm({ ...requestForm, customerId: e.target.value, houseId: '' })} required><option value="">Select customer</option>{customers.map((entry) => <option value={entry._id} key={entry._id}>{entry.name}</option>)}</select></label><label>House<select value={requestForm.houseId} onChange={(e) => setRequestForm({ ...requestForm, houseId: e.target.value })} required><option value="">Select house</option>{houses.filter((entry) => entry.customerId === requestForm.customerId).map((entry) => <option value={entry._id} key={entry._id}>{entry.houseName}</option>)}</select></label></form><div className="request-item-adders"><form className="form-stack" onSubmit={addCatalogueItem}><h3>Catalogue product</h3><select value={requestForm.productId} onChange={(e) => setRequestForm({ ...requestForm, productId: e.target.value })}><option value="">Select product</option>{products.map((product) => <option value={product._id} key={product._id}>{product.name} · {product.unit}</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="Quantity" value={requestForm.requestedQty} onChange={(e) => setRequestForm({ ...requestForm, requestedQty: e.target.value })} /><input placeholder="Brand preference" value={requestForm.brandPreference} onChange={(e) => setRequestForm({ ...requestForm, brandPreference: e.target.value })} /><button className="button button-outline"><Plus size={16} /> Add catalogue item</button></form><form className="form-stack" onSubmit={addCustomItem}><h3>Custom material</h3><input placeholder="Material name" value={customItem.name} onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })} /><div className="form-grid"><input type="number" min="0.001" step="0.001" placeholder="Quantity" value={customItem.requestedQty} onChange={(e) => setCustomItem({ ...customItem, requestedQty: e.target.value })} /><select value={customItem.unit} onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value })}><option>PCS</option><option>METRE</option><option>ROLL</option><option>BOX</option><option>SET</option><option>KG</option><option>OTHER</option></select></div><button className="button button-outline"><Plus size={16} /> Add custom item</button></form></div>{requestItems.length > 0 && <div className="compact-list request-items">{requestItems.map((item, index) => <div key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.requestedQty} {item.unit} · {item.itemType}<button type="button" className="table-action" onClick={() => setRequestItems(requestItems.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></span></div>)}</div>}<button className="button button-primary" onClick={createRequest} disabled={!requestItems.length}>Generate material request</button>{createdRequest && <div className="request-created"><strong>{createdRequest.requestCode}</strong><span>Share this request ID with the customer and participating shops.</span>{createdRequest.accessUrl ? <><input readOnly value={createdRequest.accessUrl} /><button className="button button-outline" onClick={shareRequest}>Share with customer</button></> : <button className="button button-outline" onClick={createQr}>Generate customer QR link</button>}</div>}</section>
      <section className="admin-panel request-history"><div className="panel-heading"><div><div className="eyebrow">REQUEST HISTORY</div><h2>Material requests</h2></div><span className="status-pill status-ready">{requests.length} requests</span></div>{!requests.length ? <div className="empty-state"><ClipboardList size={23} /><p>No material requests created yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Request ID</th><th>Status</th><th>Items</th><th>Progress</th><th>Purchases</th></tr></thead><tbody>{requests.map((request) => { const requested = request.items.reduce((sum, item) => sum + item.requestedQty, 0); const fulfilled = request.items.reduce((sum, item) => sum + Math.max(0, item.fulfilledQty - Number(item.returnedQty || 0)), 0); return <tr key={request.id}><td><strong>{request.requestCode}</strong><small>{new Date(request.createdAt).toLocaleDateString()}</small></td><td><span className="status-pill status-readonly">{request.status}</span></td><td>{request.items.length}</td><td>{requested ? Math.round((fulfilled / requested) * 100) : 0}% net fulfilled</td><td><button className="table-action" onClick={() => viewPurchases(request)}>View shops</button></td></tr>; })}</tbody></table></div>}</section>
      {purchaseDetails && <section className="admin-panel request-history"><div className="panel-heading"><div><div className="eyebrow">SHOP PURCHASES · {purchaseDetails.request.requestCode}</div><h2>Fulfilment history</h2></div><button className="table-action" onClick={() => setPurchaseDetails(null)}>Close</button></div>{!purchaseDetails.orders.length ? <div className="empty-state"><p>No shop orders for this request yet.</p></div> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Shop</th><th>Branch</th><th>Status</th><th>Total</th></tr></thead><tbody>{purchaseDetails.orders.map((order) => <tr key={order._id}><td>{order.orderCode}</td><td>{order.shopId?.businessName || '-'}</td><td>{order.branchId?.branchName || '-'}</td><td><span className="status-pill status-readonly">{order.status}</span></td><td>₹{(order.totalPaise / 100).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>}</section>}
    </main>
  );
}