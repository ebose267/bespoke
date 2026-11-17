import { Link } from 'react-router-dom';
import { imageUrl } from '../core/safe.js';
import { useCart } from '../context/StoreContext.jsx';
import { EmptyState, useMoney } from '../components/ui.jsx';

export default function Cart() {
  const cart = useCart();
  const fmt = useMoney();
  if (!cart.detailed.length) return <EmptyState title="Your cart is empty" action={<Link className="btn" to="/shop">Browse products</Link>} />;
  return (
    <>
      <h1>Your cart</h1>
      <ul className="card cart-lines">{cart.detailed.map(({ product, qty, lineTotal }) => (
        <li key={product.id} className="cart-line">
          {imageUrl(product.images[0], 120) ? <img src={imageUrl(product.images[0], 120)} alt="" width="64" height="64" /> : <span className="placeholder" aria-hidden="true">📦</span>}
          <div className="grow"><Link to={'/product/' + encodeURIComponent(product.id)}>{product.name}</Link><small>{fmt(product.price)} each</small>
            <button type="button" className="link-btn" onClick={() => cart.remove(product.id)}>Remove<span className="sr-only"> {product.name}</span></button></div>
          <div className="qty" role="group" aria-label={`Quantity of ${product.name}`}>
            <button type="button" aria-label="Decrease quantity" onClick={() => cart.setQty(product.id, qty - 1)}>−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" aria-label="Increase quantity" onClick={() => cart.setQty(product.id, qty + 1)}>+</button>
          </div>
          <strong className="line-total">{fmt(lineTotal)}</strong>
        </li>))}
      </ul>
      <div className="totals"><span>Subtotal</span><strong>{fmt(cart.total)}</strong></div>
      <p className="muted">Delivery is arranged with the store after you order. The final total is confirmed by the store when your order is saved.</p>
      <div className="actions"><Link className="btn btn-outline" to="/shop">Keep shopping</Link><Link className="btn" to="/checkout">Checkout</Link></div>
    </>
  );
}
