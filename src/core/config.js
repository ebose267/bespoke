// Single source of build-time configuration. Never hard-code a client's URL anywhere else.
import { resolveApiUrl } from './api.js';
export const API_URL = (() => { try { return resolveApiUrl(import.meta.env); } catch (error) { return ''; } })();
export const API_ERROR = API_URL ? '' : (() => { try { resolveApiUrl(import.meta.env); return ''; } catch (error) { return error.message; } })();
