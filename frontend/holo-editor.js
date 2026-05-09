/**
 * Interactive centering editor — v2.
 *
 *   • Front / Back are tabs (one big canvas at a time).
 *   • Bigger live readout strip above the stage.
 *   • Drag handles on outer (green) and inner (blue) edges, with magnifier.
 *   • Pixel grid toggle + reset.
 *   • Emits `editor:update` events so the surrounding UI can show a live grade.
 *
 * Public API:
 *   Viewer.render(result)   — called by ScreenResult after analysis completes.
 *   Viewer.getAdjusted()    — returns user-adjusted edges per side.
 */
const Viewer = (() => {
  const PAD = 28;
  const HANDLE_HIT = 10;
  const MAGNIFIER_SIZE = 220;
  const MAGNIFIER_ZOOM = 4;
  const GRID_STEP_IMG_PX = 10;

  const COLOUR_OUTER  = '#5be29a';
  const COLOUR_INNER  = '#5db4ff';
  const COLOUR_ACTIVE = '#ffd24a';

  const _editors = { front: null, back: null };
  let _host = null;
  let _activeSide = 'front';
  let _result = null;

  function render(result) {
    _result = result;
    const host = document.getElementById('editor-host');
    if (!host) return;
    _host = host;
    host.innerHTML = '';
    _activeSide = 'front';
    _build();
    _mountSide('front');
  }

  function getAdjusted() {
    return {
      front: _editors.front ? _editors.front.snapshot() : null,
      back:  _editors.back  ? _editors.back.snapshot()  : null,
    };
  }

  // Live score readout (last computed) per side, used to animate header grade.
  function lastScore(side = _activeSide) {
    const e = _editors[side];
    return e ? e.lastReading : null;
  }

  function _hasBack() {
    return !!(_result?.centering_back && _result?.clean_back_b64);
  }

  function _build() {
    const head = document.createElement('div');
    head.className = 'cedit-head';
    head.innerHTML = `
      <div class="cedit-tabs">
        <button type="button" class="cedit-tab active" data-side="front">Vorderseite</button>
        ${_hasBack() ? `<button type="button" class="cedit-tab" data-side="back">Rückseite</button>` : ''}
      </div>
      <div class="cedit-tools">
        <span class="cedit-legend">
          <span class="cedit-dot" style="background:${COLOUR_OUTER}"></span>Außenkante
          <span class="cedit-dot" style="background:${COLOUR_INNER}"></span>Innen-Rahmen
        </span>
        <label class="cedit-check"><input type="checkbox" class="cedit-grid-toggle"> Pixel-Raster</label>
        <label class="cedit-check"><input type="checkbox" class="cedit-radius-toggle" checked> Eckenradius</label>
        <button type="button" class="cedit-btn cedit-reset">Zurücksetzen</button>
      </div>
    `;
    _host.appendChild(head);

    const live = document.createElement('div');
    live.className = 'cedit-live';
    live.innerHTML = `
      <div class="cedit-live-cell">
        <div class="cedit-live-label">L/R</div>
        <div class="cedit-live-big" data-k="lr">–</div>
        <div class="cedit-live-sub"><span data-k="lmm">–</span> · <span data-k="rmm">–</span></div>
      </div>
      <div class="cedit-live-cell">
        <div class="cedit-live-label">O/U</div>
        <div class="cedit-live-big" data-k="tb">–</div>
        <div class="cedit-live-sub"><span data-k="tmm">–</span> · <span data-k="bmm">–</span></div>
      </div>
      <div class="cedit-live-cell cedit-live-score">
        <div class="cedit-live-label">Centering Score</div>
        <div class="cedit-live-big cedit-live-grade" data-k="score">–</div>
        <div class="cedit-live-sub" data-k="card">–</div>
      </div>
    `;
    _host.appendChild(live);
    _host._live = live;

    const stage = document.createElement('div');
    stage.className = 'cedit-stage';
    _host.appendChild(stage);
    _host._stage = stage;

    const hint = document.createElement('div');
    hint.className = 'cedit-hint';
    hint.textContent = 'Linien zum Innen-Rahmen ziehen (blau). Grüne Außenkanten korrigieren wenn die Detection daneben liegt. Lupe erscheint beim Drag.';
    _host.appendChild(hint);

    head.querySelectorAll('.cedit-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side;
        head.querySelectorAll('.cedit-tab').forEach(b => b.classList.toggle('active', b === btn));
        _mountSide(side);
      });
    });
    head.querySelector('.cedit-grid-toggle').addEventListener('change', e => {
      const ed = _editors[_activeSide]; if (ed) { ed.gridOn = e.target.checked; ed._draw(); }
    });
    head.querySelector('.cedit-radius-toggle').addEventListener('change', e => {
      const ed = _editors[_activeSide]; if (ed) { ed.radiusOn = e.target.checked; ed._draw(); }
    });
    head.querySelector('.cedit-reset').addEventListener('click', () => {
      const ed = _editors[_activeSide]; if (ed) { ed.lines = { ...ed.initial }; ed._draw(); }
    });
  }

  function _mountSide(side) {
    _activeSide = side;
    const stage = _host._stage;
    stage.innerHTML = '';

    const centering = side === 'front' ? _result.centering_front : _result.centering_back;
    const clean     = side === 'front' ? _result.clean_front_b64 : _result.clean_back_b64;
    const marginPx  = _result.card_margin_px || 0;
    const cardW     = _result.card_w_px || 0;
    const cardH     = _result.card_h_px || 0;

    if (!centering || !clean) {
      stage.innerHTML = `<div class="cedit-empty">Keine Daten für ${side === 'front' ? 'Vorderseite' : 'Rückseite'}.</div>`;
      _editors[side] = null;
      return;
    }

    const cornersDetail = (side === 'front') ? (_result.corners || []) : [];

    const img = new Image();
    img.onload = () => {
      _editors[side] = new CenteringEditor(stage, _host._live, img, {
        centering, marginPx, cardW, cardH, side, cornersDetail,
      });
    };
    img.src = `data:image/jpeg;base64,${clean}`;
  }

  // ─── CenteringEditor ────────────────────────────────────────────────────

  class CenteringEditor {
    constructor(stage, liveEl, img, opts) {
      this.stage = stage;
      this.liveEl = liveEl;
      this.img = img;
      this.imgW = img.naturalWidth;
      this.imgH = img.naturalHeight;
      this.side = opts.side;
      this.isBack = (opts.side === 'back');

      const m = opts.marginPx || 0;
      const cw = opts.cardW || (this.imgW - 2 * m);
      const ch = opts.cardH || (this.imgH - 2 * m);

      this.lines = {
        outerL: m,
        outerR: m + cw,
        outerT: m,
        outerB: m + ch,
        innerL: m + (opts.centering.left_px   | 0),
        innerR: m + cw - (opts.centering.right_px  | 0),
        innerT: m + (opts.centering.top_px    | 0),
        innerB: m + ch - (opts.centering.bottom_px | 0),
      };
      this.initial = { ...this.lines };

      this.activeId = null;
      this.gridOn = false;
      this.radiusOn = true;
      this.cornersDetail = opts.cornersDetail || [];
      this.lastReading = null;

      this._build();
      this._draw();
    }

    snapshot() {
      const cardW = this.lines.outerR - this.lines.outerL;
      const cardH = this.lines.outerB - this.lines.outerT;
      return {
        outer:  { l: this.lines.outerL, r: this.lines.outerR,
                  t: this.lines.outerT, b: this.lines.outerB },
        inner:  { l: this.lines.innerL, r: this.lines.innerR,
                  t: this.lines.innerT, b: this.lines.innerB },
        cardW, cardH,
      };
    }

    _build() {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'cedit-canvas';
      this.stage.appendChild(this.canvas);

      this.magnifier = document.createElement('canvas');
      this.magnifier.className = 'cedit-magnifier hidden';
      this.magnifier.width = MAGNIFIER_SIZE;
      this.magnifier.height = MAGNIFIER_SIZE;
      this.stage.appendChild(this.magnifier);

      this.canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
      this.canvas.addEventListener('pointermove', e => this._onPointerMove(e));
      this.canvas.addEventListener('pointerup',   e => this._onPointerUp(e));
      this.canvas.addEventListener('pointercancel', e => this._onPointerUp(e));

      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(this.stage);
      this._onWinResize = () => this._fit();
      window.addEventListener('resize', this._onWinResize);
      this._fit();
    }

    _fit() {
      const stageW = this.stage.clientWidth || 600;
      // Cap stage height so the card always fits in viewport without scrolling.
      // Reserve ~340 px for topbar + page head + live strip + paddings.
      const maxStageH = Math.max(360, Math.min(window.innerHeight - 340, 680));
      const innerWmax = Math.max(140, stageW - 2 * PAD);
      const innerHmax = Math.max(220, maxStageH - 2 * PAD);
      const scaleByW = innerWmax / this.imgW;
      const scaleByH = innerHmax / this.imgH;
      this.scale = Math.min(scaleByW, scaleByH);
      const innerW = this.imgW * this.scale;
      const innerH = this.imgH * this.scale;
      const cssW = innerW + 2 * PAD;
      const cssH = innerH + 2 * PAD;
      this.canvas.style.width  = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;
      // Center horizontally when canvas is narrower than stage.
      this.canvas.style.marginLeft = 'auto';
      this.canvas.style.marginRight = 'auto';
      this.canvas.style.display = 'block';
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width  = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      this._dpr = dpr;
      this._draw();
    }

    _toCanvasX(imgX) { return PAD + imgX * this.scale; }
    _toCanvasY(imgY) { return PAD + imgY * this.scale; }
    _toImgX(cssX)    { return (cssX - PAD) / this.scale; }
    _toImgY(cssY)    { return (cssY - PAD) / this.scale; }

    _draw() {
      const ctx = this.canvas.getContext('2d');
      const dpr = this._dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cssW = this.canvas.width / dpr;
      const cssH = this.canvas.height / dpr;

      ctx.fillStyle = '#0d1015';
      ctx.fillRect(0, 0, cssW, cssH);

      const dx = PAD, dy = PAD;
      const dw = this.imgW * this.scale, dh = this.imgH * this.scale;
      ctx.drawImage(this.img, dx, dy, dw, dh);

      // soft outline around image (helps on dark sleeves)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);

      if (this.gridOn) this._drawGrid(ctx, dx, dy, dw, dh);
      if (this.radiusOn) this._drawCornerRadii(ctx);

      // Outer (green)
      this._vline(ctx, this.lines.outerL, dy, dh, this._activeColour('outerL', COLOUR_OUTER));
      this._vline(ctx, this.lines.outerR, dy, dh, this._activeColour('outerR', COLOUR_OUTER));
      this._hline(ctx, this.lines.outerT, dx, dw, this._activeColour('outerT', COLOUR_OUTER));
      this._hline(ctx, this.lines.outerB, dx, dw, this._activeColour('outerB', COLOUR_OUTER));

      // Inner (blue)
      this._vline(ctx, this.lines.innerL, dy, dh, this._activeColour('innerL', COLOUR_INNER));
      this._vline(ctx, this.lines.innerR, dy, dh, this._activeColour('innerR', COLOUR_INNER));
      this._hline(ctx, this.lines.innerT, dx, dw, this._activeColour('innerT', COLOUR_INNER));
      this._hline(ctx, this.lines.innerB, dx, dw, this._activeColour('innerB', COLOUR_INNER));

      const midY = (this._toCanvasY(this.lines.outerT) + this._toCanvasY(this.lines.outerB)) / 2;
      const midX = (this._toCanvasX(this.lines.outerL) + this._toCanvasX(this.lines.outerR)) / 2;
      const offset = 16;
      this._handle(ctx, this._toCanvasX(this.lines.outerL), midY - offset, 'outerL', COLOUR_OUTER);
      this._handle(ctx, this._toCanvasX(this.lines.outerR), midY - offset, 'outerR', COLOUR_OUTER);
      this._handle(ctx, midX - offset, this._toCanvasY(this.lines.outerT), 'outerT', COLOUR_OUTER);
      this._handle(ctx, midX - offset, this._toCanvasY(this.lines.outerB), 'outerB', COLOUR_OUTER);

      this._handle(ctx, this._toCanvasX(this.lines.innerL), midY + offset, 'innerL', COLOUR_INNER);
      this._handle(ctx, this._toCanvasX(this.lines.innerR), midY + offset, 'innerR', COLOUR_INNER);
      this._handle(ctx, midX + offset, this._toCanvasY(this.lines.innerT), 'innerT', COLOUR_INNER);
      this._handle(ctx, midX + offset, this._toCanvasY(this.lines.innerB), 'innerB', COLOUR_INNER);

      this._updateLive();
    }

    _activeColour(id, dflt) { return this.activeId === id ? COLOUR_ACTIVE : dflt; }

    _vline(ctx, imgX, dy, dh, colour) {
      const x = this._toCanvasX(imgX);
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = colour;
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); ctx.stroke();
      ctx.restore();
    }
    _hline(ctx, imgY, dx, dw, colour) {
      const y = this._toCanvasY(imgY);
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = colour;
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); ctx.stroke();
      ctx.restore();
    }
    _handle(ctx, x, y, id, dflt) {
      const active = this.activeId === id;
      ctx.fillStyle = active ? COLOUR_ACTIVE : dflt;
      ctx.strokeStyle = '#0a0d12'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    _drawCornerRadii(ctx) {
      // Pokemon cards have ~3.0 mm corner radius. Card width = 63 mm.
      const cardW = this.lines.outerR - this.lines.outerL;
      const cardH = this.lines.outerB - this.lines.outerT;
      if (cardW <= 0 || cardH <= 0) return;
      const ppm = (cardW / 63 + cardH / 88) / 2;
      const expectedR = ppm * 3.0;             // image px
      const rCss = expectedR * this.scale;     // canvas px

      const cornersByPos = {};
      for (const c of (this.cornersDetail || [])) cornersByPos[c.position] = c;

      const corners = [
        { pos: 'top_left',     cx: this._toCanvasX(this.lines.outerL), cy: this._toCanvasY(this.lines.outerT), a0: Math.PI,           a1: 1.5 * Math.PI },
        { pos: 'top_right',    cx: this._toCanvasX(this.lines.outerR), cy: this._toCanvasY(this.lines.outerT), a0: 1.5 * Math.PI,     a1: 2 * Math.PI   },
        { pos: 'bottom_right', cx: this._toCanvasX(this.lines.outerR), cy: this._toCanvasY(this.lines.outerB), a0: 0,                 a1: 0.5 * Math.PI },
        { pos: 'bottom_left',  cx: this._toCanvasX(this.lines.outerL), cy: this._toCanvasY(this.lines.outerB), a0: 0.5 * Math.PI,     a1: Math.PI       },
      ];

      ctx.save();
      for (const c of corners) {
        const det = cornersByPos[c.pos];
        const matchPct = det && det.radius_match != null ? det.radius_match : null;

        // Expected radius (white dashed)
        const ex = c.cx + Math.cos((c.a0 + c.a1) / 2) * 0; // pivot is at outer corner
        // The arc center sits offset diagonally inward from the corner by exactly r.
        const dxs = (c.pos.includes('right') ? -1 : 1);
        const dys = (c.pos.includes('bottom') ? -1 : 1);
        const cxArc = c.cx + dxs * rCss;
        const cyArc = c.cy + dys * rCss;

        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.arc(cxArc, cyArc, rCss, c.a0, c.a1);
        ctx.stroke();

        // Measured radius arc (mint/amber/rose by match %)
        if (det && det.radius_mm) {
          const measuredR = det.radius_mm * ppm * this.scale;
          const cls = matchPct == null ? '#ffffff' : matchPct >= 80 ? '#5be29a' : matchPct >= 60 ? '#ffd24a' : '#ff8f8f';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.strokeStyle = cls;
          ctx.beginPath();
          ctx.arc(cxArc, cyArc, measuredR, c.a0, c.a1);
          ctx.stroke();
        }

        // Match-% label
        if (det && matchPct != null) {
          const lblR = rCss + 14;
          const lblA = (c.a0 + c.a1) / 2;
          const lx = cxArc + Math.cos(lblA) * lblR;
          const ly = cyArc + Math.sin(lblA) * lblR;
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.fillStyle = matchPct >= 80 ? '#5be29a' : matchPct >= 60 ? '#ffd24a' : '#ff8f8f';
          ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(matchPct)}%`, lx, ly);
        }
      }
      ctx.restore();
      ctx.setLineDash([]);
    }

    _drawGrid(ctx, dx, dy, dw, dh) {
      const step = GRID_STEP_IMG_PX * this.scale;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      for (let x = step; x < dw; x += step) {
        ctx.moveTo(dx + x + 0.5, dy);
        ctx.lineTo(dx + x + 0.5, dy + dh);
      }
      for (let y = step; y < dh; y += step) {
        ctx.moveTo(dx,        dy + y + 0.5);
        ctx.lineTo(dx + dw,   dy + y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    _hitTest(cssX, cssY) {
      const order = ['innerL', 'innerR', 'innerT', 'innerB',
                     'outerL', 'outerR', 'outerT', 'outerB'];
      for (const id of order) {
        const v = this.lines[id];
        if (id.endsWith('L') || id.endsWith('R')) {
          if (Math.abs(cssX - this._toCanvasX(v)) <= HANDLE_HIT) return id;
        } else {
          if (Math.abs(cssY - this._toCanvasY(v)) <= HANDLE_HIT) return id;
        }
      }
      return null;
    }

    _eventToCss(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _onPointerDown(e) {
      const { x, y } = this._eventToCss(e);
      const hit = this._hitTest(x, y);
      if (!hit) return;
      this.activeId = hit;
      this.canvas.setPointerCapture(e.pointerId);
      this._updateFromPointer(x, y);
      this._showMagnifier(x, y);
      this._draw();
      e.preventDefault();
    }

    _onPointerMove(e) {
      const { x, y } = this._eventToCss(e);
      if (this.activeId) {
        this._updateFromPointer(x, y);
        this._showMagnifier(x, y);
        this._draw();
      } else {
        const hit = this._hitTest(x, y);
        this.canvas.style.cursor = !hit ? 'default'
          : (hit.endsWith('L') || hit.endsWith('R')) ? 'ew-resize' : 'ns-resize';
      }
    }

    _onPointerUp(e) {
      if (!this.activeId) return;
      this.canvas.releasePointerCapture?.(e.pointerId);
      this.activeId = null;
      this._hideMagnifier();
      this._draw();
    }

    _updateFromPointer(cssX, cssY) {
      const id = this.activeId;
      const lim = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
      switch (id) {
        case 'outerL': this.lines.outerL = lim(0, this.lines.outerR - 4, Math.round(this._toImgX(cssX)));
                       this.lines.innerL = Math.max(this.lines.innerL, this.lines.outerL); break;
        case 'outerR': this.lines.outerR = lim(this.lines.outerL + 4, this.imgW, Math.round(this._toImgX(cssX)));
                       this.lines.innerR = Math.min(this.lines.innerR, this.lines.outerR); break;
        case 'outerT': this.lines.outerT = lim(0, this.lines.outerB - 4, Math.round(this._toImgY(cssY)));
                       this.lines.innerT = Math.max(this.lines.innerT, this.lines.outerT); break;
        case 'outerB': this.lines.outerB = lim(this.lines.outerT + 4, this.imgH, Math.round(this._toImgY(cssY)));
                       this.lines.innerB = Math.min(this.lines.innerB, this.lines.outerB); break;
        case 'innerL': this.lines.innerL = lim(this.lines.outerL, this.lines.innerR - 2, Math.round(this._toImgX(cssX))); break;
        case 'innerR': this.lines.innerR = lim(this.lines.innerL + 2, this.lines.outerR, Math.round(this._toImgX(cssX))); break;
        case 'innerT': this.lines.innerT = lim(this.lines.outerT, this.lines.innerB - 2, Math.round(this._toImgY(cssY))); break;
        case 'innerB': this.lines.innerB = lim(this.lines.innerT + 2, this.lines.outerB, Math.round(this._toImgY(cssY))); break;
      }
    }

    _showMagnifier(cssX, cssY) {
      const imgX = this._toImgX(cssX);
      const imgY = this._toImgY(cssY);
      const sampleSize = MAGNIFIER_SIZE / MAGNIFIER_ZOOM / this.scale;
      const sx = Math.max(0, Math.min(this.imgW - sampleSize, imgX - sampleSize / 2));
      const sy = Math.max(0, Math.min(this.imgH - sampleSize, imgY - sampleSize / 2));

      const m = this.magnifier.getContext('2d');
      m.imageSmoothingEnabled = false;
      m.fillStyle = '#0d1015';
      m.fillRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
      m.drawImage(this.img,
        sx, sy, sampleSize, sampleSize,
        0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);

      const px = (v) => (v - sx) * (MAGNIFIER_SIZE / sampleSize);
      const py = (v) => (v - sy) * (MAGNIFIER_SIZE / sampleSize);
      const id = this.activeId;
      const isOuter = id?.startsWith('outer');
      m.strokeStyle = isOuter ? COLOUR_OUTER : COLOUR_INNER;
      m.lineWidth = 2;
      m.beginPath();
      if (id?.endsWith('L') || id?.endsWith('R')) {
        const x = px(this.lines[id]); m.moveTo(x, 0); m.lineTo(x, MAGNIFIER_SIZE);
      } else if (id?.endsWith('T') || id?.endsWith('B')) {
        const y = py(this.lines[id]); m.moveTo(0, y); m.lineTo(MAGNIFIER_SIZE, y);
      }
      m.stroke();

      m.strokeStyle = 'rgba(255,255,255,0.30)';
      m.lineWidth = 1;
      m.beginPath();
      m.moveTo(MAGNIFIER_SIZE / 2, 0); m.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
      m.moveTo(0, MAGNIFIER_SIZE / 2); m.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
      m.stroke();

      const stageRect = this.stage.getBoundingClientRect();
      const placeRight = cssX < stageRect.width / 2;
      this.magnifier.style.left  = placeRight ? 'auto' : '14px';
      this.magnifier.style.right = placeRight ? '14px' : 'auto';
      this.magnifier.style.top   = '14px';
      this.magnifier.classList.remove('hidden');
    }

    _hideMagnifier() { this.magnifier.classList.add('hidden'); }

    _updateLive() {
      const L = this.lines.innerL - this.lines.outerL;
      const R = this.lines.outerR - this.lines.innerR;
      const T = this.lines.innerT - this.lines.outerT;
      const B = this.lines.outerB - this.lines.innerB;
      const cardW = this.lines.outerR - this.lines.outerL;
      const cardH = this.lines.outerB - this.lines.outerT;
      const ppm = (cardW / 63 + cardH / 88) / 2;

      const lr = _ratio(L, R);
      const tb = _ratio(T, B);
      const score = _scoreFromRatios(lr.r, tb.r, this.isBack);

      const fmt = (px) => (px / ppm).toFixed(2);
      const set = (k, v) => { const el = this.liveEl?.querySelector(`[data-k="${k}"]`); if (el) el.textContent = v; };

      set('lr', `${lr.bigPct}/${lr.smallPct}`);
      set('tb', `${tb.bigPct}/${tb.smallPct}`);
      set('score', score.toFixed(0));
      set('lmm', `L ${fmt(L)}mm`);
      set('rmm', `R ${fmt(R)}mm`);
      set('tmm', `O ${fmt(T)}mm`);
      set('bmm', `U ${fmt(B)}mm`);
      set('card', `Karte: ${(cardW/ppm).toFixed(1)}×${(cardH/ppm).toFixed(1)} mm`);

      // colour the score chip green/amber/rose
      const grade = this.liveEl?.querySelector('.cedit-live-grade');
      if (grade) {
        grade.classList.remove('mint', 'amber', 'rose');
        grade.classList.add(score >= 80 ? 'mint' : score >= 60 ? 'amber' : 'rose');
      }

      const reading = { side: this.side, score, lr_pct: `${lr.bigPct}/${lr.smallPct}`, tb_pct: `${tb.bigPct}/${tb.smallPct}` };
      this.lastReading = reading;
      window.dispatchEvent(new CustomEvent('cedit:update', { detail: reading }));
    }
  }

  function _ratio(a, b) {
    const total = Math.max(a + b, 1);
    const big = Math.max(a, b), small = Math.min(a, b);
    return { r: big / total, bigPct: Math.round(big / total * 100), smallPct: Math.round(small / total * 100) };
  }

  function _scoreFromRatios(lr, tb, isBack) {
    const worse = Math.max(lr, tb);
    const anchors = isBack
      ? [[0.50,100],[0.60,92],[0.70,80],[0.75,70],[0.80,55],[0.90,25],[1.00,0]]
      : [[0.50,100],[0.55,90],[0.60,75],[0.65,60],[0.70,45],[0.80,25],[1.00,0]];
    if (worse <= anchors[0][0]) return anchors[0][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [x0,y0] = anchors[i], [x1,y1] = anchors[i+1];
      if (worse <= x1) return y0 + (worse - x0) / (x1 - x0) * (y1 - y0);
    }
    return anchors[anchors.length - 1][1];
  }

  return { render, getAdjusted, lastScore };
})();

window.Viewer = Viewer;
