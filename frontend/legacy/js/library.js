/**
 * Meck-Grade Library — Kartensammlungs-Seite
 * Lädt History-Einträge, rendert Raster, verwaltet Detailmodal.
 */
(async () => {

  // ── State ────────────────────────────────────────────────────────────────
  let _allEntries  = [];   // raw list from API (summary rows, no images)
  let _currentId   = null; // open modal session id
  let _currentData = null; // full AnalysisResult for open modal

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const grid      = document.getElementById('lib-grid');
  const countEl   = document.getElementById('lib-count');
  const searchEl  = document.getElementById('lib-search');
  const sortEl    = document.getElementById('lib-sort');
  const psaEl     = document.getElementById('lib-psa-filter');

  const backdrop  = document.getElementById('lib-modal-backdrop');
  const loading   = document.getElementById('modal-loading');
  const content   = document.getElementById('modal-content');

  // ── Load + render ─────────────────────────────────────────────────────────
  function _showSkeleton() {
    countEl.textContent = '';
    grid.innerHTML = Array.from({ length: 12 }, () => `
      <div class="lib-card" style="pointer-events:none">
        <div class="skeleton lib-card-thumb-placeholder" style="border-radius:0"></div>
        <div class="lib-card-body">
          <div class="skeleton" style="height:10px;width:50%;margin-bottom:6px"></div>
          <div class="skeleton" style="height:8px;width:75%;margin-bottom:4px"></div>
          <div class="skeleton" style="height:8px;width:40%"></div>
        </div>
      </div>
    `).join('');
  }

  async function loadAll() {
    _showSkeleton();
    const [psaMin, psaMax] = (psaEl.value || '1-10').split('-').map(Number);
    _allEntries = await API.getHistoryFiltered({
      limit:   500,
      search:  searchEl.value.trim(),
      sort:    sortEl.value,
      psa_min: psaMin,
      psa_max: psaMax,
    });
    renderGrid(_allEntries);
  }

  function renderGrid(entries) {
    countEl.textContent = `${entries.length} Karte${entries.length !== 1 ? 'n' : ''}`;

    if (!entries.length) {
      grid.innerHTML = `
        <div class="lib-empty" style="grid-column:1/-1">
          <div class="lib-empty-icon">🃏</div>
          <p>Keine Karten gefunden.</p>
          <p class="text-muted" style="margin-top:6px;font-size:.82rem">
            Analysiere deine erste Karte auf der <a href="/">Startseite</a>.
          </p>
        </div>`;
      return;
    }

    grid.innerHTML = entries.map(e => {
      const gradeColor = e.psa_grade >= 9 ? 'var(--pass)' : e.psa_grade >= 7 ? 'var(--accent)' : 'var(--warn)';
      const name = e.card_name || '—';
      const date = _fmtDate(e.timestamp);
      const thumb = e.thumbnail_b64
        ? `<img class="lib-card-thumb" src="data:image/jpeg;base64,${e.thumbnail_b64}" alt="${_esc(name)}">`
        : `<div class="lib-card-thumb-placeholder">🃏</div>`;

      return `
        <div class="lib-card" data-id="${e.id}" tabindex="0" role="button" aria-label="${_esc(name)}, PSA ${e.psa_grade}">
          ${thumb}
          <div class="lib-card-overlay">
            <div class="ov-row"><span class="ov-label">Zentrierung</span><span class="ov-val">${_round(e.centering)}</span></div>
            <div class="ov-row"><span class="ov-label">Ecken</span><span class="ov-val">${_round(e.corners)}</span></div>
            <div class="ov-row"><span class="ov-label">Kanten</span><span class="ov-val">${_round(e.edges)}</span></div>
            <div class="ov-row"><span class="ov-label">Oberfläche</span><span class="ov-val">${_round(e.surface)}</span></div>
          </div>
          <div class="lib-card-body">
            <div class="lib-card-grade" style="color:${gradeColor}">PSA ${e.psa_grade}</div>
            <div class="lib-card-name">${_esc(name)}</div>
            <div class="lib-card-date">${date}</div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.lib-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(card.dataset.id); });
    });
  }

  // ── Filter events ─────────────────────────────────────────────────────────
  let _debounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(loadAll, 250);
  });
  sortEl.addEventListener('change', loadAll);
  psaEl.addEventListener('change', loadAll);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportBtn  = document.getElementById('lib-export-btn');
  const exportMenu = document.getElementById('lib-export-menu');
  exportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => exportMenu?.classList.add('hidden'));

  document.getElementById('lib-export-csv')?.addEventListener('click', () => {
    exportMenu.classList.add('hidden');
    const [psaMin, psaMax] = (psaEl.value || '1-10').split('-').map(Number);
    API.exportHistory('csv', searchEl.value.trim(), psaMin, psaMax);
  });
  document.getElementById('lib-export-json')?.addEventListener('click', () => {
    exportMenu.classList.add('hidden');
    const [psaMin, psaMax] = (psaEl.value || '1-10').split('-').map(Number);
    API.exportHistory('json', searchEl.value.trim(), psaMin, psaMax);
  });

  // ── Modal ─────────────────────────────────────────────────────────────────
  async function openModal(sessionId) {
    _currentId   = sessionId;
    _currentData = null;

    backdrop.classList.remove('hidden');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    document.body.style.overflow = 'hidden';

    try {
      _currentData = await API.getHistoryEntry(sessionId);
      _renderModal(_currentData, _allEntries.find(e => e.id === sessionId));
      loading.classList.add('hidden');
      content.classList.remove('hidden');
    } catch (err) {
      loading.innerHTML = `<p class="text-muted" style="padding:40px">Fehler: ${_esc(err.message)}</p>`;
    }
  }

  function closeModal() {
    backdrop.classList.add('hidden');
    document.body.style.overflow = '';
    _currentId   = null;
    _currentData = null;
    loading.innerHTML = '<div class="spinner"></div>';
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function _renderModal(result, summary) {
    // Title
    const name = result.card_info?.name || summary?.card_name || 'Unbekannte Karte';
    const set  = result.card_info?.set_name || summary?.card_set || '';
    document.getElementById('modal-title').textContent = name;
    document.getElementById('modal-subtitle').textContent =
      [set, summary ? _fmtDate(summary.timestamp) : ''].filter(Boolean).join(' · ');

    // Images
    _setModalImage('front', result.annotated_front_b64, result.clean_front_b64);
    _setModalImage('back',  result.annotated_back_b64,  result.clean_back_b64);

    // Grade chips
    const g = result.grades;
    const psaClass = g.psa >= 9 ? 'psa-high' : g.psa <= 6 ? 'psa-low' : '';
    document.getElementById('modal-grades').innerHTML = `
      <span class="lib-grade-chip ${psaClass}">PSA ${g.psa} — ${g.psa_label}</span>
      <span class="lib-grade-chip">BGS ${g.bgs.composite.toFixed(1)}</span>
      <span class="lib-grade-chip">CGC ${g.cgc.toFixed(1)}</span>
      <span class="lib-grade-chip">TAG ${g.tag.toFixed(2)}</span>
    `;

    // Subscores
    const sub = result.subgrades;
    document.getElementById('modal-subscores').innerHTML = [
      ['Zentrierung', sub.centering],
      ['Ecken',       sub.corners],
      ['Kanten',      sub.edges],
      ['Oberfläche',  sub.surface],
    ].map(([label, val]) => _scoreBarHtml(label, val)).join('');

    // Centering detail
    const cf = result.centering_front;
    const cb = result.centering_back;
    document.getElementById('modal-centering').innerHTML = [
      cf ? `<div class="lib-detail-row"><span class="lib-detail-label">Vorne L/R</span><span>${cf.lr_percent}</span></div>` : '',
      cf ? `<div class="lib-detail-row"><span class="lib-detail-label">Vorne T/B</span><span>${cf.tb_percent}</span></div>` : '',
      cb ? `<div class="lib-detail-row"><span class="lib-detail-label">Hinten L/R</span><span>${cb.lr_percent}</span></div>` : '',
      cb ? `<div class="lib-detail-row"><span class="lib-detail-label">Hinten T/B</span><span>${cb.tb_percent}</span></div>` : '',
    ].join('') || '<p class="text-muted" style="font-size:.8rem">Keine Daten</p>';

    // Corners
    document.getElementById('modal-corners').innerHTML = (result.corners || [])
      .map(c => `<div class="lib-detail-row">
        <span class="lib-detail-label">${_cornerName(c.position)}</span>
        <span style="color:${_scoreColor(c.corner_score)}">${Math.round(c.corner_score)}/100</span>
      </div>`).join('') || '<p class="text-muted" style="font-size:.8rem">Keine Daten</p>';

    // Edges
    document.getElementById('modal-edges').innerHTML = (result.edges || [])
      .map(e => `<div class="lib-detail-row">
        <span class="lib-detail-label">${_edgeName(e.position)}</span>
        <span style="color:${_scoreColor(e.edge_score)}">${Math.round(e.edge_score)}/100</span>
      </div>`).join('') || '<p class="text-muted" style="font-size:.8rem">Keine Daten</p>';

    // Surface
    const s = result.surface;
    document.getElementById('modal-surface').innerHTML = s ? `
      <div class="lib-detail-row"><span class="lib-detail-label">Kratzer</span><span>${s.scratch_pixel_count.toLocaleString()} px (${(s.scratch_ratio*100).toFixed(3)}%)</span></div>
      <div class="lib-detail-row"><span class="lib-detail-label">Dellen</span><span>${s.dent_region_count}</span></div>
      <div class="lib-detail-row"><span class="lib-detail-label">SSIM</span><span>${(s.ssim_score*100).toFixed(1)}%</span></div>
      ${s.holo_detected ? `<div class="lib-detail-row"><span class="lib-detail-label">Holo-Schaden</span><span style="color:${_scoreColor(100-s.holo_damage_score*100)}">${(s.holo_damage_score*100).toFixed(0)}%</span></div>` : ''}
    ` : '<p class="text-muted" style="font-size:.8rem">Keine Daten</p>';

    // Warnings
    if (result.warnings?.length) {
      document.getElementById('modal-warnings-wrap').classList.remove('hidden');
      document.getElementById('modal-warnings').innerHTML = result.warnings
        .map(w => `<div class="lib-warning-chip">${_esc(w)}</div>`).join('');
    } else {
      document.getElementById('modal-warnings-wrap').classList.add('hidden');
    }

    // Notes
    document.getElementById('modal-notes').value = summary?.notes || '';

    // Tags
    _renderTags((summary?.tags || '').split(',').map(t => t.trim()).filter(Boolean));
  }

  // ── Image comparison slider ───────────────────────────────────────────────
  function _setModalImage(side, annotatedB64, cleanB64) {
    const wrap    = document.getElementById(`modal-${side}-wrap`);
    const content = document.getElementById(`modal-${side}-content`);

    if (!annotatedB64 && !cleanB64) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    content.innerHTML = '';

    if (annotatedB64 && cleanB64) {
      _buildModalSlider(content, annotatedB64, cleanB64);
    } else {
      const b64 = annotatedB64 || cleanB64;
      const img = document.createElement('img');
      img.className = 'lib-modal-card-img';
      img.id = `modal-${side}-img`;
      img.src = `data:image/jpeg;base64,${b64}`;
      img.alt = side === 'front' ? 'Vorderseite' : 'Rückseite';
      img.onclick = () => window.open(img.src, '_blank');
      content.appendChild(img);
    }
  }

  function _buildModalSlider(container, annotatedB64, cleanB64) {
    const annotatedSrc = `data:image/jpeg;base64,${annotatedB64}`;
    const cleanSrc     = `data:image/jpeg;base64,${cleanB64}`;

    const wrap = document.createElement('div');
    wrap.className = 'img-compare-wrap';

    const imgBottom = document.createElement('img');
    imgBottom.className = 'img-compare-bottom lib-modal-card-img';
    imgBottom.src = cleanSrc;
    imgBottom.onclick = () => window.open(cleanSrc, '_blank');

    const imgTop = document.createElement('img');
    imgTop.className = 'img-compare-top';
    imgTop.src = annotatedSrc;

    const handle = document.createElement('div');
    handle.className = 'img-compare-handle';

    const labels = document.createElement('div');
    labels.className = 'img-compare-labels';
    labels.innerHTML = '<span>Sauber</span><span>Annotiert</span>';

    wrap.appendChild(imgBottom);
    wrap.appendChild(imgTop);
    wrap.appendChild(handle);
    wrap.appendChild(labels);
    container.appendChild(wrap);

    _applySliderPct(imgTop, handle, 50);

    let dragging = false;
    function onMove(clientX) {
      const rect = wrap.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      _applySliderPct(imgTop, handle, pct);
    }
    wrap.addEventListener('mousedown', (e) => { dragging = true; onMove(e.clientX); e.preventDefault(); });
    wrap.addEventListener('touchstart', (e) => { dragging = true; onMove(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientX); });
    window.addEventListener('touchmove', (e) => { if (dragging) onMove(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('mouseup',  () => { dragging = false; });
    window.addEventListener('touchend', () => { dragging = false; });
  }

  function _applySliderPct(imgTop, handle, pct) {
    imgTop.style.clipPath = `inset(0 0 0 ${pct}%)`;
    handle.style.left     = `${pct}%`;
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  function _renderTags(tags) {
    const wrap  = document.getElementById('modal-tags-wrap');
    const input = document.getElementById('modal-tag-input');

    // Remove all except input
    wrap.querySelectorAll('.lib-tag-chip').forEach(el => el.remove());

    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'lib-tag-chip';
      chip.innerHTML = `${_esc(tag)} <button class="lib-tag-remove" title="Tag entfernen">✕</button>`;
      chip.querySelector('.lib-tag-remove').onclick = () => {
        chip.remove();
      };
      wrap.insertBefore(chip, input);
    });
  }

  function _getCurrentTags() {
    return [...document.querySelectorAll('#modal-tags-wrap .lib-tag-chip')]
      .map(el => el.textContent.replace('✕', '').trim())
      .filter(Boolean);
  }

  document.getElementById('modal-tag-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const val = e.target.value.trim().replace(/,/g, '');
    if (val) {
      _renderTags([..._getCurrentTags(), val]);
      e.target.value = '';
    }
  });

  // ── Save ─────────────────────────────────────────────────────────────────
  document.getElementById('modal-btn-save').addEventListener('click', async () => {
    if (!_currentId) return;
    const notes = document.getElementById('modal-notes').value;
    const tags  = _getCurrentTags().join(',');
    await Promise.all([
      API.updateHistoryNotes(_currentId, notes),
      API.updateHistoryTags(_currentId, tags),
    ]);
    // Update local summary
    const entry = _allEntries.find(e => e.id === _currentId);
    if (entry) { entry.notes = notes; entry.tags = tags; }

    const btn = document.getElementById('modal-btn-save');
    btn.textContent = '✓ Gespeichert';
    setTimeout(() => { btn.textContent = 'Speichern'; }, 1800);
  });

  // ── PDF ───────────────────────────────────────────────────────────────────
  document.getElementById('modal-btn-pdf').addEventListener('click', () => {
    if (_currentId) window.open(`/api/export/${_currentId}/pdf`, '_blank');
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  document.getElementById('modal-btn-delete').addEventListener('click', async () => {
    if (!_currentId) return;
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;
    await API.deleteHistoryEntry(_currentId);
    closeModal();
    await loadAll();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _scoreBarHtml(label, val) {
    const color = val >= 85 ? 'var(--pass)' : val >= 65 ? 'var(--accent)' : 'var(--warn)';
    const pct   = Math.round(val);
    return `
      <div class="lib-score-row">
        <span class="lib-score-label">${label}</span>
        <div class="lib-score-bar-wrap">
          <div class="lib-score-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="lib-score-val" style="color:${color}">${pct}</span>
      </div>`;
  }

  function _scoreColor(val) {
    return val >= 85 ? 'var(--pass)' : val >= 65 ? 'var(--accent)' : 'var(--warn)';
  }

  function _cornerName(pos) {
    const map = { top_left: 'Oben links', top_right: 'Oben rechts',
                  bottom_left: 'Unten links', bottom_right: 'Unten rechts' };
    return map[pos] || pos;
  }

  function _edgeName(pos) {
    const map = { top: 'Oben', bottom: 'Unten', left: 'Links', right: 'Rechts' };
    return map[pos] || pos;
  }

  function _fmtDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  function _round(v) { return v != null ? Math.round(v) : '—'; }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  await loadAll();

})();
