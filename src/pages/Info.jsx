import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsUrl, isValidWaNumber, telHref } from '../core/safe.js';
import { useStore, useToast } from '../context/StoreContext.jsx';
import { loadLastOrder, clearLastOrder } from '../core/checkout.js';
import { EmptyState, useMoney } from '../components/ui.jsx';
import { Navigate } from 'react-router-dom';

export function About() {
  const { settings } = useStore();
  const name = settings.store_name;
  return (
    <article className="prose">
      <p className="eyebrow">About us</p>
      <h1>{settings.about_title || 'About ' + name}</h1>
      <p className="prewrap">{settings.about_text || `${name} is a small business that cares about quality and great service. Order online, confirm on WhatsApp, and we take care of the rest.`}</p>
      <div className="actions"><Link className="btn" to="/shop">Shop our products</Link><Link className="btn btn-outline" to="/contact">Get in touch</Link></div>
    </article>
  );
}

export function Contact() {
  const { settings } = useStore();
  const notify = useToast();
  const [who, setWho] = useState('');
  const [message, setMessage] = useState('');
  const wa = settings.whatsapp_number, hasWa = isValidWaNumber(wa);
  const email = settings.contact_email, instagram = httpsUrl(settings.instagram_url), phone = telHref(settings.contact_phone);
  const rows = [
    hasWa && ['WhatsApp', <a href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer">Chat with us</a>],
    phone && ['Phone', <a href={phone}>{settings.contact_phone}</a>],
    email && ['Email', <a href={'mailto:' + email}>{email}</a>],
    settings.contact_address && ['Address', settings.contact_address],
    settings.opening_hours && ['Opening hours', settings.opening_hours],
    instagram && ['Instagram', <a href={instagram} target="_blank" rel="noopener noreferrer">Follow us</a>],
  ].filter(Boolean);

  function send(event) {
    event.preventDefault();
    if (!message.trim()) { notify('Please type a message.'); return; }
    window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(`Hello ${settings.store_name}! ${message.trim()}${who.trim() ? '\n\n— ' + who.trim() : ''}`), '_blank', 'noopener');
  }
  return (
    <>
      <h1>Contact us</h1>
      {rows.length === 0 && <p className="muted">Contact details will appear here soon.</p>}
      <dl className="contact-list">{rows.map(([label, value]) => <div key={label} className="card pad"><dt className="eyebrow">{label}</dt><dd>{value}</dd></div>)}</dl>
      {hasWa && (
        <form className="card pad narrow" onSubmit={send}>
          <h2>Send us a message</h2>
          <div className="field"><label htmlFor="msg-name">Your name</label><input id="msg-name" maxLength="120" value={who} onChange={(e) => setWho(e.target.value)} /></div>
          <div className="field"><label htmlFor="msg-body">Message</label><textarea id="msg-body" rows="4" maxLength="1000" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          <button type="submit" className="btn btn-whatsapp">Send on WhatsApp</button>
        </form>)}
    </>
  );
}

export function Done() {
  const fmt = useMoney();
  const order = loadLastOrder();
  if (!order) return <Navigate to="/" replace />;
  return (
    <div className="done">
      <div className="done-mark" aria-hidden="true">✓</div>
      <h1>Order received</h1>
      <p>Order <strong>{order.orderId}</strong> · {fmt(order.total)}</p>
      <p>{order.whatsappUrl ? 'Last step: send your order on WhatsApp so the store can confirm payment and delivery. Your order is not complete until you press Send in WhatsApp.' : 'Please contact the store using its contact details to arrange payment and delivery.'}</p>
      <div className="actions center">
        {order.whatsappUrl && <a className="btn btn-whatsapp" href={order.whatsappUrl} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
        <Link className="btn btn-outline" to="/shop" onClick={clearLastOrder}>Keep shopping</Link>
      </div>
    </div>
  );
}

export function NotFound() { return <EmptyState title="Page not found" action={<Link className="btn" to="/">Go home</Link>}>That page doesn’t exist.</EmptyState>; }
