/// <reference types="vite/client" />

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL, // keep your existing base URL setting; it should end in /api
});

// Attach the token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token is rejected, clear it and go back to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;