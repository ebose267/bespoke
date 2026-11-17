import { Link } from 'react-router-dom';
import { money } from '../core/format.js';
import { coverImage, isSoldOut, stockLabel } from '../core/catalog.js';
import { useCart, useStore } from '../context/StoreContext.jsx';

export function useMoney() { const { settings } = useStore(); return (v) => money(v, settings.currency_symbol); }

export function Price({ product, large }) {
  const fmt = useMoney();
  return (
    <span className={'price' + (large ? ' price-lg' : '')}>
      <span>{fmt(product.price)}</span>
      {product.compareAt > 0 && (<><s className="price-was" aria-label={'Was ' + fmt(product.compareAt)}>{fmt(product.compareAt)}</s><span className="badge badge-sale">−{product.percentOff}%</span></>)}
    </span>
  );
}

export function StockBadge({ product }) {
  const state = isSoldOut(product) ? 'out' : product.status === 'Few Left' ? 'few' : 'in';
  return <span className={'stock stock-' + state}>{stockLabel(product)}</span>;
}

export function SectionHeading({ title, action }) {
  return <div className="section-head"><h2>{title}</h2>{action}</div>;
}

export function EmptyState({ title, children, action }) {
  return <div className="empty"><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}

export function ProductCard({ product }) {
  const cart = useCart();
  const out = isSoldOut(product);
  const image = coverImage(product);
  return (
    <article className="card product-card">
      <Link to={'/product/' + encodeURIComponent(product.id)} className="product-media" aria-label={product.name}>
        {image ? <img src={image} alt="" loading="lazy" width="600" height="600" /> : <span className="placeholder" aria-hidden="true">📦</span>}
        {out && <span className="badge badge-out">Sold out</span>}
      </Link>
      <div className="product-body">
        <span className="eyebrow">{product.category}</span>
        <h3><Link to={'/product/' + encodeURIComponent(product.id)}>{product.name}</Link></h3>
        <Price product={product} />
        <button type="button" className="btn btn-block" disabled={out} onClick={() => cart.add(product.id)}>{out ? 'Out of stock' : 'Add to cart'}</button>
      </div>
    </article>
  );
}

export function ProductGrid({ products }) {
  return <div className="grid">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}

export function NotFoundView({ what = 'page' }) {
  return <EmptyState title={`We couldn’t find that ${what}`} action={<Link className="btn" to="/shop">Back to the shop</Link>}>It may have been removed or the link may be out of date.</EmptyState>;
}
