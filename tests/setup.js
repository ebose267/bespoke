import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

window.scrollTo = () => {};
afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear(); window.location.hash = ''; });
