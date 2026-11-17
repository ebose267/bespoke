// Data + cart state. This file wires the PROTECTED core (src/core) into React. Redesign pages freely; do not edit logic here.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStorefront } from '../core/api.js';
import { applyTheme } from '../core/theme.js';
import { addToCart, cartCount, cartTotal, createCartStorage, detailedLines, normaliseCart, removeLine, setQuantity } from '../core/cart.js';

const StoreCtx = createContext(null);
const CartCtx = createContext(null);
const ToastCtx = createContext(() => {});

export const useStore = () => useContext(StoreCtx);
export const useCart = () => useContext(CartCtx);
export const useToast = () => useContext(ToastCtx);

export function StoreProvider({ apiUrl, config, fetchImpl, storage, children }) {
  const [state, setState] = useState({ status: apiUrl ? 'loading' : 'error', products: [], settings: {}, bestSellers: [], error: apiUrl ? '' : 'The store is not configured yet.' });
  const [toast, setToast] = useState('');
  const timer = useRef(0);
  const notify = useCallback((message) => { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2600); }, []);

  const load = useCallback(async () => {
    if (!apiUrl) return;
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    try { setState({ status: 'ready', error: '', ...(await fetchStorefront(apiUrl, { fetchImpl })) }); }
    catch (error) { setState((s) => ({ ...s, status: 'error', error: error.message || 'The store could not be loaded.' })); }
  }, [apiUrl, fetchImpl]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { applyTheme(config.theme, state.settings.brand_color); }, [config, state.settings.brand_color]);
  useEffect(() => { document.title = state.settings.store_name || 'Store'; }, [state.settings.store_name]);

  const value = useMemo(() => ({ ...state, apiUrl, config, fetchImpl, reload: load }), [state, apiUrl, config, fetchImpl, load]);
  return (
    <StoreCtx.Provider value={value}>
      <ToastCtx.Provider value={notify}>
        <CartProvider storage={storage}>{children}</CartProvider>
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      </ToastCtx.Provider>
    </StoreCtx.Provider>
  );
}

function CartProvider({ storage, children }) {
  const { products, status } = useStore();
  const notify = useToast();
  const store = useMemo(() => createCartStorage(storage || window.localStorage), [storage]);
  const [lines, setLines] = useState(() => store.load());

  // When fresh catalogue data arrives, remove deleted/sold-out items and clamp quantities to stock.
  useEffect(() => {
    if (status !== 'ready') return;
    setLines((prev) => { const next = normaliseCart(prev, products); store.save(next); return next; });
  }, [status, products, store]);

  const commit = useCallback((result, okMessage) => {
    if (result.error) { notify(result.error); if (result.lines !== lines) { setLines(result.lines); store.save(result.lines); } return false; }
    setLines(result.lines); store.save(result.lines); if (okMessage) notify(okMessage); return true;
  }, [lines, notify, store]);

  const value = useMemo(() => ({
    lines, count: cartCount(lines), detailed: detailedLines(lines, products), total: cartTotal(lines, products),
    add: (id, amount = 1) => commit(addToCart(lines, products, id, amount), 'Added to cart ✓'),
    setQty: (id, qty) => commit(setQuantity(lines, products, id, qty)),
    remove: (id) => commit({ lines: removeLine(lines, id) }),
    clear: () => { setLines([]); store.save([]); },
  }), [lines, products, commit, store]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
