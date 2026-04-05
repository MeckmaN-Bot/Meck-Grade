/**
 * Upload zone management: drag-and-drop, file picker, preview.
 */
const Uploader = (() => {
  let _frontFile = null;
  let _backFile  = null;
  let _onReady   = null;   // callback(frontFile, backFile)

  function init(onReady) {
    _onReady = onReady;
    _setupZone('front-zone', 'front-input', (f) => { _frontFile = f; _checkReady(); });
    _setupZone('back-zone',  'back-input',  (f) => { _backFile  = f; _checkReady(); });
  }

  function getFiles() {
    return { front: _frontFile, back: _backFile };
  }

  function reset() {
    _frontFile = null;
    _backFile  = null;
    _resetZone('front-zone', 'front-input');
    _resetZone('back-zone',  'back-input');
    document.getElementById('btn-analyze').disabled = true;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  function _setupZone(zoneId, inputId, onFile) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    input.addEventListener('change', () => {
      if (input.files[0]) _handleFile(zone, input.files[0], onFile);
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) _handleFile(zone, f, onFile);
    });

    // Clicking the zone label also triggers file picker
    zone.addEventListener('click', (e) => {
      if (e.target !== input) input.click();
    });
  }

  function _handleFile(zone, file, onFile) {
    if (!_isValidType(file)) {
      alert('Please upload a TIFF, PNG, or JPEG image.');
      return;
    }
    onFile(file);
    zone.classList.add('has-file');

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      let preview = zone.querySelector('.upload-preview');
      if (!preview) {
        preview = document.createElement('img');
        preview.className = 'upload-preview';
        zone.insertBefore(preview, zone.querySelector('.upload-zone-label'));
      }
      preview.src = e.target.result;
      zone.querySelector('.upload-zone-icon').textContent = '✓';
    };
    reader.readAsDataURL(file);
  }

  function _resetZone(zoneId, inputId) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    zone.classList.remove('has-file', 'drag-over');
    const preview = zone.querySelector('.upload-preview');
    if (preview) preview.remove();
    const icon = zone.querySelector('.upload-zone-icon');
    if (icon) icon.textContent = '⊕';
    input.value = '';
  }

  function _checkReady() {
    const ready = !!_frontFile;
    document.getElementById('btn-analyze').disabled = !ready;
    if (_onReady) _onReady(ready, _frontFile, _backFile);
  }

  function _isValidType(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/tiff', 'image/tif',
                     'image/x-tiff', 'image/jpg'];
    if (allowed.includes(file.type)) return true;
    // Fallback: check extension (TIFF sometimes has empty MIME)
    return /\.(tiff?|png|jpe?g)$/i.test(file.name);
  }

  return { init, getFiles, reset };
})();
