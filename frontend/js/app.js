/**
 * Main app controller.
 * States: IDLE → UPLOADING/ANALYZING → RESULTS → ERROR
 * Supports both single-card and batch-card modes.
 */
(async () => {

  // ── States ────────────────────────────────────────────────────────────────
  const STATES = { IDLE: 0, UPLOADING: 1, ANALYZING: 2, RESULTS: 3, ERROR: 4 };
  let state = STATES.IDLE;
  let isBatchMode      = false;
  let currentSessionId = null;
  let currentResult    = null;
  let activeStream     = null;

  const panels = {
    idle:      document.getElementById('panel-idle'),
    analyzing: document.getElementById('panel-analyzing'),
    results:   document.getElementById('panel-results'),
    error:     document.getElementById('panel-error'),
  };

  function setState(s) {
    state = s;
    Object.values(panels).forEach(p => p?.classList.add('hidden'));
    switch (s) {
      case STATES.IDLE:
        panels.idle.classList.remove('hidden');
        if (!isBatchMode) Uploader.reset();
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

  // ── Server ready ──────────────────────────────────────────────────────────
  try { await API.health(); } catch { /* server starting */ }
  setState(STATES.IDLE);

  // ── Mode toggle (Einzeln / Mehrere) ───────────────────────────────────────
  const singlePanel = document.getElementById('single-mode');
  const batchPanel  = document.getElementById('batch-mode');
  const btnSingle   = document.getElementById('btn-mode-single');
  const btnBatch    = document.getElementById('btn-mode-batch');
  const analyzeBtn  = document.getElementById('btn-analyze');

  function switchMode(batch) {
    isBatchMode = batch;
    singlePanel.classList.toggle('hidden',  batch);
    batchPanel.classList.toggle('hidden',  !batch);
    btnSingle.classList.toggle('active',   !batch);
    btnBatch.classList.toggle('active',     batch);

    if (batch) {
      BatchUploader.init(document.getElementById('batch-rows-container'));
      BatchUploader.onReady(ready => { analyzeBtn.disabled = !ready; });
      analyzeBtn.textContent = 'Alle Karten analysieren →';
    } else {
      analyzeBtn.textContent = 'Karte analysieren →';
      analyzeBtn.disabled = true;
    }
  }

  btnSingle.addEventListener('click', () => switchMode(false));
  btnBatch.addEventListener('click',  () => switchMode(true));

  document.getElementById('btn-add-row').addEventListener('click', () => {
    BatchUploader.addRow();
  });

  // ── Single-mode uploader ──────────────────────────────────────────────────
  Uploader.init(() => {
    const { front } = Uploader.getFiles();
    analyzeBtn.disabled = !front;
  });

  // ── Accordion wiring ──────────────────────────────────────────────────────
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.accordion-item').classList.toggle('open');
    });
  });

  // ── Analyze button ────────────────────────────────────────────────────────
  analyzeBtn.addEventListener('click', async () => {
    if (isBatchMode) {
      await _runBatch();
    } else {
      await _runSingle();
    }
  });

  // ── Single card analysis ──────────────────────────────────────────────────
  async function _runSingle() {
    const { front, back } = Uploader.getFiles();
    if (!front) return;

    try {
      setState(STATES.UPLOADING);
      document.getElementById('progress-single').classList.remove('hidden');
      document.getElementById('progress-batch').classList.add('hidden');
      _setProgress(8, 'Scans werden hochgeladen…');

      const uploaded = await API.upload(front, back);
      currentSessionId = uploaded.session_id;

      setState(STATES.ANALYZING);
      _setProgress(10, 'Analyse startet…');

      currentResult = await new Promise((resolve, reject) => {
        activeStream = API.analyzeStream(
          currentSessionId,
          (pct, msg) => _setProgress(pct, msg),
          (result)   => resolve(result),
          (err)      => reject(err),
        );
      });
      activeStream = null;

      _showResult(currentResult);
      _triggerCardLookup(currentSessionId);
      if (typeof History !== 'undefined') History.refresh();

    } catch (err) {
      activeStream = null;
      _showError(err.message || 'Ein unerwarteter Fehler ist aufgetreten.');
    }
  }

  // ── Batch analysis ────────────────────────────────────────────────────────
  async function _runBatch() {
    const rows = BatchUploader.getRows().filter(r => r.front !== null);
    if (!rows.length) return;

    setState(STATES.ANALYZING);
    document.getElementById('progress-single').classList.add('hidden');
    document.getElementById('progress-batch').classList.remove('hidden');

    const statusGrid = document.getElementById('batch-status-grid');
    BatchUploader.renderStatusGrid(statusGrid, rows);
    _updateBatchTitle(0, rows.length);

    let doneCount = 0;
    let lastResult = null;
    let lastSessionId = null;

    await BatchUploader.runAll(
      // onStart
      (rowId) => {
        BatchUploader.updateStatusItem(rowId, 2, 'Vorbereiten…', null, false);
      },
      // onProgress
      (rowId, pct, msg) => {
        BatchUploader.updateStatusItem(rowId, pct, msg, null, false);
      },
      // onDone
      (rowId, result) => {
        doneCount++;
        _updateBatchTitle(doneCount, rows.length);
        BatchUploader.updateStatusItem(rowId, 100, 'Fertig', result, false);
        lastResult    = result;
        // session id is embedded in result
        lastSessionId = result.session_id;
        _triggerCardLookup(result.session_id);
      },
      // onError
      (rowId, err) => {
        doneCount++;
        _updateBatchTitle(doneCount, rows.length);
        BatchUploader.updateStatusItem(rowId, 0, err.message || 'Fehler', null, true);
      },
      // onAllDone
      (allResults) => {
        const successful = allResults.filter(r => r.result);
        if (successful.length === 0) {
          _showError('Alle Analysen sind fehlgeschlagen.');
          return;
        }
        // Show the last successful result
        if (lastResult) {
          currentResult    = lastResult;
          currentSessionId = lastSessionId;
          _showResult(lastResult);
        }
        if (typeof History !== 'undefined') History.refresh();
        BatchUploader.reset();
        switchMode(false);
      },
    );
  }

  function _updateBatchTitle(done, total) {
    const el = document.getElementById('batch-progress-title');
    if (el) el.textContent = `Analyse läuft… (${done} / ${total} fertig)`;
  }

  // ── Result display ────────────────────────────────────────────────────────
  function _showResult(result) {
    Viewer.render(result);
    Grades.render(result);
    setState(STATES.RESULTS);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const ptEl = document.getElementById('processing-time');
    if (ptEl && result.processing_time_ms) {
      ptEl.textContent = `Analysezeit: ${(result.processing_time_ms / 1000).toFixed(1)} s`;
    }
  }

  // ── Start over ────────────────────────────────────────────────────────────
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

  // ── Downloads ─────────────────────────────────────────────────────────────
  document.getElementById('btn-download')?.addEventListener('click', () => {
    if (!currentResult) return;
    [
      ['annotated_front_b64', 'vorne_annotiert.jpg'],
      ['annotated_back_b64',  'hinten_annotiert.jpg'],
      ['clean_front_b64',     'vorne_sauber.jpg'],
      ['clean_back_b64',      'hinten_sauber.jpg'],
    ].forEach(([key, name]) => {
      if (!currentResult[key]) return;
      const a = document.createElement('a');
      a.href = `data:image/jpeg;base64,${currentResult[key]}`;
      a.download = `meckgrade_${name}`;
      a.click();
    });
  });

  document.getElementById('btn-pdf')?.addEventListener('click', () => {
    if (currentSessionId) window.open(`/api/export/${currentSessionId}/pdf`, '_blank');
  });

  // ── History drawer ────────────────────────────────────────────────────────
  const historyDrawer = document.getElementById('history-drawer');
  document.getElementById('btn-history')?.addEventListener('click', () => {
    historyDrawer?.classList.remove('hidden');
    if (typeof History !== 'undefined') History.load();
  });
  document.getElementById('btn-history-close')?.addEventListener('click', () => {
    historyDrawer?.classList.add('hidden');
  });
  historyDrawer?.addEventListener('click', e => {
    if (e.target === historyDrawer) historyDrawer.classList.add('hidden');
  });

  // ── Card lookup (non-blocking) ────────────────────────────────────────────
  async function _triggerCardLookup(sessionId) {
    try {
      const info = await API.lookupCard(sessionId);
      if (info?.name && sessionId === currentSessionId) _renderCardInfo(info);
    } catch { /* best-effort */ }
  }

  function _renderCardInfo(info) {
    const panel = document.getElementById('card-info-panel');
    if (!panel) return;
    let priceHtml = (info.prices || [])
      .map(p => `<span class="price-chip"><strong>PSA ${p.grade}</strong> ≈ ${p.price_str}</span>`)
      .join('');
    let linksHtml = '';
    if (info.tcgplayer_url)  linksHtml += `<a class="grading-link" href="${info.tcgplayer_url}"  target="_blank" rel="noopener">TCGPlayer</a>`;
    if (info.cardmarket_url) linksHtml += `<a class="grading-link" href="${info.cardmarket_url}" target="_blank" rel="noopener">Cardmarket</a>`;

    panel.innerHTML = `
      <div class="card-info-inner">
        ${info.image_url ? `<img src="${info.image_url}" class="card-info-thumb" alt="${_esc(info.name)}">` : ''}
        <div class="card-info-text">
          <p class="card-info-name">${_esc(info.name)}</p>
          <p class="card-info-meta text-muted">${_esc(info.set_name || '')}${info.number ? ` · #${info.number}` : ''}${info.rarity ? ` · ${info.rarity}` : ''}</p>
          ${priceHtml ? `<div class="price-chips">${priceHtml}</div>` : ''}
          ${linksHtml ? `<div class="grading-links" style="margin-top:8px">${linksHtml}</div>` : ''}
        </div>
      </div>`;
    panel.classList.remove('hidden');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _setProgress(pct, msg) {
    const statusEl = document.getElementById('analyzing-status');
    const barEl    = document.getElementById('progress-bar');
    if (statusEl) statusEl.textContent = msg;
    if (barEl)    barEl.style.width = `${Math.min(pct, 98)}%`;
  }

  function _showError(msg) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = msg;
    setState(STATES.ERROR);
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window._getCurrentResult    = () => currentResult;
  window._getCurrentSessionId = () => currentSessionId;

})();
