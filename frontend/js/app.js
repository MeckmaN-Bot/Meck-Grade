/**
 * Main app controller — state machine: IDLE → UPLOADING → ANALYZING → RESULTS → ERROR
 */
(async () => {

  // ── States ─────────────────────────────────────────────────────────────────
  const STATES = { IDLE: 0, UPLOADING: 1, ANALYZING: 2, RESULTS: 3, ERROR: 4 };
  let state = STATES.IDLE;
  let currentSessionId = null;

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
  try {
    await API.health();
  } catch {
    // Server might not be up yet — show idle anyway
  }
  setState(STATES.IDLE);

  // ── Uploader init ──────────────────────────────────────────────────────────
  Uploader.init(() => {});

  // ── Accordion wiring ───────────────────────────────────────────────────────
  document.querySelectorAll('.accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      item.classList.toggle('open');
    });
  });

  // ── Analyze button ─────────────────────────────────────────────────────────
  document.getElementById('btn-analyze').addEventListener('click', async () => {
    const { front, back } = Uploader.getFiles();
    if (!front) return;

    try {
      // Upload
      setState(STATES.UPLOADING);
      setAnalyzingStatus('Uploading scans…', 15);
      const uploadResult = await API.upload(front, back);
      currentSessionId = uploadResult.session_id;

      // Analyze
      setState(STATES.ANALYZING);
      setAnalyzingStatus('Detecting card boundaries…', 30);
      await delay(300);
      setAnalyzingStatus('Measuring centering…', 45);
      await delay(200);
      setAnalyzingStatus('Analyzing corners & edges…', 60);
      await delay(200);
      setAnalyzingStatus('Scanning surface for scratches & dents…', 75);

      const result = await API.analyze(currentSessionId);

      setAnalyzingStatus('Generating annotations…', 90);
      await delay(200);

      // Render results
      Viewer.render(result);
      Grades.render(result);
      setState(STATES.RESULTS);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      showError(err.message || 'An unexpected error occurred.');
    }
  });

  // ── Start over ─────────────────────────────────────────────────────────────
  document.getElementById('btn-restart')?.addEventListener('click', async () => {
    if (currentSessionId) {
      await API.deleteSession(currentSessionId).catch(() => {});
      currentSessionId = null;
    }
    setState(STATES.IDLE);
  });
  document.getElementById('btn-restart-error')?.addEventListener('click', () => {
    setState(STATES.IDLE);
  });

  // ── Download annotated images ──────────────────────────────────────────────
  document.getElementById('btn-download')?.addEventListener('click', async () => {
    if (!currentSessionId) return;
    const result = await API.analyze(currentSessionId).catch(() => null);
    if (!result) return;

    const sides = [
      { key: 'annotated_front_b64', name: 'front_annotated.jpg' },
      { key: 'annotated_back_b64',  name: 'back_annotated.jpg'  },
      { key: 'clean_front_b64',     name: 'front_clean.jpg'     },
      { key: 'clean_back_b64',      name: 'back_clean.jpg'      },
    ];

    sides.forEach(({ key, name }) => {
      if (!result[key]) return;
      const a = document.createElement('a');
      a.href = `data:image/jpeg;base64,${result[key]}`;
      a.download = `meckgrade_${name}`;
      a.click();
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setAnalyzingStatus(msg, pct) {
    const statusEl = document.getElementById('analyzing-status');
    const barEl    = document.getElementById('progress-bar');
    if (statusEl) statusEl.textContent = msg;
    if (barEl)    barEl.style.width = `${pct}%`;
  }

  function showError(msg) {
    const el = document.getElementById('error-message');
    if (el) el.textContent = msg;
    setState(STATES.ERROR);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

})();
