import axios from 'axios';
import { CONFIG } from '../config';

export const api = axios.create({
  baseURL: CONFIG.API_BASE_URL,
});

api.interceptors.request.use((requestConfig) => {
  const token = localStorage.getItem('careoclock_token');
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('careoclock_token');
      localStorage.removeItem('careoclock_user');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);
