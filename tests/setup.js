import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

window.scrollTo = () => {};
afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
  delete window.__THIMBLE_NO_AUTO_MOUNT__;
});
