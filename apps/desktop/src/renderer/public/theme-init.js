// Applies the persisted theme class to <html> before React mounts, so there is
// no flash of the wrong theme (SOU-144). Must stay a plain, external, synchronous
// script — the app's CSP is `script-src 'self'` with no 'unsafe-inline', so an
// inline <script> in index.html would be blocked. Mirrors the storage format
// zustand's `persist` middleware writes for `centre-soutien.theme`
// (see stores/theme-store.ts): { state: { preference }, version }.
(function () {
  try {
    var raw = localStorage.getItem('centre-soutien.theme');
    var preference = raw ? JSON.parse(raw).state.preference : 'system';
    var isDark = preference === 'dark' || (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch {
    // Storage unavailable or corrupted — fall back to the light default.
  }
})();
