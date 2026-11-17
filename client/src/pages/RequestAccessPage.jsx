import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, QrCode } from 'lucide-react';
import { apiRequest } from '../services/api.js';

function formatQty(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function RequestAccessPage() {
  const { token } = useParams();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest(`/requests/public/access/${encodeURIComponent(token)}`)
      .then((result) => { if (active) setRequest(result.data.request); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (loading) return <main className="public-request"><div className="page-loading">Opening the shared material list…</div></main>;
  if (error) return <main className="public-request"><div className="public-error"><AlertTriangle size={28} /><h1>Link unavailable</h1><p>{error}</p><Link to="/login" className="button button-primary">Sign in</Link></div></main>;

  return (
    <main className="public-request">
      <section className="request-card">
        <div className="request-card-head"><div className="qr-icon"><QrCode size={22} /></div><span className="status-pill status-readonly">Customer read-only view</span></div>
        <div className="eyebrow">MATERIAL REQUEST</div>
        <h1>{request.requestCode}</h1>
        <div className="request-status"><Clock3 size={15} /> {request.status.replaceAll('_', ' ')}</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Required</th><th>Fulfilled</th><th>Pending</th></tr></thead>
            <tbody>{request.items.map((item) => {
              const pending = Math.max(0, item.requestedQty - item.fulfilledQty - item.reservedQty);
              return <tr key={item.itemId}><td><strong>{item.name}</strong><small>{item.brandPreference || item.category || item.itemType}</small></td><td>{formatQty(item.requestedQty)} {item.unit}</td><td>{formatQty(item.fulfilledQty)} {item.unit}</td><td>{formatQty(pending)} {item.unit}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="readonly-note"><CheckCircle2 size={17} /> This shared link can view the list only. It cannot change quantities or approve shop orders.</div>
      </section>
    </main>
  );
}
