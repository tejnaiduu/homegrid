import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Package, Store, Users } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="eyebrow">ELECTRICAL MATERIAL MANAGEMENT</div>
        <h1>One material list.<br /><span>Every shop connected.</span></h1>
        <p>Homegrid connects electricians, customers and electrical shops through one shared material request ID, with stock-aware fulfilment and shop-wise billing.</p>
        <div className="hero-actions"><Link className="button button-primary" to="/register">Create account <ArrowRight size={17} /></Link><Link className="button button-outline" to="/login">Sign in</Link></div>
        <div className="home-visual">
          <div className="visual-node node-electrician"><Users size={22} /><strong>Electrician</strong><small>Creates material list</small></div>
          <div className="visual-connector">REQUEST ID + QR</div>
          <div className="visual-node node-customer"><ClipboardList size={22} /><strong>Customer</strong><small>Views and tracks</small></div>
          <div className="visual-node node-shop"><Store size={22} /><strong>Electrical shop</strong><small>Checks stock and bills</small></div>
          <div className="visual-center"><Package size={29} /><strong>Shared request</strong><small>One source of truth</small></div>
        </div>
      </section>
    </main>
  );
}
