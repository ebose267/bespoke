import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildCategories, filterProducts, hasCreatedAt, sortProducts } from '../core/catalog.js';
import { useStore } from '../context/StoreContext.jsx';
import { EmptyState, ProductGrid } from '../components/ui.jsx';

const PAGE = 12;

export function Listing({ products, title, intro, fixedCategory }) {
  const { settings } = useStore();
  const [params, setParams] = useSearchParams();
  const [visible, setVisible] = useState(PAGE);
  const q = params.get('q') || '', category = fixedCategory || params.get('category') || 'All';
  const avail = params.get('avail') || 'all', sort = params.get('sort') || 'default';
  const categories = buildCategories(products, settings.categories);
  const canSortNewest = hasCreatedAt(products);

  const set = (key, value) => { const next = new URLSearchParams(params); if (!value || value === 'all' || value === 'All' || value === 'default') next.delete(key); else next.set(key, value); setParams(next, { replace: true }); setVisible(PAGE); };
  const result = sortProducts(filterProducts(products, { query: q, category, availability: avail }), sort);
  const dirty = q || avail !== 'all' || sort !== 'default' || (!fixedCategory && category !== 'All');

  return (
    <>
      <h1>{title}</h1>
      {intro && <p className="muted">{intro}</p>}
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <div><label htmlFor="shop-q">Search</label><input id="shop-q" type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Name, description or category" /></div>
        {!fixedCategory && categories.length > 1 && (
          <div><label htmlFor="shop-cat">Category</label><select id="shop-cat" value={category} onChange={(e) => set('category', e.target.value)}><option value="All">All categories</option>{categories.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}</select></div>)}
        <div><label htmlFor="shop-av">Availability</label><select id="shop-av" value={avail} onChange={(e) => set('avail', e.target.value)}><option value="all">Any</option><option value="in-stock">In stock</option><option value="few-left">Few left</option><option value="sold-out">Sold out</option></select></div>
        <div><label htmlFor="shop-sort">Sort by</label><select id="shop-sort" value={sort} onChange={(e) => set('sort', e.target.value)}><option value="default">Featured order</option>{canSortNewest && <option value="newest">Newest</option>}<option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></div>
        {dirty && <button type="button" className="btn btn-outline" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setVisible(PAGE); }}>Reset filters</button>}
      </form>
      <p className="muted" role="status" aria-live="polite">{result.length} {result.length === 1 ? 'product' : 'products'}</p>
      {products.length === 0 ? <EmptyState title="No products yet">Check back soon.</EmptyState>
        : result.length === 0 ? <EmptyState title="No products match">Try a different search or reset the filters.</EmptyState>
        : <>
            <ProductGrid products={result.slice(0, visible)} />
            {result.length > visible && <p className="center"><button type="button" className="btn btn-outline" onClick={() => setVisible(visible + PAGE)}>Load more</button></p>}
          </>}
    </>
  );
}

export default function Shop() { const { products } = useStore(); return <Listing products={products} title="Shop" />; }
