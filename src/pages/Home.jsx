import { Link } from 'react-router-dom';
import { bestSellerProducts, buildCategories, featuredProducts, hasCreatedAt, newArrivals } from '../core/catalog.js';
import { httpsUrl, imageUrl } from '../core/safe.js';
import { useStore } from '../context/StoreContext.jsx';
import { ProductGrid, SectionHeading } from '../components/ui.jsx';

function Hero({ config, settings }) {
  const h = config.hero;
  const image = httpsUrl(h.image) || (h.image && h.image.startsWith('/') ? h.image : '');
  const title = h.title || settings.store_name;
  const subtitle = h.subtitle || settings.tagline || settings.banner_text || 'Quality products, delivered to you.';
  return (
    <section className={'hero' + (image ? ' hero-image' : '')} style={image ? { '--hero-image': `url(${image})` } : undefined}>
      {h.eyebrow && <p className="eyebrow">{h.eyebrow}</p>}
      <h1>{title}</h1>
      <p className="lead">{subtitle}</p>
      <div className="actions">
        {h.ctaLabel && <Link className="btn" to={h.ctaTo || '/shop'}>{h.ctaLabel}</Link>}
        {h.secondaryLabel && <Link className="btn btn-outline" to={h.secondaryTo || '/about'}>{h.secondaryLabel}</Link>}
      </div>
    </section>
  );
}

export default function Home() {
  const { products, settings, bestSellers, config } = useStore();
  const categories = buildCategories(products, settings.categories);
  const featured = featuredProducts(products, 4);
  const best = bestSellerProducts(products, bestSellers, 4);
  const fresh = hasCreatedAt(products) ? newArrivals(products, 4) : [];
  const m = config.modules;
  const showFallback = !featured.length && !fresh.length;

  const sections = {
    hero: <Hero key="hero" config={config} settings={settings} />,
    trust: config.trust.length > 0 && (
      <ul key="trust" className="trust">{config.trust.map((t) => <li key={t.title}><strong>{t.title}</strong><span>{t.text}</span></li>)}</ul>
    ),
    categories: m.categories && categories.length > 0 && (
      <section key="cat"><SectionHeading title="Shop by category" action={<Link to="/categories">All categories</Link>} />
        <ul className="tiles">{categories.slice(0, 6).map((c) => (
          <li key={c.slug}><Link to={'/category/' + c.slug} className="tile">
            {c.image ? <img src={imageUrl(c.image, 500)} alt="" loading="lazy" /> : <span className="placeholder" aria-hidden="true">📦</span>}
            <span className="tile-label">{c.name}<small>{c.count} {c.count === 1 ? 'product' : 'products'}</small></span>
          </Link></li>))}</ul></section>
    ),
    featured: featured.length > 0 && <section key="feat"><SectionHeading title="Featured" /><ProductGrid products={featured} /></section>,
    bestSellers: m.bestSellers && best.length > 0 && <section key="best"><SectionHeading title="Best sellers" action={<Link to="/best-sellers">See all</Link>} /><ProductGrid products={best} /></section>,
    newArrivals: m.newArrivals && fresh.length > 0 && <section key="new"><SectionHeading title="New arrivals" action={<Link to="/new-arrivals">See all</Link>} /><ProductGrid products={fresh} /></section>,
    promo: config.promo && (
      <section key="promo" className="promo">
        <h2>{config.promo.title}</h2>{config.promo.text && <p>{config.promo.text}</p>}
        {config.promo.ctaLabel && <Link className="btn" to={config.promo.ctaTo || '/shop'}>{config.promo.ctaLabel}</Link>}
      </section>),
  };

  return (
    <>
      {config.homeSections.map((key) => sections[key]).filter(Boolean)}
      {showFallback && products.length > 0 && <section><SectionHeading title="Our products" action={<Link to="/shop">View all</Link>} /><ProductGrid products={products.slice(0, 8)} /></section>}
    </>
  );
}
