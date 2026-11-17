import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { imageUrl, httpsUrl, isValidWaNumber } from '../core/safe.js';
import { useCart, useStore } from '../context/StoreContext.jsx';
import { EmptyState } from './ui.jsx';

export default function Layout() {
  const { status, error, reload, settings, config } = useStore();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  const name = settings.store_name || 'Store';
  const logo = imageUrl(settings.logo_url, 100);
  const links = config.nav.filter((l) => !l.module || config.modules[l.module]);
  const wa = settings.whatsapp_number;
  const instagram = httpsUrl(settings.instagram_url);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      {settings.banner_text && <div className="announce">{settings.banner_text}</div>}
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" className="brand">{logo ? <img src={logo} alt="" width="34" height="34" /> : <span className="brand-mark" aria-hidden="true">{name.slice(0, 1)}</span>}<span>{name}</span></Link>
          <button type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
          <nav id="primary-nav" className={'primary-nav' + (open ? ' open' : '')} aria-label="Primary">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.to === '/'}>{l.label}</NavLink>)}
          </nav>
          {config.modules.search && config.modules.shop && (
            <form className="header-search" role="search" onSubmit={(e) => { e.preventDefault(); navigate('/shop' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '')); }}>
              <label className="sr-only" htmlFor="header-q">Search products</label>
              <input id="header-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
            </form>
          )}
          <Link to="/cart" className="icon-btn cart-link" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>🛒<span className="count" aria-hidden="true">{count}</span></Link>
        </div>
      </header>
      <main id="main" className="container page" tabIndex="-1">
        {status === 'loading' && <p className="muted" role="status">Loading…</p>}
        {status === 'error' && <EmptyState title="Couldn’t load the store" action={<button type="button" className="btn" onClick={reload}>Try again</button>}>{error}</EmptyState>}
        {status === 'ready' && <Outlet />}
      </main>
      <footer className="site-footer">
        <div className="container">
          <nav aria-label="Footer">{links.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}{instagram && <a href={instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}</nav>
          {config.footer.note && <p>{config.footer.note}</p>}
          <p>© {new Date().getFullYear()} {name}</p>
        </div>
      </footer>
      {isValidWaNumber(wa) && <a className="wa-fab" href={'https://wa.me/' + wa} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">💬</a>}
    </>
  );
}
