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

  // ── Animated panel transitions ─────────────────────────────────────────────
  function setState(s) {
    state = s;

    const prev = Object.values(panels).find(p => p && !p.classList.contains('hidden'));
    const next = (
      s === STATES.IDLE                              ? panels.idle      :
      s === STATES.UPLOADING || s === STATES.ANALYZING ? panels.analyzing :
      s === STATES.RESULTS                           ? panels.results   :
                                                      panels.error
    );

    if (prev && prev !== next) {
      prev.classList.add('panel-exit');
      prev.addEventListener('animationend', () => {
        prev.classList.add('hidden');
        prev.classList.remove('panel-exit');
      }, { once: true });
    } else if (!prev) {
      // Initial load: no animation
    }

    next?.classList.remove('hidden');
    requestAnimationFrame(() => next?.classList.add('panel-enter'));
    next?.addEventListener('animationend', () => next.classList.remove('panel-enter'), { once: true });

    if (s === STATES.IDLE && !isBatchMode) Uploader.reset();
  }

  // ── Server ready ──────────────────────────────────────────────────────────
  try { await API.health(); } catch { /* server starting */ }
  setState(STATES.IDLE);
  _checkOnboarding();

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
    if (isBatchMode) await _runBatch();
    else             await _runSingle();
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
      (rowId) => BatchUploader.updateStatusItem(rowId, 2, 'Vorbereiten…', null, false),
      (rowId, pct, msg) => BatchUploader.updateStatusItem(rowId, pct, msg, null, false),
      (rowId, result) => {
        doneCount++;
        _updateBatchTitle(doneCount, rows.length);
        BatchUploader.updateStatusItem(rowId, 100, 'Fertig', result, false);
        lastResult    = result;
        lastSessionId = result.session_id;
        _triggerCardLookup(result.session_id);
      },
      (rowId, err) => {
        doneCount++;
        _updateBatchTitle(doneCount, rows.length);
        BatchUploader.updateStatusItem(rowId, 0, err.message || 'Fehler', null, true);
        Toast.error(`Karte ${rowId}: ${err.message || 'Analyse fehlgeschlagen'}`);
      },
      (allResults) => {
        const successful = allResults.filter(r => r.result);
        if (!successful.length) { _showError('Alle Analysen sind fehlgeschlagen.'); return; }
        if (lastResult) {
          currentResult    = lastResult;
          currentSessionId = lastSessionId;
          _showResult(lastResult);
        }
        const failCount = allResults.length - successful.length;
        if (failCount > 0) Toast.error(`${failCount} Karte(n) konnten nicht analysiert werden.`);
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
    Viewer.setBorderData(result.centering_front || null, result.centering_back || null);
    Grades.render(result, currentSessionId);
    setState(STATES.RESULTS);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const ptEl = document.getElementById('processing-time');
    if (ptEl && result.processing_time_ms) {
      ptEl.textContent = `Analysezeit: ${(result.processing_time_ms / 1000).toFixed(1)} s`;
    }

    // PSA 10 confetti easter egg
    _maybeConfetti(result);
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
    let count = 0;
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
      count++;
    });
    if (count > 0) Toast.success(`${count} Bild${count > 1 ? 'er' : ''} heruntergeladen ✓`);
  });

  document.getElementById('btn-pdf')?.addEventListener('click', () => {
    if (!currentSessionId) return;
    window.open(`/api/export/${currentSessionId}/pdf`, '_blank');
    Toast.info('PDF wird geöffnet…');
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
      const panel = document.getElementById('card-info-panel');
      if (panel) panel.classList.remove('hidden');
      const info = await API.lookupCard(sessionId);
      if (sessionId === currentSessionId) {
        Grades.renderCardInfo(info && info.name ? info : null, sessionId);
      }
    } catch { /* best-effort */ }
  }

  // ── PSA 10 confetti ───────────────────────────────────────────────────────
  function _maybeConfetti(result) {
    if (result?.grades?.psa !== 10) return;
    if (typeof confetti === 'undefined') return;
    const colors = ['#2C5282', '#276749', '#FFD700', '#E8E8E4', '#6B9FD4'];
    confetti({ particleCount: 100, spread: 80,  origin: { y: 0.55 }, colors });
    setTimeout(() => confetti({ particleCount: 60, spread: 110, angle: 60,  origin: { x: 0.1, y: 0.65 }, colors }), 280);
    setTimeout(() => confetti({ particleCount: 60, spread: 110, angle: 120, origin: { x: 0.9, y: 0.65 }, colors }), 500);
    Toast.success('🏆 PSA 10 — Gem Mint! Herzlichen Glückwunsch!', 4500);
  }

  // ── Onboarding ────────────────────────────────────────────────────────────
  function _checkOnboarding() {
    if (localStorage.getItem('meckgrade_v1_onboarded')) return;
    const banner = document.getElementById('onboarding-banner');
    if (banner) banner.classList.remove('hidden');
  }

  document.getElementById('btn-onboarding-dismiss')?.addEventListener('click', () => {
    localStorage.setItem('meckgrade_v1_onboarded', '1');
    const banner = document.getElementById('onboarding-banner');
    if (!banner) return;
    banner.style.transition = 'opacity .3s ease, max-height .4s ease, margin .4s ease, padding .4s ease';
    banner.style.overflow = 'hidden';
    banner.style.maxHeight = banner.offsetHeight + 'px';
    banner.offsetHeight; // force reflow
    banner.style.opacity = '0';
    banner.style.maxHeight = '0';
    banner.style.marginBottom = '0';
    banner.style.paddingTop = '0';
    banner.style.paddingBottom = '0';
    banner.addEventListener('transitionend', () => banner.remove(), { once: true });
  });

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
