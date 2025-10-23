// /src/lib/axios.js
import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
    withCredentials: true,
    timeout: 100000
});

// attach Bearer token from cookie (works with your Login code)
api.interceptors.request.use((config) => {
    const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) {
        const token = decodeURIComponent(match[1]);
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
