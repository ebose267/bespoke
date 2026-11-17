import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { imageUrl } from '../core/safe.js';
import { isSoldOut, relatedProducts } from '../core/catalog.js';
import { useCart, useStore } from '../context/StoreContext.jsx';
import { NotFoundView, Price, ProductGrid, SectionHeading, StockBadge } from '../components/ui.jsx';

function ProductView({ id }) {
  const { products } = useStore();
  const cart = useCart();
  const [index, setIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const product = products.find((p) => p.id === id);
  if (!product) return <NotFoundView what="product" />;

  const out = isSoldOut(product);
  const images = product.images;
  const main = imageUrl(images[Math.min(index, Math.max(0, images.length - 1))], 900);
  const maxQty = Math.max(1, Math.min(product.stock, 10));
  const related = relatedProducts(products, product);

  return (
    <>
      <p><Link to="/shop">← Back to shop</Link></p>
      <div className="two-col">
        <div>
          <div className="gallery">{main ? <img src={main} alt={product.name} /> : <span className="placeholder" aria-hidden="true">📦</span>}</div>
          {images.length > 1 && (
            <ul className="thumbs" aria-label="Product images">{images.map((u, i) => (
              <li key={u}><button type="button" aria-label={`Show image ${i + 1} of ${images.length}`} aria-pressed={i === index} onClick={() => setIndex(i)}><img src={imageUrl(u, 120)} alt="" /></button></li>))}</ul>)}
        </div>
        <div>
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>
          <Price product={product} large />
          <p><StockBadge product={product} /></p>
          {product.description && <p className="prewrap">{product.description}</p>}
          {!out && (<><label htmlFor="qty">Quantity</label><select id="qty" value={Math.min(qty, maxQty)} onChange={(e) => setQty(Number(e.target.value))}>{Array.from({ length: maxQty }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></>)}
          <div className="actions">
            <button type="button" className="btn" disabled={out} onClick={() => cart.add(product.id, Math.min(qty, maxQty))}>{out ? 'Out of stock' : 'Add to cart'}</button>
            <Link className="btn btn-outline" to="/cart">View cart</Link>
          </div>
        </div>
      </div>
      {related.length > 0 && <section><SectionHeading title="You may also like" /><ProductGrid products={related} /></section>}
    </>
  );
}

// Keyed by id so quantity and gallery state reset when moving between products.
export default function ProductPage() {
  const { id } = useParams();
  return <ProductView key={id} id={id} />;
}
