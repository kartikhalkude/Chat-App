// Polyfill for global
if (typeof global === 'undefined') {
  (window as any).global = window;
} 