// utils/cookies.js - Reusable cookie utility functions

export const cookieUtils = {
  /**
   * Get a cookie value by name
   * @param {string} name - Cookie name
   * @returns {string|null} - Cookie value or null if not found
   */
  get: (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const cookieValue = parts.pop().split(';').shift();
      try {
        // Try to decode if it's URL encoded
        return decodeURIComponent(cookieValue);
      } catch (err) {
        console.log(err);
        
        return cookieValue;
      }
    }
    return null;
  },
  
  /**
   * Set a cookie
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {number} days - Expiration in days (default: 7)
   * @param {object} options - Additional cookie options
   */
  set: (name, value, days = 7, options = {}) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    
    let cookieString = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
    
    // Add additional options
    if (options.domain) cookieString += `;domain=${options.domain}`;
    if (options.secure) cookieString += `;secure`;
    if (options.sameSite) cookieString += `;samesite=${options.sameSite}`;
    if (options.httpOnly) cookieString += `;httponly`;
    
    document.cookie = cookieString;
  },
  
  /**
   * Remove a cookie
   * @param {string} name - Cookie name
   * @param {string} path - Cookie path (default: '/')
   * @param {string} domain - Cookie domain
   */
  remove: (name, path = '/', domain = '') => {
    let cookieString = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=${path}`;
    if (domain) cookieString += `;domain=${domain}`;
    document.cookie = cookieString;
  },
  
  /**
   * Check if a cookie exists
   * @param {string} name - Cookie name
   * @returns {boolean} - True if cookie exists
   */
  exists: (name) => {
    return cookieUtils.get(name) !== null;
  },
  
  /**
   * Get all cookies as an object
   * @returns {object} - Object with all cookies
   */
  getAll: () => {
    const cookies = {};
    document.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch (err) {
          console.log(err);
          cookies[name] = value;
        }
      }
    });
    return cookies;
  },
  
  /**
   * Clear all cookies (for current domain and path)
   */
  clearAll: () => {
    const cookies = cookieUtils.getAll();
    Object.keys(cookies).forEach(name => {
      cookieUtils.remove(name);
    });
  }
};

// Auth-specific cookie utilities
export const authCookies = {
  /**
   * Get authentication token from cookies
   * @returns {string|null} - Auth token or null
   */
  getToken: () => {
    return cookieUtils.get('token');
  },
  
  /**
   * Set authentication token
   * @param {string} token - JWT token
   * @param {number} days - Expiration in days
   */
  setToken: (token, days = 7) => {
    cookieUtils.set('token', token, days, {
      secure: window.location.protocol === 'https:',
      sameSite: 'strict'
    });
  },
  
  /**
   * Remove authentication token
   */
  removeToken: () => {
    cookieUtils.remove('token');
  },
  
  /**
   * Check if user is authenticated
   * @returns {boolean} - True if token exists
   */
  isAuthenticated: () => {
    return cookieUtils.exists('token');
  }
};

// Example usage:
/*
import { cookieUtils, authCookies } from './utils/cookies.js';

// Basic cookie operations
cookieUtils.set('theme', 'dark', 30); // Set theme for 30 days
const theme = cookieUtils.get('theme');
cookieUtils.remove('theme');

// Auth operations
const token = authCookies.getToken();
authCookies.setToken('jwt-token-here');
if (authCookies.isAuthenticated()) {
  // User is logged in
}
authCookies.removeToken(); // Logout
*/