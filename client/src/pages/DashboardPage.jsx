import { Link } from 'react-router-dom';
import { ClipboardList, Package, Store, Users, Home, ShieldCheck, QrCode, ArrowUpRight, Construction } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const roleContent = {
  ELECTRICIAN: {
    title: 'Electrician workspace',
    description: 'Create a house record, prepare a material list and share one request ID with the customer and shops.',
    cards: [
      { icon: Users, title: 'Customers', text: 'Store customer contact details.', status: 'API foundation ready' },
      { icon: Home, title: 'Houses', text: 'Keep a separate record for each work location.', status: 'API foundation ready' },
      { icon: ClipboardList, title: 'Material requests', text: 'Create a catalogue-based or custom material list.', status: 'API foundation ready' },
      { icon: QrCode, title: 'Customer QR access', text: 'Create a read-only link for the customer.', status: 'API foundation ready' },
    ],
  },
  CUSTOMER: {
    title: 'Customer workspace',
    description: 'View the electrician’s original list, track quantities supplied by each shop and review purchase totals.',
    cards: [
      { icon: ClipboardList, title: 'My material requests', text: 'Requests linked to your customer account.', status: 'Foundation route ready' },
      { icon: QrCode, title: 'Open with QR', text: 'Scan a shared QR link to view a request without logging in.', status: 'Read-only QR API ready' },
      { icon: Store, title: 'Shop purchases', text: 'Review shop-wise orders and bills.', status: 'Next implementation phase' },
      { icon: Package, title: 'Remaining items', text: 'See what is still pending.', status: 'Next implementation phase' },
    ],
  },
  SHOP_OWNER: {
    title: 'Shop workspace',
    description: 'Manage branch inventory and fulfil only the available quantity from a customer’s request.',
    cards: [
      { icon: Store, title: 'Shop profile', text: 'Business verification and branch setup.', status: 'Database model ready' },
      { icon: Package, title: 'Inventory', text: 'Products, stock, selling price and low-stock thresholds.', status: 'Database model ready' },
      { icon: ClipboardList, title: 'Request lookup', text: 'Open a request using its ID and permitted access.', status: 'Next implementation phase' },
      { icon: ShieldCheck, title: 'Shop approvals', text: 'Customer-approved access where required.', status: 'Database model ready' },
    ],
  },
  ADMIN: {
    title: 'Platform administration',
    description: 'Manage accounts, product catalogue, shops and platform activity.',
    cards: [
      { icon: Users, title: 'User accounts', text: 'Manage platform roles and account status.', status: 'Database model ready' },
      { icon: Package, title: 'Product catalogue', text: 'Maintain standard electrical products.', status: 'API foundation ready' },
      { icon: Store, title: 'Shop verification', text: 'Review business and branch information.', status: 'Database model ready' },
      { icon: ClipboardList, title: 'Platform reports', text: 'Monitor requests, purchases and inventory movements.', status: 'Next implementation phase' },
    ],
  },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const activeRole = user.roles.find((role) => roleContent[role]) || 'CUSTOMER';
  const content = roleContent[activeRole];

  return (
    <main className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <div className="eyebrow">YOUR WORKSPACE · {activeRole.replace('_', ' ')}</div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <div className="hero-symbol"><Construction size={42} /></div>
      </section>
      <section className="section-heading">
        <div><h2>Workspace modules</h2><p className="muted">The foundation is in place. Features marked as next phase are planned for the next implementation layer.</p></div>
      </section>
      <div className="module-grid">
        {content.cards.map(({ icon: Icon, title, text, status }) => (
          <article className="module-card" key={title}>
            <div className="module-icon"><Icon size={21} /></div>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className={`status-pill ${status.includes('ready') ? 'status-ready' : 'status-next'}`}>{status}</span>
          </article>
        ))}
      </div>
      <section className="next-step-banner">
        <div><div className="eyebrow">CORE WORKFLOW</div><h2>One material request ID. Multiple shop purchases.</h2><p>The next milestone connects the shop inventory and partial fulfilment APIs to these workspaces.</p></div>
        <ArrowUpRight size={26} />
      </section>
      {activeRole === 'ADMIN' && <p className="muted small-note">Admin registration is disabled by design. Create the first admin account manually using the deployment instructions in README.</p>}
      <div className="dashboard-links"><Link to="/">Platform overview</Link></div>
    </main>
  );
}
