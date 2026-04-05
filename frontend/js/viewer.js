/**
 * Card image viewer with annotation comparison slider and lightbox zoom.
 * When both annotated and clean images are available, renders a drag-to-compare
 * slider (clip-path on the annotated layer). Falls back to a plain image when
 * only one version is present.
 */
const Viewer = (() => {
  let _data = {};

  function render(result) {
    _data = result;
    _renderSide('front');
    _renderSide('back');
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
      // Keep the side label, remove the toggle button
      const sideLabel = labelDiv.querySelector('span:first-child');
      labelDiv.innerHTML = '';
      if (sideLabel) labelDiv.appendChild(sideLabel);
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
  }

  function _applySliderPct(imgTop, handle, pct) {
    // Reveal annotated from right side: clip left portion = pct%
    imgTop.style.clipPath  = `inset(0 0 0 ${pct}%)`;
    handle.style.left      = `${pct}%`;
  }

  function _openLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Card zoom">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  }

  return { render };
})();
