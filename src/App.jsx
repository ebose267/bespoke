import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { NotFoundView } from './components/ui.jsx';
import { useStore } from './context/StoreContext.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import { About, Contact, Done, NotFound } from './pages/Info.jsx';
import { BestSellers, Categories, CategoryDetail, NewArrivals } from './pages/Discovery.jsx';

/** A route whose module is switched off in the client config behaves like any unknown page. */
function Module({ name, children }) {
  const { config } = useStore();
  return config.modules[name] ? children : <NotFoundView />;
}

export default function App({ Router = HashRouter }) {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Module name="shop"><Shop /></Module>} />
          <Route path="new-arrivals" element={<Module name="newArrivals"><NewArrivals /></Module>} />
          <Route path="categories" element={<Module name="categories"><Categories /></Module>} />
          <Route path="category/:slug" element={<Module name="categories"><CategoryDetail /></Module>} />
          <Route path="best-sellers" element={<Module name="bestSellers"><BestSellers /></Module>} />
          <Route path="product/:id" element={<Product />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="done" element={<Done />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}
