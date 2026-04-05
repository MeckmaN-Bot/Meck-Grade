/**
 * Card image viewer with annotation toggle and lightbox zoom.
 */
const Viewer = (() => {
  // state: { annotated_front, clean_front, annotated_back, clean_back }
  let _data   = {};
  let _showAnnotations = { front: true, back: true };

  function render(result) {
    _data = result;
    _showAnnotations = { front: true, back: true };
    _renderSide('front');
    _renderSide('back');

    // Set up lightbox for both images
    ['viewer-front-img', 'viewer-back-img'].forEach((id) => {
      const img = document.getElementById(id);
      if (img) {
        img.onclick = () => _openLightbox(img.src);
      }
    });
  }

  function _renderSide(side) {
    const container = document.getElementById(`viewer-${side}`);
    if (!container) return;

    const annotatedKey = `annotated_${side}_b64`;
    const cleanKey     = `clean_${side}_b64`;
    const hasAnnotated = !!_data[annotatedKey];
    const hasClean     = !!_data[cleanKey];

    if (!hasAnnotated && !hasClean) {
      container.closest('.card-viewer').classList.add('hidden');
      return;
    }

    container.closest('.card-viewer').classList.remove('hidden');

    const showAnnot = _showAnnotations[side];
    const b64 = showAnnot && hasAnnotated ? _data[annotatedKey] : (hasClean ? _data[cleanKey] : _data[annotatedKey]);

    const img = document.getElementById(`viewer-${side}-img`);
    img.src = `data:image/jpeg;base64,${b64}`;
    img.alt = `Card ${side}`;

    // Toggle button
    const btn = document.getElementById(`toggle-${side}`);
    if (btn) {
      btn.textContent = showAnnot ? 'Hide annotations' : 'Show annotations';
      btn.onclick = () => {
        _showAnnotations[side] = !_showAnnotations[side];
        _renderSide(side);
      };
    }
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
