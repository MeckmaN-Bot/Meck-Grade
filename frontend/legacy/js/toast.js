/**
 * Toast notification system — lightweight, no dependencies.
 * Usage:
 *   Toast.success('Gespeichert ✓')
 *   Toast.error('Fehler: Datei zu groß')
 *   Toast.info('PDF wird geöffnet…')
 */
const Toast = (() => {

  let _container = null;

  function _ensureContainer() {
    if (_container) return;
    _container = document.createElement('div');
    _container.id = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
  }

  /**
   * @param {string} msg
   * @param {'success'|'error'|'info'} type
   * @param {number} duration  ms before auto-dismiss (0 = no auto-dismiss)
   */
  function show(msg, type = 'info', duration = 2800) {
    _ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-msg">${_esc(msg)}</span>
      <button class="toast-close" aria-label="Schließen">×</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => _dismiss(toast));
    _container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    if (duration > 0) {
      setTimeout(() => _dismiss(toast), duration);
    }

    return toast;
  }

  function _dismiss(toast) {
    if (!toast || toast.classList.contains('toast-dismissing')) return;
    toast.classList.add('toast-dismissing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }

  function success(msg, duration) { return show(msg, 'success', duration); }
  function error(msg, duration)   { return show(msg, 'error',   duration ?? 5000); }
  function info(msg, duration)    { return show(msg, 'info',    duration); }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { show, success, error, info };
})();
