import { Link, useParams } from 'react-router-dom';
import { bestSellerProducts, buildCategories, hasCreatedAt, newArrivals } from '../core/catalog.js';
import { imageUrl } from '../core/safe.js';
import { useStore } from '../context/StoreContext.jsx';
import { EmptyState, NotFoundView, ProductGrid } from '../components/ui.jsx';
import { Listing } from './Shop.jsx';

export function NewArrivals() {
  const { products } = useStore();
  if (!hasCreatedAt(products)) return <EmptyState title="New arrivals">New products will appear here as the store adds them.</EmptyState>;
  return <><h1>New arrivals</h1><ProductGrid products={newArrivals(products, 24)} /></>;
}

export function BestSellers() {
  const { products, bestSellers } = useStore();
  const list = bestSellerProducts(products, bestSellers, 24);
  if (!list.length) return <EmptyState title="Best sellers">Our best sellers will appear here once orders have been completed.</EmptyState>;
  return <><h1>Best sellers</h1><ProductGrid products={list} /></>;
}

export function Categories() {
  const { products, settings } = useStore();
  const list = buildCategories(products, settings.categories);
  if (!list.length) return <EmptyState title="Categories">Categories will appear here once products are added.</EmptyState>;
  return (
    <><h1>Categories</h1>
      <ul className="tiles">{list.map((c) => (
        <li key={c.slug}><Link to={'/category/' + c.slug} className="tile">
          {c.image ? <img src={imageUrl(c.image, 500)} alt="" loading="lazy" /> : <span className="placeholder" aria-hidden="true">📦</span>}
          <span className="tile-label">{c.name}<small>{c.count} {c.count === 1 ? 'product' : 'products'}</small></span>
        </Link></li>))}</ul></>
  );
}

export function CategoryDetail() {
  const { slug } = useParams();
  const { products, settings } = useStore();
  const category = buildCategories(products, settings.categories).find((c) => c.slug === slug);
  if (!category) return <NotFoundView what="category" />;
  return <Listing products={products.filter((p) => p.category === category.name)} title={category.name} fixedCategory={category.name} />;
}
