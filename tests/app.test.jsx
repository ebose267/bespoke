// End-to-end journey through the real React app with a mocked API. This is the regression net for any AI Studio redesign:
// if the redesign breaks browsing, the cart, or the checkout contract, these fail.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { StoreProvider } from '../src/context/StoreContext.jsx';
import { pickClient } from '../src/config/index.js';
import { makeFetch, storefrontResponse } from './fixtures.js';

const config = pickClient('synthova-oil');
const API = 'https://script.google.com/macros/s/TEST/exec';

function mount(route = '/', { fetchImpl = makeFetch(), cfg = config } = {}) {
  const Router = ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  render(<StoreProvider apiUrl={API} config={cfg} fetchImpl={fetchImpl}><App Router={Router} /></StoreProvider>);
  return fetchImpl;
}

describe('storefront journey', () => {
  it('renders the home page from live data, hides sections that have no real data, and themes itself', async () => {
    mount('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Store' })).toBeInTheDocument();
    expect(screen.getByText('Free gift wrap')).toBeInTheDocument();                 // announcement from settings
    expect(screen.getByRole('heading', { name: 'Best sellers' })).toBeInTheDocument(); // server ranking present
    expect(screen.getByRole('heading', { name: 'New arrivals' })).toBeInTheDocument(); // created_at present
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#080c08');   // Synthova Oil tokens
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0b6e4f'); // CMS brand colour wins
    expect(document.title).toBe('Demo Store');
  });

  it('shows no fake sections when the backend provides no ranking, dates or featured flags', async () => {
    const bare = { ok: true, products: storefrontResponse.products.map((p) => ({ ...p, created_at: '', featured: false })), settings: storefrontResponse.settings };
    mount('/', { fetchImpl: makeFetch({ get: bare }) });
    await screen.findByRole('heading', { level: 1, name: 'Demo Store' });
    for (const name of ['Best sellers', 'New arrivals', 'Featured']) expect(screen.queryByRole('heading', { name })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Our products' })).toBeInTheDocument(); // honest fallback
  });

  it('filters the shop, and resets filters', async () => {
    mount('/shop'); const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Shop' });
    expect(screen.getByText('4 products')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'tote');
    expect(screen.getByText('1 product')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByText('4 products')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'zzz');
    expect(screen.getByText('No products match')).toBeInTheDocument();
  });

  it('shows a designed not-found view for an unknown product, and never lets sold-out items be added', async () => {
    mount('/product/NOPE'); expect(await screen.findByText(/couldn’t find that product/)).toBeInTheDocument();
  });
  it('disables add-to-cart for sold-out products', async () => {
    mount('/product/P3'); await screen.findByRole('heading', { level: 1, name: 'Canvas Belt' });
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });

  it('honours module switches from the client config', async () => {
    mount('/best-sellers', { cfg: { ...config, modules: { ...config.modules, bestSellers: false } } });
    expect(await screen.findByText(/couldn’t find that page/)).toBeInTheDocument();
  });

  it('shows a retry state when the API fails, then recovers', async () => {
    let fail = true;
    const f = makeFetch({ get: () => { if (fail) throw new TypeError('offline'); return storefrontResponse; } });
    mount('/', { fetchImpl: f }); const user = userEvent.setup();
    expect(await screen.findByText('Couldn’t load the store')).toBeInTheDocument();
    fail = false; await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Store' })).toBeInTheDocument();
  });

  it('completes the full order: browse → cart → checkout → confirmation, sending IDs and quantities only', async () => {
    const opened = []; vi.spyOn(window, 'open').mockImplementation((url) => { const tab = { location: '', close: vi.fn() }; opened.push(tab); return tab; });
    const f = makeFetch(); mount('/product/P1', { fetchImpl: f }); const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Red Sneakers' });
    expect(screen.getByLabelText('Was ₦18,000')).toBeInTheDocument();                  // genuine sale price
    await user.selectOptions(screen.getByLabelText('Quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(window.localStorage.getItem('cart')).toBe(JSON.stringify([{ id: 'P1', qty: 2 }]));
    expect(screen.getByRole('link', { name: 'Cart, 2 items' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Cart, 2 items' }));
    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument();
    expect(screen.getAllByText('₦30,000').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('link', { name: 'Checkout' }));

    await screen.findByRole('heading', { name: 'Checkout' });
    await user.click(screen.getByRole('button', { name: /Place order/ }));                   // empty form: blocked client-side
    expect(screen.getAllByRole('alert').length).toBe(4);
    expect(f.calls.filter((c) => c.init.method === 'POST')).toHaveLength(0);

    await user.type(screen.getByLabelText('Full name'), 'Ada Obi');
    await user.type(screen.getByLabelText('Phone (WhatsApp)'), '08012345678');
    await user.type(screen.getByLabelText('Email (for your receipt)'), 'ada@example.com');
    await user.type(screen.getByLabelText('Delivery address'), '12 Airport Rd, Benin City');
    await user.click(screen.getByRole('button', { name: /Place order/ }));

    expect(await screen.findByRole('heading', { name: 'Order received' })).toBeInTheDocument();
    const post = f.calls.find((c) => c.init.method === 'POST'); const body = JSON.parse(post.init.body);
    expect(post.init.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(body).toMatchObject({ action: 'placeOrder', name: 'Ada Obi', items: [{ id: 'P1', qty: 2 }], newsletter: false, website: '' });
    expect(body.request_id).toMatch(/^[A-Za-z0-9_-]{16,100}$/); expect(typeof body.started_at).toBe('number');
    expect(JSON.stringify(body)).not.toMatch(/price|total/);
    expect(screen.getByText('ORD-261114-ABCD1234')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', expect.stringContaining('https://wa.me/'));
    expect(window.localStorage.getItem('cart')).toBe('[]');                                   // cart cleared after a saved order
    expect(opened[0].location).toContain('wa.me');                                           // popup navigated after save
  });

  it('keeps the same request id on a retry after a timeout and shows the server error without clearing the cart', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => ({ location: '', close: vi.fn() }));
    let n = 0; const f = makeFetch({ post: () => { n += 1; if (n === 1) throw new TypeError('lost'); return { ok: false, error: 'Sorry, only 1 of "Red Sneakers" left.' }; } });
    window.localStorage.setItem('cart', JSON.stringify([{ id: 'P1', qty: 2 }]));
    mount('/checkout', { fetchImpl: f }); const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Checkout' });
    await user.type(screen.getByLabelText('Full name'), 'Ada'); await user.type(screen.getByLabelText('Phone (WhatsApp)'), '08012345678');
    await user.type(screen.getByLabelText('Email (for your receipt)'), 'a@b.co'); await user.type(screen.getByLabelText('Delivery address'), 'Edo');
    await user.click(screen.getByRole('button', { name: /Place order/ }));
    expect(await screen.findByText(/will not create a duplicate order/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Place order/ }));
    expect(await screen.findByText(/only 1 of "Red Sneakers"/)).toBeInTheDocument();
    const ids = f.calls.filter((c) => c.init.method === 'POST').map((c) => JSON.parse(c.init.body).request_id);
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
    expect(window.localStorage.getItem('cart')).toBe(JSON.stringify([{ id: 'P1', qty: 2 }]));
  });

  it('removes stale cart items when fresh stock arrives', async () => {
    window.localStorage.setItem('cart', JSON.stringify([{ id: 'P3', qty: 1 }, { id: 'P2', qty: 50 }, { id: 'DELETED', qty: 1 }]));
    mount('/cart');
    await screen.findByRole('heading', { name: 'Your cart' });
    await waitFor(() => expect(window.localStorage.getItem('cart')).toBe(JSON.stringify([{ id: 'P2', qty: 4 }])));
    const list = screen.getByRole('list'); expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('contact page lists only supplied details', async () => {
    mount('/contact'); await screen.findByRole('heading', { name: 'Contact us' });
    expect(screen.getByText('WhatsApp')).toBeInTheDocument(); expect(screen.queryByText('Phone')).toBeNull(); expect(screen.queryByText('Address')).toBeNull();
  });
});
