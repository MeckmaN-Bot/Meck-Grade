/**
 * Renders grade badges, subgrade grid, subscore bars, accordion, warnings, links.
 */
const Grades = (() => {

  function render(result) {
    _renderGradeSummary(result.grades);
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
    _renderSurfaceSection(result.surface, result.subgrades.surface);
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

  function _renderSurfaceSection(surface, score) {
    _setAccordionPill('pill-surface', score);
    const body = document.getElementById('body-surface');
    if (!surface) {
      body.innerHTML = '<p class="text-muted">No surface data available.</p>';
      return;
    }
    const holoHtml = surface.holo_detected
      ? `<span class="holo-badge">Holo Detected</span> &mdash; Holo damage: ${(surface.holo_damage_score * 100).toFixed(0)}%`
      : 'No holo layer detected';

    body.innerHTML = `
      <p>${holoHtml}</p>
      <table class="detail-table mt-8">
        <tbody>
          <tr><td>Scratch pixels</td><td><strong>${surface.scratch_pixel_count.toLocaleString()}</strong> (${(surface.scratch_ratio * 100).toFixed(3)}% of surface)</td></tr>
          <tr><td>Dent regions</td><td><strong>${surface.dent_region_count}</strong></td></tr>
          <tr><td>SSIM quality</td><td><strong>${(surface.ssim_score * 100).toFixed(1)}%</strong></td></tr>
          <tr><td>Print defect score</td><td><strong>${(surface.print_defect_score * 100).toFixed(1)}%</strong></td></tr>
        </tbody>
      </table>
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

  return { render };
})();
