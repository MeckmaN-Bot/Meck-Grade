/**
 * Card image viewer with annotation comparison slider and lightbox zoom.
 * When both annotated and clean images are available, renders a drag-to-compare
 * slider (clip-path on the annotated layer). Falls back to a plain image when
 * only one version is present.
 *
 * Border lines overlay: after render(), call setBorderData(centeringFront, centeringBack)
 * to draw the detected centering borders as colored lines on a canvas layer.
 */
const Viewer = (() => {
  let _data = {};
  // canvas references keyed by side for the border overlay
  let _canvases = { front: null, back: null };
  let _centering = { front: null, back: null };
  let _bordersVisible = false;

  function render(result) {
    _data = result;
    _canvases = { front: null, back: null };
    _centering = { front: null, back: null };
    _bordersVisible = false;
    _renderSide('front');
    _renderSide('back');
  }

  function setBorderData(centeringFront, centeringBack) {
    _centering.front = centeringFront || null;
    _centering.back  = centeringBack  || null;
    // Re-attach canvas to existing viewer if already rendered
    ['front', 'back'].forEach(side => {
      const viewer = _getViewer(side);
      if (viewer && _centering[side]) {
        _attachBorderCanvas(viewer, side);
      }
    });
    _updateToggleButton();
  }

  function _getViewer(side) {
    return document.querySelector(`.card-viewer:has(#viewer-${side}-img)`) ||
           document.getElementById(`viewer-${side}-img`)?.closest('.card-viewer') ||
           document.querySelector(`.card-viewer-content`)?.closest('.card-viewer');
  }

  function _renderSide(side) {
    const viewer = document.querySelector(`.card-viewer:has(#viewer-${side}-img)`) ||
                   document.getElementById(`viewer-${side}-img`)?.closest('.card-viewer');
    if (!viewer) return;

    const annotatedKey = `annotated_${side}_b64`;
    const cleanKey     = `clean_${side}_b64`;
    const hasAnnotated = !!_data[annotatedKey];
    const hasClean     = !!_data[cleanKey];

    if (!hasAnnotated && !hasClean) {
      viewer.classList.add('hidden');
      return;
    }
    viewer.classList.remove('hidden');

    // Replace legacy <img> + toggle-button layout with either a slider or plain image
    const labelDiv = viewer.querySelector('.card-viewer-label');
    if (labelDiv) {
      const sideLabel = labelDiv.querySelector('span:first-child');
      labelDiv.innerHTML = '';
      if (sideLabel) labelDiv.appendChild(sideLabel);

      // Add border-lines toggle button (only for front side, one button controls both)
      if (side === 'front') {
        const btn = document.createElement('button');
        btn.id = 'btn-border-toggle';
        btn.className = 'btn-sm';
        btn.textContent = 'Ränder anzeigen';
        btn.style.cssText = 'margin-left:auto; font-size:11px; padding:2px 8px; cursor:pointer;';
        btn.onclick = _toggleBorders;
        labelDiv.style.display = 'flex';
        labelDiv.style.alignItems = 'center';
        labelDiv.appendChild(btn);
      }
    }

    // Remove old image and inject new viewer content
    const oldImg = document.getElementById(`viewer-${side}-img`);
    if (oldImg) oldImg.remove();
    const oldToggle = document.getElementById(`toggle-${side}`);
    if (oldToggle) oldToggle.remove();

    const contentWrap = viewer.querySelector('.card-viewer-content') || (() => {
      const d = document.createElement('div');
      d.className = 'card-viewer-content';
      viewer.appendChild(d);
      return d;
    })();
    contentWrap.innerHTML = '';

    if (hasAnnotated && hasClean) {
      _buildSlider(contentWrap, _data[annotatedKey], _data[cleanKey], side);
    } else {
      const b64 = hasAnnotated ? _data[annotatedKey] : _data[cleanKey];
      const img = document.createElement('img');
      img.className = 'card-image';
      img.id = `viewer-${side}-img`;
      img.src = `data:image/jpeg;base64,${b64}`;
      img.alt = `Card ${side}`;
      img.onclick = () => _openLightbox(img.src);
      contentWrap.appendChild(img);
    }
  }

  /**
   * Build a drag-to-compare slider inside `container`.
   * The annotated image sits on top (clip-path reveals it from left).
   * The clean image is the base layer.
   */
  function _buildSlider(container, annotatedB64, cleanB64, side) {
    const annotatedSrc = `data:image/jpeg;base64,${annotatedB64}`;
    const cleanSrc     = `data:image/jpeg;base64,${cleanB64}`;

    const wrap = document.createElement('div');
    wrap.className = 'img-compare-wrap';
    wrap.style.position = 'relative';   // needed for canvas overlay

    // Bottom layer: clean image (always fully visible)
    const imgBottom = document.createElement('img');
    imgBottom.className = 'img-compare-bottom';
    imgBottom.src = cleanSrc;
    imgBottom.alt = `Card ${side} clean`;
    imgBottom.onclick = () => _openLightbox(cleanSrc);

    // Top layer: annotated image, clipped to left half initially
    const imgTop = document.createElement('img');
    imgTop.className = 'img-compare-top';
    imgTop.src = annotatedSrc;
    imgTop.alt = `Card ${side} annotated`;

    // Handle
    const handle = document.createElement('div');
    handle.className = 'img-compare-handle';

    // Labels
    const labels = document.createElement('div');
    labels.className = 'img-compare-labels';
    labels.innerHTML = '<span>Sauber</span><span>Annotiert</span>';

    wrap.appendChild(imgBottom);
    wrap.appendChild(imgTop);
    wrap.appendChild(handle);
    wrap.appendChild(labels);
    container.appendChild(wrap);

    // Set initial split at 50%
    _applySliderPct(imgTop, handle, 50);

    // Drag logic
    let dragging = false;

    function onMove(clientX) {
      const rect = wrap.getBoundingClientRect();
      let pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      _applySliderPct(imgTop, handle, pct);
    }

    wrap.addEventListener('mousedown', (e) => {
      dragging = true;
      onMove(e.clientX);
      e.preventDefault();
    });
    wrap.addEventListener('touchstart', (e) => {
      dragging = true;
      onMove(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      if (dragging) onMove(e.clientX);
    });
    window.addEventListener('touchmove', (e) => {
      if (dragging) onMove(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('mouseup',   () => { dragging = false; });
    window.addEventListener('touchend',  () => { dragging = false; });

    // Store wrap reference for border canvas attachment
    wrap._side = side;
  }

  function _applySliderPct(imgTop, handle, pct) {
    imgTop.style.clipPath  = `inset(0 0 0 ${pct}%)`;
    handle.style.left      = `${pct}%`;
  }

  // ── Border lines canvas ────────────────────────────────────────────────────

  function _attachBorderCanvas(viewer, side) {
    const centering = _centering[side];
    if (!centering) return;

    const wrap = viewer.querySelector('.img-compare-wrap') ||
                 viewer.querySelector('.card-viewer-content');
    if (!wrap) return;

    // Remove existing canvas
    const old = wrap.querySelector('.border-overlay-canvas');
    if (old) old.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'border-overlay-canvas';
    canvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none',
      `display:${_bordersVisible ? 'block' : 'none'}`,
    ].join(';');
    wrap.style.position = 'relative';
    wrap.appendChild(canvas);
    _canvases[side] = canvas;

    // Draw when the reference image is available and sized
    const refImg = wrap.querySelector('img');
    function draw() {
      if (!refImg.offsetWidth) return;
      canvas.width  = refImg.offsetWidth;
      canvas.height = refImg.offsetHeight;
      _drawBorderLines(canvas, centering, refImg.naturalWidth, refImg.naturalHeight);
    }
    if (refImg && refImg.complete && refImg.naturalWidth) {
      draw();
    } else if (refImg) {
      refImg.addEventListener('load', draw, { once: true });
    }

    // Redraw on window resize
    window.addEventListener('resize', () => {
      if (_canvases[side] && refImg) {
        canvas.width  = refImg.offsetWidth;
        canvas.height = refImg.offsetHeight;
        if (_bordersVisible) {
          _drawBorderLines(canvas, centering, refImg.naturalWidth, refImg.naturalHeight);
        }
      }
    });
  }

  function _drawBorderLines(canvas, centering, naturalW, naturalH) {
    if (!centering || centering.border_type === 'none') return;
    const ctx = canvas.getContext('2d');
    const dw = canvas.width;
    const dh = canvas.height;
    const scaleX = naturalW > 0 ? dw / naturalW : 1;
    const scaleY = naturalH > 0 ? dh / naturalH : 1;

    ctx.clearRect(0, 0, dw, dh);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);

    // Left / Right borders — blue
    ctx.strokeStyle = '#60a5fa';
    _hLine(ctx, centering.left_px * scaleX, 0, dh);
    _hLine(ctx, dw - centering.right_px * scaleX, 0, dh);

    // Top / Bottom borders — orange
    ctx.strokeStyle = '#fb923c';
    _vLine(ctx, 0, centering.top_px * scaleY, dw);
    _vLine(ctx, 0, dh - centering.bottom_px * scaleY, dw);
  }

  function _hLine(ctx, x, y0, y1) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }
  function _vLine(ctx, x0, y, x1) {
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }

  function _toggleBorders() {
    _bordersVisible = !_bordersVisible;
    ['front', 'back'].forEach(side => {
      const c = _canvases[side];
      if (c) c.style.display = _bordersVisible ? 'block' : 'none';
    });
    _updateToggleButton();
  }

  function _updateToggleButton() {
    const btn = document.getElementById('btn-border-toggle');
    if (!btn) return;

    const hasBorders = _centering.front || _centering.back;
    const isBorderless =
      (!_centering.front || _centering.front.border_type === 'none') &&
      (!_centering.back  || _centering.back.border_type  === 'none');

    btn.disabled = !hasBorders || isBorderless;
    btn.title = isBorderless ? 'Karte ohne Weißrand — Zentrierung nicht messbar' : '';
    btn.textContent = _bordersVisible ? 'Ränder ausblenden' : 'Ränder anzeigen';
    btn.style.opacity = btn.disabled ? '0.4' : '1';
  }

  function _openLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Card zoom">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  }

  return { render, setBorderData };
})();
