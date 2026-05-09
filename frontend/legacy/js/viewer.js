/**
 * Interactive centering editor.
 *
 * Replaces the old before/after slider.  The host shows the warped card
 * surrounded by `card_margin_px` of real scan content so the user can
 * verify and adjust BOTH:
 *   • the 4 outer card edges  (green)  — fixes mis-detected card corners
 *   • the 4 inner-frame lines (blue)   — fine-tunes centering measurement
 *
 * A magnifier inset shows a 4× zoom of the dragged area for sub-pixel work.
 * A pixel-grid toggle overlays a 10-px grid in image-pixel space.
 *
 * Public API:
 *   Viewer.render(result)   — called by grades.js after analysis completes.
 *   Viewer.getAdjusted()    — returns user-adjusted edges per side.
 */
const Viewer = (() => {
  const PAD = 24;                   // canvas padding (CSS px) outside the image
  const HANDLE_HIT = 8;             // hit radius around line for drag-pickup
  const MAGNIFIER_SIZE = 220;
  const MAGNIFIER_ZOOM = 4;
  const GRID_STEP_IMG_PX = 10;      // pixel-grid cell (image pixels)

  const COLOUR_OUTER = '#3ddc84';
  const COLOUR_INNER = '#3aa6ff';
  const COLOUR_ACTIVE = '#ffd24a';

  const _editors = { front: null, back: null };

  function render(result) {
    _renderSide(
      'front',
      result.centering_front,
      result.clean_front_b64,
      result.card_margin_px || 0,
      result.card_w_px || 0,
      result.card_h_px || 0,
    );
    _renderSide(
      'back',
      result.centering_back,
      result.clean_back_b64,
      result.card_margin_px || 0,
      result.card_w_px || 0,
      result.card_h_px || 0,
    );
  }

  function getAdjusted() {
    return {
      front: _editors.front ? _editors.front.snapshot() : null,
      back:  _editors.back  ? _editors.back.snapshot()  : null,
    };
  }

  function _renderSide(side, centering, cleanB64, marginPx, cardW, cardH) {
    const host = document.getElementById(`editor-${side}`);
    if (!host) return;
    host.innerHTML = '';
    if (!centering || !cleanB64) {
      host.classList.add('hidden');
      _editors[side] = null;
      return;
    }
    host.classList.remove('hidden');

    const img = new Image();
    img.onload = () => {
      _editors[side] = new CenteringEditor(host, img, {
        centering, marginPx, cardW, cardH, side,
      });
    };
    img.src = `data:image/jpeg;base64,${cleanB64}`;
  }

  // ─── CenteringEditor ────────────────────────────────────────────────────

  class CenteringEditor {
    constructor(host, img, opts) {
      this.host = host;
      this.img = img;
      this.imgW = img.naturalWidth;
      this.imgH = img.naturalHeight;
      this.side = opts.side;
      this.isBack = (opts.side === 'back');

      // Geometry: card sits at (margin, margin) → (margin+cardW, margin+cardH)
      // inside the image.  Fall back to "no margin" if the server didn't
      // report one (older response shape).
      const m = opts.marginPx || 0;
      const cw = opts.cardW || (this.imgW - 2 * m);
      const ch = opts.cardH || (this.imgH - 2 * m);

      // Lines live in IMAGE-PIXEL space (not card-pixel — that simplifies
      // mixing outer + inner under a single coordinate system).
      this.lines = {
        // Outer card edges
        outerL: m,
        outerR: m + cw,
        outerT: m,
        outerB: m + ch,
        // Inner-frame lines (server reported relative to card origin → +m)
        innerL: m + (opts.centering.left_px   | 0),
        innerR: m + cw - (opts.centering.right_px  | 0),
        innerT: m + (opts.centering.top_px    | 0),
        innerB: m + ch - (opts.centering.bottom_px | 0),
      };
      this.initial = { ...this.lines };

      this.activeId = null;
      this.gridOn = false;

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

    // ── DOM scaffolding ──────────────────────────────────────────────────

    _build() {
      const head = document.createElement('div');
      head.className = 'editor-head';
      head.innerHTML = `
        <span class="editor-title">${this.side === 'front' ? 'Vorderseite' : 'Rückseite'}</span>
        <div class="editor-tools">
          <span class="editor-legend">
            <span class="editor-legend-dot" style="background:${COLOUR_OUTER}"></span>Außenkante
            <span class="editor-legend-dot" style="background:${COLOUR_INNER};margin-left:10px"></span>Innen-Rahmen
          </span>
          <label class="editor-check">
            <input type="checkbox" class="editor-grid-toggle"> Pixel-Raster
          </label>
          <button type="button" class="btn-sm editor-reset">Zurücksetzen</button>
        </div>
      `;
      this.host.appendChild(head);

      const stage = document.createElement('div');
      stage.className = 'editor-stage';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'editor-canvas';
      stage.appendChild(this.canvas);
      this.magnifier = document.createElement('canvas');
      this.magnifier.className = 'editor-magnifier hidden';
      this.magnifier.width = MAGNIFIER_SIZE;
      this.magnifier.height = MAGNIFIER_SIZE;
      stage.appendChild(this.magnifier);
      this.host.appendChild(stage);
      this.stage = stage;

      const live = document.createElement('div');
      live.className = 'editor-live';
      live.innerHTML = `
        <div class="editor-live-row"><span class="editor-live-label">L/R</span><strong class="editor-live-lr">–</strong></div>
        <div class="editor-live-row"><span class="editor-live-label">O/U</span><strong class="editor-live-tb">–</strong></div>
        <div class="editor-live-row"><span class="editor-live-label">Score</span><strong class="editor-live-score">–</strong></div>
        <div class="editor-live-mm">
          <span>L:<b class="editor-mm-l">–</b></span>
          <span>R:<b class="editor-mm-r">–</b></span>
          <span>O:<b class="editor-mm-t">–</b></span>
          <span>U:<b class="editor-mm-b">–</b></span>
          <span class="editor-live-card">Karte:<b class="editor-mm-card">–</b></span>
        </div>
      `;
      this.host.appendChild(live);

      head.querySelector('.editor-grid-toggle').addEventListener('change', e => {
        this.gridOn = e.target.checked; this._draw();
      });
      head.querySelector('.editor-reset').addEventListener('click', () => {
        this.lines = { ...this.initial }; this._draw();
      });

      this.canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
      this.canvas.addEventListener('pointermove', e => this._onPointerMove(e));
      this.canvas.addEventListener('pointerup',   e => this._onPointerUp(e));
      this.canvas.addEventListener('pointercancel', e => this._onPointerUp(e));

      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(stage);
      this._fit();
    }

    // ── Layout ───────────────────────────────────────────────────────────

    _fit() {
      const stageW = this.stage.clientWidth || 600;
      const innerW = Math.max(120, stageW - 2 * PAD);
      this.scale = innerW / this.imgW;
      const innerH = this.imgH * this.scale;
      const cssW = innerW + 2 * PAD;
      const cssH = innerH + 2 * PAD;
      this.canvas.style.width  = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;
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

    // ── Drawing ──────────────────────────────────────────────────────────

    _draw() {
      const ctx = this.canvas.getContext('2d');
      const dpr = this._dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cssW = this.canvas.width / dpr;
      const cssH = this.canvas.height / dpr;

      ctx.fillStyle = '#1a1d22';
      ctx.fillRect(0, 0, cssW, cssH);

      const dx = PAD, dy = PAD;
      const dw = this.imgW * this.scale, dh = this.imgH * this.scale;
      ctx.drawImage(this.img, dx, dy, dw, dh);
      ctx.strokeStyle = '#5b6470';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);

      if (this.gridOn) this._drawGrid(ctx, dx, dy, dw, dh);

      // Outer lines (green / yellow when active)
      this._vline(ctx, this.lines.outerL, dy, dh, this._activeColour('outerL', COLOUR_OUTER));
      this._vline(ctx, this.lines.outerR, dy, dh, this._activeColour('outerR', COLOUR_OUTER));
      this._hline(ctx, this.lines.outerT, dx, dw, this._activeColour('outerT', COLOUR_OUTER));
      this._hline(ctx, this.lines.outerB, dx, dw, this._activeColour('outerB', COLOUR_OUTER));

      // Inner lines (blue / yellow)
      this._vline(ctx, this.lines.innerL, dy, dh, this._activeColour('innerL', COLOUR_INNER));
      this._vline(ctx, this.lines.innerR, dy, dh, this._activeColour('innerR', COLOUR_INNER));
      this._hline(ctx, this.lines.innerT, dx, dw, this._activeColour('innerT', COLOUR_INNER));
      this._hline(ctx, this.lines.innerB, dx, dw, this._activeColour('innerB', COLOUR_INNER));

      // Drag handles
      const midY = (this._toCanvasY(this.lines.outerT) + this._toCanvasY(this.lines.outerB)) / 2;
      const midX = (this._toCanvasX(this.lines.outerL) + this._toCanvasX(this.lines.outerR)) / 2;

      // Outer handles offset slightly outside the card so they don't sit on
      // top of the inner handles when an axis is collapsed.
      const offset = 14;
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
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 2;
      ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); ctx.stroke();
      ctx.restore();
    }
    _hline(ctx, imgY, dx, dw, colour) {
      const y = this._toCanvasY(imgY);
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = colour;
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 2;
      ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); ctx.stroke();
      ctx.restore();
    }
    _handle(ctx, x, y, id, dflt) {
      const active = this.activeId === id;
      ctx.fillStyle = active ? COLOUR_ACTIVE : dflt;
      ctx.strokeStyle = '#0e1116'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    _drawGrid(ctx, dx, dy, dw, dh) {
      const step = GRID_STEP_IMG_PX * this.scale;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
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

    // ── Hit testing ──────────────────────────────────────────────────────

    _hitTest(cssX, cssY) {
      // Inner takes priority when overlapping (more common fine-tune target).
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

    // ── Magnifier ────────────────────────────────────────────────────────

    _showMagnifier(cssX, cssY) {
      const imgX = this._toImgX(cssX);
      const imgY = this._toImgY(cssY);
      const sampleSize = MAGNIFIER_SIZE / MAGNIFIER_ZOOM / this.scale;
      const sx = Math.max(0, Math.min(this.imgW - sampleSize, imgX - sampleSize / 2));
      const sy = Math.max(0, Math.min(this.imgH - sampleSize, imgY - sampleSize / 2));

      const m = this.magnifier.getContext('2d');
      m.imageSmoothingEnabled = false;
      m.fillStyle = '#1a1d22';
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

      // Crosshair
      m.strokeStyle = 'rgba(255,255,255,0.30)';
      m.lineWidth = 1;
      m.beginPath();
      m.moveTo(MAGNIFIER_SIZE / 2, 0); m.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
      m.moveTo(0, MAGNIFIER_SIZE / 2); m.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
      m.stroke();

      const stageRect = this.stage.getBoundingClientRect();
      const placeRight = cssX < stageRect.width / 2;
      this.magnifier.style.left  = placeRight ? 'auto' : '12px';
      this.magnifier.style.right = placeRight ? '12px' : 'auto';
      this.magnifier.style.top   = '12px';
      this.magnifier.classList.remove('hidden');
    }

    _hideMagnifier() { this.magnifier.classList.add('hidden'); }

    // ── Live readout ─────────────────────────────────────────────────────

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

      const set = (cls, val) => { const el = this.host.querySelector(cls); if (el) el.textContent = val; };
      const fmt = (px) => (px / ppm).toFixed(2) + ' mm';
      set('.editor-live-lr', `${lr.bigPct}/${lr.smallPct}`);
      set('.editor-live-tb', `${tb.bigPct}/${tb.smallPct}`);
      set('.editor-live-score', score.toFixed(1));
      set('.editor-mm-l', fmt(L));
      set('.editor-mm-r', fmt(R));
      set('.editor-mm-t', fmt(T));
      set('.editor-mm-b', fmt(B));
      set('.editor-mm-card', `${(cardW / ppm).toFixed(1)}×${(cardH / ppm).toFixed(1)} mm`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  return { render, getAdjusted };
})();
