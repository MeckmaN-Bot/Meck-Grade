/**
 * Grading History drawer — loads and renders past sessions from the SQLite DB.
 */
const History = (() => {

  let _entries = [];

  async function load() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '<p class="text-muted" style="padding:16px">Loading…</p>';
    try {
      _entries = await API.getHistory();
      _render(list);
    } catch {
      list.innerHTML = '<p class="text-muted" style="padding:16px">Could not load history.</p>';
    }
  }

  function refresh() {
    const list = document.getElementById('history-list');
    if (list && !document.getElementById('history-drawer')?.classList.contains('hidden')) {
      load();
    }
  }

  function _render(list) {
    if (!_entries.length) {
      list.innerHTML = '<p class="text-muted" style="padding:16px 20px">No grading sessions yet.</p>';
      return;
    }

    list.innerHTML = _entries.map((e) => {
      const date = _formatDate(e.timestamp);
      const cardLabel = e.card_name ? _esc(e.card_name) : '<em style="color:var(--text-muted)">Unknown card</em>';
      const gradeColor = e.psa_grade >= 9 ? 'var(--pass)' : e.psa_grade >= 7 ? 'var(--accent)' : 'var(--warn)';
      const thumb = e.thumbnail_b64
        ? `<img src="data:image/jpeg;base64,${e.thumbnail_b64}" class="history-thumb" alt="">`
        : '<div class="history-thumb-placeholder"></div>';

      return `
        <div class="history-row" data-id="${e.id}">
          ${thumb}
          <div class="history-row-info">
            <p class="history-card-name">${cardLabel}</p>
            <p class="history-meta text-muted">${date}${e.card_set ? ' · ' + _esc(e.card_set) : ''}</p>
            ${e.notes ? `<p class="history-notes">${_esc(e.notes)}</p>` : ''}
          </div>
          <div class="history-row-grade" style="color:${gradeColor}">PSA ${e.psa_grade}</div>
          <button class="history-delete-btn" title="Delete" data-id="${e.id}">✕</button>
        </div>
      `;
    }).join('');

    // Row click → load result
    list.querySelectorAll('.history-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('history-delete-btn')) return;
        _loadEntry(row.dataset.id);
      });
    });

    // Delete buttons
    list.querySelectorAll('.history-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await API.deleteHistoryEntry(btn.dataset.id);
        load();
      });
    });
  }

  async function _loadEntry(sessionId) {
    try {
      const result = await API.getHistory.call
        ? (await fetch(`/api/history/${sessionId}`).then(r => r.json()))
        : null;
      if (!result) return;

      // Close drawer
      document.getElementById('history-drawer')?.classList.add('hidden');

      // Render in results panel
      Viewer.render(result);
      Grades.render(result);
      document.getElementById('panel-idle')?.classList.add('hidden');
      document.getElementById('panel-analyzing')?.classList.add('hidden');
      document.getElementById('panel-error')?.classList.add('hidden');
      document.getElementById('panel-results')?.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Silently ignore — result may not have images any more
    }
  }

  function _formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
             + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { load, refresh };
})();
