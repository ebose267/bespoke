import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { buildOrderPayload, clearRequestId, requestIdFor, saveLastOrder, submitOrder, validateCustomer } from '../core/checkout.js';
import { useCart, useStore } from '../context/StoreContext.jsx';
import { useMoney } from '../components/ui.jsx';

const EMPTY = { name: '', phone: '', email: '', address: '' };

export default function Checkout() {
  const { apiUrl, settings, fetchImpl } = useStore();
  const cart = useCart();
  const fmt = useMoney();
  const navigate = useNavigate();
  const startedAt = useRef(Date.now());
  const [form, setForm] = useState(EMPTY);
  const [newsletter, setNewsletter] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!cart.detailed.length && !busy) return <Navigate to="/cart" replace />;

  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={'co-' + name}>{label}</label>
      {props.as === 'textarea'
        ? <textarea id={'co-' + name} rows="3" maxLength="500" value={form[name]} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? 'co-' + name + '-err' : undefined} onChange={(e) => setForm({ ...form, [name]: e.target.value })} autoComplete={props.autoComplete} />
        : <input id={'co-' + name} type={props.type || 'text'} maxLength={props.maxLength} value={form[name]} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? 'co-' + name + '-err' : undefined} onChange={(e) => setForm({ ...form, [name]: e.target.value })} autoComplete={props.autoComplete} />}
      {errors[name] && <p id={'co-' + name + '-err'} className="field-error" role="alert">{errors[name]}</p>}
    </div>
  );

  async function place(event) {
    event.preventDefault();
    if (busy) return;
    const found = validateCustomer(form);
    setErrors(found); setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    // Open the WhatsApp tab inside the click gesture; browsers can block popups opened after an await.
    let tab = null; try { tab = window.open('about:blank', '_blank'); } catch { /* popup blocked */ }
    try {
      const details = { customer: form, newsletter, lines: cart.lines };
      const payload = buildOrderPayload({ ...details, requestId: requestIdFor(details), startedAt: startedAt.current, honeypot });
      const order = await submitOrder(apiUrl, payload, { fetchImpl });
      saveLastOrder(order); clearRequestId(); cart.clear();
      if (tab && order.whatsappUrl) tab.location = order.whatsappUrl; else if (tab) tab.close();
      navigate('/done');
    } catch (error) {
      if (tab) try { tab.close(); } catch { /* ignore */ }
      setFormError(error.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Checkout</h1>
      <div className="two-col">
        <form className="card pad" onSubmit={place} noValidate>
          {formError && <div className="alert" role="alert">{formError}</div>}
          {field('name', 'Full name', { autoComplete: 'name', maxLength: 120 })}
          {field('phone', 'Phone (WhatsApp)', { type: 'tel', autoComplete: 'tel', maxLength: 30 })}
          {field('email', 'Email (for your receipt)', { type: 'email', autoComplete: 'email', maxLength: 254 })}
          {field('address', 'Delivery address', { as: 'textarea', autoComplete: 'street-address' })}
          <label className="check"><input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} /> Send me news and offers from {settings.store_name} (optional)</label>
          <div className="hp" aria-hidden="true"><label htmlFor="website">Leave this field empty</label><input id="website" name="website" tabIndex="-1" autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></div>
          <button type="submit" className="btn btn-block" disabled={busy}>{busy ? 'Placing order…' : `Place order · ${fmt(cart.total)}`}</button>
        </form>
        <aside className="card pad">
          <h2>Order summary</h2>
          <ul className="summary">{cart.detailed.map(({ product, qty, lineTotal }) => <li key={product.id}><span>{qty}× {product.name}</span><span>{fmt(lineTotal)}</span></li>)}</ul>
          <div className="totals"><span>Total</span><strong>{fmt(cart.total)}</strong></div>
          <p className="muted">Availability is checked again when you place the order. Next, you will send your saved order on WhatsApp so {settings.store_name} can confirm payment and delivery. No payment is taken on this site.</p>
        </aside>
      </div>
    </>
  );
}
