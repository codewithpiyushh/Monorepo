// config.js – Single source of truth for the backend API base URL.
// Vite exposes VITE_* env vars at build time; fall back to the FastAPI default.
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000/api").replace(/\/$/, "");

export default API_BASE;
