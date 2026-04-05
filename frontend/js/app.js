/**
 * Main app controller — state machine: IDLE → UPLOADING → ANALYZING → RESULTS → ERROR
 */
(async () => {

  // ── States ─────────────────────────────────────────────────────────────────
  const STATES = { IDLE: 0, UPLOADING: 1, ANALYZING: 2, RESULTS: 3, ERROR: 4 };
  let state = STATES.IDLE;
  let currentSessionId = null;
  let currentResult = null;
  let activeStream = null;  // EventSource reference for cancellation

  const panels = {
    idle:      document.getElementById('panel-idle'),
    analyzing: document.getElementById('panel-analyzing'),
    results:   document.getElementById('panel-results'),
    error:     document.getElementById('panel-error'),
  };

  function setState(s) {
    state = s;
    Object.values(panels).forEach(p => p && p.classList.add('hidden'));
    switch (s) {
      case STATES.IDLE:
        panels.idle.classList.remove('hidden');
        Uploader.reset();
        break;
      case STATES.UPLOADING:
      case STATES.ANALYZING:
        panels.analyzing.classList.remove('hidden');
        break;
      case STATES.RESULTS:
        panels.results.classList.remove('hidden');
        break;
      case STATES.ERROR:
        panels.error.classList.remove('hidden');
        break;
    }
  }

  // ── Server readiness check ─────────────────────────────────────────────────
  try { await API.health(); } catch { /* server starting — show idle anyway */ }
  setState(STATES.IDLE);

  // ── Uploader init ──────────────────────────────────────────────────────────
  Uploader.init(() => {});

  // ── Accordion wiring ───────────────────────────────────────────────────────
  document.querySelectorAll('.accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.closest('.accordion-item').classList.toggle('open');
    });
  });

  // ── Analyze button ─────────────────────────────────────────────────────────
  document.getElementById('btn-analyze').addEventListener('click', async () => {
    const { front, back } = Uploader.getFiles();
    if (!front) return;

    try {
      // Upload
      setState(STATES.UPLOADING);
      setAnalyzingStatus('Uploading scans…', 8);
      const uploadResult = await API.upload(front, back);
      currentSessionId = uploadResult.session_id;

      // Analyze via SSE
      setState(STATES.ANALYZING);
      setAnalyzingStatus('Starting analysis…', 10);

      await new Promise((resolve, reject) => {
        activeStream = API.analyzeStream(
          currentSessionId,
          (pct, msg) => setAnalyzingStatus(msg, pct),
          (result) => {
            currentResult = result;
            resolve(result);
          },
          (err) => reject(err),
        );
      });

      activeStream = null;

      // Render results
      Viewer.render(currentResult);
      Grades.render(currentResult);
      setState(STATES.RESULTS);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Trigger async card lookup (non-blocking)
      _triggerCardLookup(currentSessionId);

      // Refresh history drawer if open
      if (typeof History !== 'undefined') History.refresh();

    } catch (err) {
      activeStream = null;
      showError(err.message || 'An unexpected error occurred.');
    }
  });

  // ── Start over ─────────────────────────────────────────────────────────────
  document.getElementById('btn-restart')?.addEventListener('click', async () => {
    if (activeStream) { activeStream.close(); activeStream = null; }
    if (currentSessionId) {
      await API.deleteSession(currentSessionId).catch(() => {});
      currentSessionId = null;
    }
    currentResult = null;
    setState(STATES.IDLE);
  });

  document.getElementById('btn-restart-error')?.addEventListener('click', () => {
    if (activeStream) { activeStream.close(); activeStream = null; }
    setState(STATES.IDLE);
  });

  // ── Download annotated images ──────────────────────────────────────────────
  document.getElementById('btn-download')?.addEventListener('click', () => {
    if (!currentResult) return;
    const sides = [
      { key: 'annotated_front_b64', name: 'front_annotated.jpg' },
      { key: 'annotated_back_b64',  name: 'back_annotated.jpg'  },
      { key: 'clean_front_b64',     name: 'front_clean.jpg'     },
      { key: 'clean_back_b64',      name: 'back_clean.jpg'      },
    ];
    sides.forEach(({ key, name }) => {
      if (!currentResult[key]) return;
      const a = document.createElement('a');
      a.href = `data:image/jpeg;base64,${currentResult[key]}`;
      a.download = `meckgrade_${name}`;
      a.click();
    });
  });

  // ── PDF download ───────────────────────────────────────────────────────────
  document.getElementById('btn-pdf')?.addEventListener('click', () => {
    if (!currentSessionId) return;
    window.open(`/api/export/${currentSessionId}/pdf`, '_blank');
  });

  // ── History drawer ─────────────────────────────────────────────────────────
  const historyBtn    = document.getElementById('btn-history');
  const historyDrawer = document.getElementById('history-drawer');
  const historyClose  = document.getElementById('btn-history-close');

  historyBtn?.addEventListener('click', () => {
    historyDrawer?.classList.remove('hidden');
    if (typeof History !== 'undefined') History.load();
  });
  historyClose?.addEventListener('click', () => {
    historyDrawer?.classList.add('hidden');
  });
  historyDrawer?.addEventListener('click', (e) => {
    if (e.target === historyDrawer) historyDrawer.classList.add('hidden');
  });

  // ── Card lookup (non-blocking, renders card info panel if found) ──────────
  async function _triggerCardLookup(sessionId) {
    try {
      const info = await API.lookupCard(sessionId);
      if (info && info.name) {
        _renderCardInfo(info);
      }
    } catch { /* lookup is best-effort */ }
  }

  function _renderCardInfo(info) {
    const panel = document.getElementById('card-info-panel');
    if (!panel) return;

    let priceHtml = '';
    if (info.prices && info.prices.length) {
      priceHtml = info.prices
        .map(p => `<span class="price-chip"><strong>PSA ${p.grade}</strong> ≈ ${p.price_str}</span>`)
        .join('');
    }

    let linksHtml = '';
    if (info.tcgplayer_url) {
      linksHtml += `<a class="grading-link" href="${info.tcgplayer_url}" target="_blank" rel="noopener">TCGPlayer</a>`;
    }
    if (info.cardmarket_url) {
      linksHtml += `<a class="grading-link" href="${info.cardmarket_url}" target="_blank" rel="noopener">Cardmarket</a>`;
    }

    panel.innerHTML = `
      <div class="card-info-inner">
        ${info.image_url ? `<img src="${info.image_url}" class="card-info-thumb" alt="${info.name}">` : ''}
        <div class="card-info-text">
          <p class="card-info-name">${_esc(info.name)}</p>
          <p class="card-info-meta text-muted">${_esc(info.set_name || '')}${info.number ? ` · #${info.number}` : ''}${info.rarity ? ` · ${info.rarity}` : ''}</p>
          ${priceHtml ? `<div class="price-chips">${priceHtml}</div>` : ''}
          ${linksHtml ? `<div class="grading-links" style="margin-top:8px">${linksHtml}</div>` : ''}
        </div>
      </div>
    `;
    panel.classList.remove('hidden');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setAnalyzingStatus(msg, pct) {
    const statusEl = document.getElementById('analyzing-status');
    const barEl    = document.getElementById('progress-bar');
    if (statusEl) statusEl.textContent = msg;
    if (barEl)    barEl.style.width = `${Math.min(pct, 98)}%`;
  }

  function showError(msg) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = msg;
    setState(STATES.ERROR);
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Expose result for History module
  window._getCurrentResult = () => currentResult;
  window._getCurrentSessionId = () => currentSessionId;

})();
