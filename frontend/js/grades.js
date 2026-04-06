/**
 * Renders grade badges, subgrade grid, subscore bars, accordion, warnings, links.
 */
const Grades = (() => {

  let _currentSessionId = null;

  function render(result, sessionId) {
    _currentSessionId = sessionId || null;
    _renderGradeSummary(result.grades);
    _renderConfidence(result.grades);
    _renderExplainability(result.grades);
    _renderSubscoreBars(result.subgrades);
    _renderBgsSubgrades(result.grades.bgs);
    _renderWarnings(result.warnings, result.dpi_warning);
    _renderSummary(result.summary);
    _renderAccordion(result);
    _renderGradingLinks();
    _renderProcessingTime(result.processing_time_ms);
  }

  // ── Grade summary bar ──────────────────────────────────────────────────────

  function _renderGradeSummary(grades) {
    const bar = document.getElementById('grade-bar');
    bar.innerHTML = '';

    const items = [
      { provider: 'PSA',  value: grades.psa,           label: grades.psa_label,      decimals: 0, delay: 0   },
      { provider: 'BGS',  value: grades.bgs.composite, label: _bgsLabel(grades.bgs), decimals: 1, delay: 80  },
      { provider: 'CGC',  value: grades.cgc,           label: grades.cgc_label,      decimals: 1, delay: 160 },
      { provider: 'TAG',  value: grades.tag,           label: 'Precision',            decimals: 2, delay: 240 },
    ];

    items.forEach(({ provider, value, label, decimals, delay }) => {
      const div = document.createElement('div');
      div.className = `grade-badge ${_gradeClass(value)}`;
      div.style.animationDelay = `${delay}ms`;
      div.classList.add('grade-pop');
      const valSpan = document.createElement('span');
      valSpan.className = 'grade-badge-value';
      valSpan.textContent = '0';
      div.innerHTML = `<span class="grade-badge-provider">${provider}</span>`;
      div.appendChild(valSpan);
      div.innerHTML += `<span class="grade-badge-label">${label}</span>`;
      bar.appendChild(div);

      // Count-up animation
      _countUp(valSpan, 0, value, decimals, 600, delay);
    });
  }

  /** Animate a number from start→end over durationMs, starting after delayMs. */
  function _countUp(el, start, end, decimals, duration, delay) {
    const startTime = performance.now() + delay;
    function step(now) {
      if (now < startTime) { requestAnimationFrame(step); return; }
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = current.toFixed(decimals);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Confidence band ────────────────────────────────────────────────────────

  function _renderConfidence(grades) {
    let el = document.getElementById('confidence-row');
    if (!el) {
      el = document.createElement('div');
      el.id = 'confidence-row';
      el.className = 'confidence-row';
      const bar = document.getElementById('grade-bar');
      if (bar) bar.parentNode.insertBefore(el, bar.nextSibling);
    }

    const { confidence_pct: pct, grade_low: low, grade_high: high, limiting_factor: lf } = grades;
    if (!pct) { el.innerHTML = ''; return; }

    const rangeStr = low === high ? `PSA ${low}` : `PSA ${low}–${high}`;
    const lfLabel  = { centering: 'Zentrierung', corners: 'Ecken', edges: 'Kanten', surface: 'Oberfläche' }[lf] || lf;
    const barColor = pct >= 75 ? 'var(--pass)' : pct >= 55 ? 'var(--accent)' : 'var(--warn)';

    el.innerHTML = `
      <div class="confidence-label">
        <span class="confidence-range">${rangeStr}</span>
        <span class="confidence-pct" style="color:${barColor}">${pct}% Konfidenz</span>
      </div>
      <div class="confidence-bar-wrap">
        <div class="confidence-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      ${lf ? `<div class="confidence-tip">⚠ Limitierender Faktor: <strong>${lfLabel}</strong></div>` : ''}
    `;
  }

  // ── Explainability hint ────────────────────────────────────────────────────

  function _renderExplainability(grades) {
    let el = document.getElementById('explainability-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'explainability-hint';
      el.className = 'explainability-hint';
      const confidenceRow = document.getElementById('confidence-row');
      if (confidenceRow) confidenceRow.parentNode.insertBefore(el, confidenceRow.nextSibling);
    }

    const { grade_without_top_defect: simPsa, psa, top_defect_type: dtype, top_defect_zone: zone } = grades;
    if (!simPsa || simPsa <= psa || !dtype) { el.innerHTML = ''; return; }

    const typeLabel = { scratch: 'Kratzer', dent: 'Delle' }[dtype] || dtype;
    const zoneLabel = { corner_zone: 'Eckenzone', edge_zone: 'Kante', center: 'Mitte' }[zone] || zone;

    el.innerHTML = `
      <span class="explainability-icon">💡</span>
      Ohne den schwersten ${typeLabel} (${zoneLabel}) wäre das Ergebnis
      <strong>PSA ${simPsa}</strong> statt PSA ${psa}.
    `;
  }

  // ── Card lookup panel (card-id edit + ROI + pop-report) ────────────────────

  function renderCardInfo(cardInfo, sessionId) {
    _currentSessionId = sessionId || _currentSessionId;
    const wrap = document.getElementById('card-info-wrap');
    if (!wrap) return;

    if (!cardInfo || !cardInfo.name) {
      _renderCardIdEdit(wrap, null);
      return;
    }

    const gameIcon = { pokemon: '🎮', mtg: '🧙', yugioh: '⚔️', digimon: '🦕' }[cardInfo.game] || '🃏';
    const price    = cardInfo.raw_nm_price
      ? `${cardInfo.currency === 'EUR' ? '€' : '$'}${cardInfo.raw_nm_price.toFixed(2)} NM`
      : '';

    wrap.innerHTML = `
      <div class="card-info-header">
        <img class="card-info-img" src="${_esc(cardInfo.image_url)}" alt="" onerror="this.style.display='none'">
        <div class="card-info-meta">
          <div class="card-info-name">${gameIcon} ${_esc(cardInfo.name)}</div>
          ${cardInfo.set_name ? `<div class="card-info-set">${_esc(cardInfo.set_name)}${cardInfo.number ? ` #${_esc(cardInfo.number)}` : ''}</div>` : ''}
          ${cardInfo.rarity   ? `<div class="card-info-rarity text-muted">${_esc(cardInfo.rarity)}</div>` : ''}
          ${price             ? `<div class="card-info-price">${_esc(price)}</div>` : ''}
        </div>
      </div>
      ${cardInfo.prices?.length ? _priceTableHtml(cardInfo.prices) : ''}
      <div class="card-info-actions">
        ${cardInfo.tcgplayer_url  ? `<a class="card-link" href="${_esc(cardInfo.tcgplayer_url)}"  target="_blank">TCGPlayer</a>` : ''}
        ${cardInfo.cardmarket_url ? `<a class="card-link" href="${_esc(cardInfo.cardmarket_url)}" target="_blank">Cardmarket</a>` : ''}
        ${cardInfo.psa_pop_url    ? `<a class="card-link" href="${_esc(cardInfo.psa_pop_url)}"    target="_blank">PSA Population</a>` : ''}
      </div>
      <div id="card-id-edit-wrap" class="card-id-edit-wrap">
        <input id="card-id-input" class="card-id-input" type="text" value="${_esc(cardInfo.name)}" placeholder="Kartenname korrigieren…">
        <button id="card-id-search" class="btn-sm">Erneut suchen</button>
      </div>
      <div id="roi-wrap"></div>
    `;

    _attachCardIdSearch();
    _loadRoi();
  }

  function _renderCardIdEdit(wrap, currentName) {
    wrap.innerHTML = `
      <div class="card-info-empty">
        <p class="text-muted" style="font-size:.82rem;margin-bottom:8px">Karte nicht erkannt.</p>
        <div class="card-id-edit-wrap">
          <input id="card-id-input" class="card-id-input" type="text"
                 value="${currentName ? _esc(currentName) : ''}" placeholder="Kartenname eingeben…">
          <button id="card-id-search" class="btn-sm">Suchen</button>
        </div>
      </div>
    `;
    _attachCardIdSearch();
  }

  function _attachCardIdSearch() {
    const btn   = document.getElementById('card-id-search');
    const input = document.getElementById('card-id-input');
    if (!btn || !input || !_currentSessionId) return;

    async function doSearch() {
      const name = input.value.trim();
      if (!name) return;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const info = await API.lookupCard(_currentSessionId, name);
        if (info && info.name) renderCardInfo(info, _currentSessionId);
        else {
          btn.disabled   = false;
          btn.textContent = 'Suchen';
        }
      } catch { btn.disabled = false; btn.textContent = 'Suchen'; }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  function _priceTableHtml(prices) {
    const rows = prices.slice(0, 6).map(p =>
      `<tr><td>PSA ${p.grade}</td><td class="price-val">${_esc(p.price_str)}</td></tr>`
    ).join('');
    return `<table class="price-table"><thead><tr><th>Note</th><th>~Preis</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function _loadRoi() {
    if (!_currentSessionId) return;
    const roiWrap = document.getElementById('roi-wrap');
    if (!roiWrap) return;
    try {
      const roi = await API.getRoi(_currentSessionId);
      if (roi && roi.available) _renderRoi(roiWrap, roi);
    } catch { /* silent */ }
  }

  function _renderRoi(wrap, roi) {
    const rows = roi.services.map(svc => {
      const tierRows = svc.tiers.map(tier => {
        const best = tier.grades.find(g => g.grade === roi.psa_estimate) || tier.grades[0];
        const icon = best.worth ? '✅' : '❌';
        const gain = best.net_gain_eur >= 0 ? `+€${best.net_gain_eur.toFixed(0)}` : `-€${Math.abs(best.net_gain_eur).toFixed(0)}`;
        return `<tr>
          <td>${icon} ${_esc(svc.service)} ${_esc(tier.tier)}</td>
          <td>€${tier.cost_eur}</td>
          <td style="color:${best.worth ? 'var(--pass)' : 'var(--fail)'}"><strong>${gain}</strong></td>
          <td class="text-muted" style="font-size:.72rem">${_esc(tier.turnaround)}</td>
        </tr>`;
      }).join('');
      return tierRows;
    }).join('');

    wrap.innerHTML = `
      <details class="roi-details">
        <summary class="roi-summary">💰 Submission ROI — lohnt sich das Einschicken?</summary>
        <p class="text-muted roi-note">Basis: ~€${roi.raw_nm_eur.toFixed(0)} NM-Preis · PSA ${roi.grade_low}–${roi.grade_high} erwartet</p>
        <table class="roi-table">
          <thead><tr><th>Service / Tier</th><th>Kosten</th><th>Netto</th><th>Dauer</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }

  function _bgsLabel(bgs) {
    if (bgs.black_label) return 'Black Label';
    if (bgs.composite >= 9.5) return 'Gem Mint';
    if (bgs.composite >= 9.0) return 'Mint';
    if (bgs.composite >= 8.0) return 'NM-MT';
    if (bgs.composite >= 7.0) return 'NM';
    return 'Below NM';
  }

  function _gradeClass(value) {
    if (value >= 9.5) return 'grade-gem';
    if (value >= 8.0) return 'grade-mint';
    if (value >= 6.0) return 'grade-warn';
    return 'grade-poor';
  }

  // ── Subscore bars ──────────────────────────────────────────────────────────

  function _renderSubscoreBars(sub) {
    const wrap = document.getElementById('subscore-bars');
    wrap.innerHTML = '';
    const items = [
      { name: 'Centering', value: sub.centering },
      { name: 'Corners',   value: sub.corners   },
      { name: 'Edges',     value: sub.edges     },
      { name: 'Surface',   value: sub.surface   },
    ];
    items.forEach(({ name, value }) => {
      const color = value >= 85 ? 'var(--pass)' : value >= 65 ? 'var(--warn)' : 'var(--fail)';
      wrap.innerHTML += `
        <div class="subscore-row">
          <span class="subscore-name">${name}</span>
          <div class="subscore-bar-wrap">
            <div class="subscore-bar-fill" style="width:${value}%;background:${color}"></div>
          </div>
          <span class="subscore-value" style="color:${color}">${value.toFixed(0)}</span>
        </div>
      `;
    });
  }

  // ── BGS subgrade grid ──────────────────────────────────────────────────────

  function _renderBgsSubgrades(bgs) {
    const grid = document.getElementById('bgs-subgrades');
    grid.innerHTML = '';
    const items = [
      { name: 'Centering', value: bgs.centering },
      { name: 'Corners',   value: bgs.corners   },
      { name: 'Edges',     value: bgs.edges     },
      { name: 'Surface',   value: bgs.surface   },
    ];
    if (bgs.black_label) {
      grid.innerHTML = `<div class="subgrade-cell" style="grid-column:1/-1;justify-content:center">
        <span style="font-size:.85rem;font-weight:700;letter-spacing:.04em">
          ⭐ BGS BLACK LABEL — All subgrades 10
        </span>
      </div>`;
    }
    items.forEach(({ name, value }) => {
      const cls = value >= 9.5 ? 'pass' : value >= 8.0 ? 'warn' : 'fail';
      grid.innerHTML += `
        <div class="subgrade-cell">
          <span class="subgrade-name">${name}</span>
          <span class="subgrade-score ${cls}">${value.toFixed(1)}</span>
        </div>
      `;
    });
  }

  // ── Warnings ──────────────────────────────────────────────────────────────

  function _renderWarnings(warnings, dpiWarning) {
    const wrap = document.getElementById('warning-list');
    wrap.innerHTML = '';

    if (dpiWarning) {
      wrap.innerHTML += `<div class="dpi-warning">⚠ Low scan resolution detected — results may be less accurate. Scan at 300 DPI or higher.</div>`;
    }

    if (!warnings || warnings.length === 0) return;

    warnings.forEach((w) => {
      wrap.innerHTML += `<div class="warning-item">${_esc(w)}</div>`;
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  function _renderSummary(text) {
    const el = document.getElementById('summary-text');
    el.textContent = text || '';
  }

  // ── Accordion ─────────────────────────────────────────────────────────────

  function _renderAccordion(result) {
    _renderCenteringSection(result.centering_front, result.centering_back, result.subgrades.centering);
    _renderCornersSection(result.corners, result.subgrades.corners);
    _renderEdgesSection(result.edges, result.subgrades.edges);
    _renderSurfaceSection(result.surface, result.subgrades.surface, result.relief_front_b64 || null);
  }

  function _pillClass(score) {
    if (score >= 85) return 'pill-pass';
    if (score >= 65) return 'pill-warn';
    return 'pill-fail';
  }

  function _pillLabel(score) {
    if (score >= 95) return 'Gem Mint';
    if (score >= 85) return 'Mint';
    if (score >= 70) return 'Near Mint';
    if (score >= 55) return 'Excellent';
    return 'Below Exc.';
  }

  function _setAccordionPill(id, score) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `accordion-pill ${_pillClass(score)}`;
    el.textContent = _pillLabel(score);
  }

  function _renderCenteringSection(front, back, score) {
    _setAccordionPill('pill-centering', score);
    const body = document.getElementById('body-centering');
    let html = '';
    if (front) {
      html += `<p><strong>Front</strong></p>
        <p>L/R: <strong>${front.lr_percent}</strong> &nbsp;|&nbsp; T/B: <strong>${front.tb_percent}</strong></p>
        <p class="text-muted mt-8">Left: ${front.left_px}px, Right: ${front.right_px}px, Top: ${front.top_px}px, Bottom: ${front.bottom_px}px</p>
        <p class="text-muted">PSA 10 requires ≤55/45 (front). BGS 10 requires ~50/50.</p>`;
    }
    if (back) {
      html += `<p class="mt-16"><strong>Back</strong></p>
        <p>L/R: <strong>${back.lr_percent}</strong> &nbsp;|&nbsp; T/B: <strong>${back.tb_percent}</strong></p>
        <p class="text-muted mt-8">PSA 10 back requires ≤75/25.</p>`;
    }
    if (!html) html = '<p class="text-muted">No centering data available.</p>';
    body.innerHTML = html;
  }

  function _renderCornersSection(corners, score) {
    _setAccordionPill('pill-corners', score);
    const body = document.getElementById('body-corners');
    if (!corners || corners.length === 0) {
      body.innerHTML = '<p class="text-muted">No corner data available.</p>';
      return;
    }
    let rows = corners.map((c) => {
      const color = c.corner_score >= 85 ? 'var(--pass)' : c.corner_score >= 65 ? 'var(--warn)' : 'var(--fail)';
      return `<tr>
        <td>${c.position.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
        <td style="color:${color};font-weight:600">${c.corner_score.toFixed(0)}/100</td>
        <td>${(c.whitening_ratio * 100).toFixed(1)}%</td>
        <td>${c.angle_deviation.toFixed(1)}°</td>
      </tr>`;
    }).join('');
    body.innerHTML = `<table class="detail-table">
      <thead><tr><th>Corner</th><th>Score</th><th>Whitening</th><th>Angle Dev.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="text-muted mt-8">Grade is determined by the worst-performing corner.</p>`;
  }

  function _renderEdgesSection(edges, score) {
    _setAccordionPill('pill-edges', score);
    const body = document.getElementById('body-edges');
    if (!edges || edges.length === 0) {
      body.innerHTML = '<p class="text-muted">No edge data available.</p>';
      return;
    }
    let rows = edges.map((e) => {
      const color = e.edge_score >= 85 ? 'var(--pass)' : e.edge_score >= 65 ? 'var(--warn)' : 'var(--fail)';
      return `<tr>
        <td>${e.position.charAt(0).toUpperCase() + e.position.slice(1)}</td>
        <td style="color:${color};font-weight:600">${e.edge_score.toFixed(0)}/100</td>
        <td>${e.chip_count}</td>
        <td>${(e.fray_intensity * 100).toFixed(1)}%</td>
        <td>${(e.whitening_ratio * 100).toFixed(1)}%</td>
      </tr>`;
    }).join('');
    body.innerHTML = `<table class="detail-table">
      <thead><tr><th>Edge</th><th>Score</th><th>Chips</th><th>Fraying</th><th>Ink Wear</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function _renderSurfaceSection(surface, score, reliefB64) {
    _setAccordionPill('pill-surface', score);
    const body = document.getElementById('body-surface');
    if (!surface) {
      body.innerHTML = '<p class="text-muted">No surface data available.</p>';
      return;
    }
    const holoHtml = surface.holo_detected
      ? `<span class="holo-badge">Holo Detected</span> &mdash; Holo damage: ${(surface.holo_damage_score * 100).toFixed(0)}%`
      : 'No holo layer detected';

    // Relief toggle button (only if relief image available)
    const reliefToggle = reliefB64
      ? `<button class="btn-sm relief-toggle-btn" style="margin-bottom:8px"
           onclick="(function(btn){
             var lb=document.createElement('div');
             lb.className='lightbox';
             lb.innerHTML='<img src=\\'data:image/jpeg;base64,${reliefB64}\\' alt=\\'Relief-Ansicht\\'>';
             lb.onclick=function(){lb.remove()};
             document.body.appendChild(lb);
           })(this)">Relief-Ansicht anzeigen</button>`
      : '';

    // Defect list
    let defectHtml = '';
    if (surface.defects && surface.defects.length > 0) {
      const typeLabel  = { scratch: 'Kratzer', dent: 'Delle' };
      const zoneLabel  = { corner_zone: 'Eckenzone', edge_zone: 'Kante', center: 'Mitte' };
      const shapeLabel = { linear: 'linear', punctual: 'punktuell', irregular: 'unregelmäßig' };

      const rows = surface.defects.map(d => {
        const sev = d.weighted_severity > 0.5 ? 'hoch' : d.weighted_severity > 0.2 ? 'mittel' : 'gering';
        const bold = d.weighted_severity > 0.5 ? 'font-weight:700' : '';
        const color = d.weighted_severity > 0.5 ? 'var(--fail)' : d.weighted_severity > 0.2 ? 'var(--warn)' : 'var(--pass)';
        return `<li style="${bold}">
          ${_esc(typeLabel[d.defect_type] || d.defect_type)}
          (${_esc(shapeLabel[d.shape_class] || d.shape_class)}, ${_esc(zoneLabel[d.zone] || d.zone)})
          &mdash; <span style="color:${color}">${sev}</span>
        </li>`;
      }).join('');
      defectHtml = `
        <p class="mt-8"><strong>Erkannte Defekte (${surface.defects.length}):</strong></p>
        <ul class="defect-list">${rows}</ul>
      `;
    }

    body.innerHTML = `
      ${reliefToggle}
      <p>${holoHtml}</p>
      <table class="detail-table mt-8">
        <tbody>
          <tr><td>Scratch pixels</td><td><strong>${surface.scratch_pixel_count.toLocaleString()}</strong> (${(surface.scratch_ratio * 100).toFixed(3)}% of surface)</td></tr>
          <tr><td>Dent regions</td><td><strong>${surface.dent_region_count}</strong></td></tr>
          <tr><td>SSIM quality</td><td><strong>${(surface.ssim_score * 100).toFixed(1)}%</strong></td></tr>
          <tr><td>Print defect score</td><td><strong>${(surface.print_defect_score * 100).toFixed(1)}%</strong></td></tr>
        </tbody>
      </table>
      ${defectHtml}
      <p class="text-muted mt-8">Surface analysis combines 5 techniques: CLAHE+Sobel (scratches), Laplacian (dents), FFT (print defects), LBP (holo damage), SSIM (overall quality).</p>
    `;
  }

  // ── Grading links ──────────────────────────────────────────────────────────

  function _renderGradingLinks() {
    const links = [
      { name: 'PSA',     url: 'https://www.psacard.com/submissions',  emoji: '🏆' },
      { name: 'Beckett', url: 'https://www.beckett.com/grading',       emoji: '📋' },
      { name: 'CGC',     url: 'https://www.cgccards.com/submit/',      emoji: '🔵' },
      { name: 'TAG',     url: 'https://taggrading.com/submit',         emoji: '🎯' },
    ];
    const wrap = document.getElementById('grading-links');
    wrap.innerHTML = links.map(({ name, url, emoji }) =>
      `<a class="grading-link" href="${url}" target="_blank" rel="noopener noreferrer">
        ${emoji} Submit to ${name}
      </a>`
    ).join('');
  }

  // ── Processing time ────────────────────────────────────────────────────────

  function _renderProcessingTime(ms) {
    const el = document.getElementById('processing-time');
    if (el) el.textContent = ms ? `Analysis completed in ${(ms / 1000).toFixed(1)}s` : '';
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  function _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, renderCardInfo };
})();
