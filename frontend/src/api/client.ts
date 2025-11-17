import axios from 'axios';

/**
 * The configured Axios instance for making API requests.
 *
 * It sets the `baseURL` from the `VITE_API_URL` environment variable,
 * falling back to a default for local development. It also sets the
 * default `Content-Type` header to `application/json`.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const customerApiKey = import.meta.env.VITE_CUSTOMER_API_KEY ?? 'demo-customer-key';
api.defaults.headers.common['x-pos-api-key'] = customerApiKey;

export default api;
