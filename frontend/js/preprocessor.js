/**
 * Bildvorverarbeitungs-Modal (v1.4)
 * Öffnet sich nach File-Wahl und erlaubt Rotation, Helligkeit und Kontrast
 * per Canvas-Transformation. Gibt ein fertig bearbeitetes File-Objekt zurück.
 */
const Preprocessor = (() => {

  let _resolve  = null;   // Promise resolver
  let _imgEl    = null;   // original <img> drawn on canvas
  let _canvas   = null;
  let _ctx      = null;
  let _rotation = 0;      // degrees, multiples of 90
  let _free     = 0;      // free rotation in degrees (-45…+45)
  let _bright   = 0;      // CSS brightness offset (-50…+50)
  let _contrast = 0;      // CSS contrast offset (-50…+50)
  let _origFile = null;   // original File object

  /**
   * Show the modal for a given File. Returns a Promise<File> with the
   * (possibly transformed) file. If the user dismisses, returns the original.
   */
  function open(file) {
    _origFile = file;
    _rotation = 0;
    _free     = 0;
    _bright   = 0;
    _contrast = 0;

    return new Promise((resolve) => {
      _resolve = resolve;
      _buildModal(file);
    });
  }

  // ── Modal build ────────────────────────────────────────────────────────────

  function _buildModal(file) {
    // Remove any existing modal
    document.getElementById('preproc-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id        = 'preproc-backdrop';
    backdrop.className = 'preproc-backdrop';
    backdrop.innerHTML = `
      <div class="preproc-modal" role="dialog" aria-modal="true" aria-label="Bild anpassen">
        <div class="preproc-header">
          <span class="preproc-title">Bild anpassen</span>
          <button class="preproc-close" id="preproc-close" title="Schließen">✕</button>
        </div>

        <div class="preproc-canvas-wrap">
          <canvas id="preproc-canvas"></canvas>
        </div>

        <div class="preproc-controls">
          <!-- Rotation buttons -->
          <div class="preproc-control-row">
            <label class="preproc-label">Rotation</label>
            <div class="preproc-btn-group">
              <button class="preproc-btn" id="preproc-rot-ccw" title="90° gegen den Uhrzeigersinn">↺ 90°</button>
              <button class="preproc-btn" id="preproc-rot-cw"  title="90° im Uhrzeigersinn">↻ 90°</button>
            </div>
          </div>

          <!-- Free rotation slider -->
          <div class="preproc-control-row">
            <label class="preproc-label">Feinrot. <span id="preproc-free-val">0°</span></label>
            <input type="range" id="preproc-free" min="-45" max="45" value="0" step="0.5" class="preproc-slider">
          </div>

          <!-- Brightness -->
          <div class="preproc-control-row">
            <label class="preproc-label">Helligkeit <span id="preproc-bright-val">0</span></label>
            <input type="range" id="preproc-bright" min="-50" max="50" value="0" step="1" class="preproc-slider">
          </div>

          <!-- Contrast -->
          <div class="preproc-control-row">
            <label class="preproc-label">Kontrast <span id="preproc-contrast-val">0</span></label>
            <input type="range" id="preproc-contrast" min="-50" max="50" value="0" step="1" class="preproc-slider">
          </div>
        </div>

        <div class="preproc-footer">
          <button class="preproc-btn preproc-reset" id="preproc-reset">Zurücksetzen</button>
          <div style="display:flex;gap:8px">
            <button class="preproc-btn" id="preproc-skip">Überspringen</button>
            <button class="preproc-btn preproc-apply" id="preproc-apply">Übernehmen →</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    _canvas = document.getElementById('preproc-canvas');
    _ctx    = _canvas.getContext('2d');

    // Load image
    const url = URL.createObjectURL(file);
    _imgEl = new Image();
    _imgEl.onload = () => { URL.revokeObjectURL(url); _draw(); };
    _imgEl.src = url;

    // Events
    document.getElementById('preproc-rot-ccw').addEventListener('click', () => { _rotation -= 90; _draw(); });
    document.getElementById('preproc-rot-cw').addEventListener('click',  () => { _rotation += 90; _draw(); });

    _bindSlider('preproc-free',     'preproc-free-val',     (v) => { _free     = v; _draw(); }, '°');
    _bindSlider('preproc-bright',   'preproc-bright-val',   (v) => { _bright   = v; _draw(); });
    _bindSlider('preproc-contrast', 'preproc-contrast-val', (v) => { _contrast = v; _draw(); });

    document.getElementById('preproc-reset').addEventListener('click',  _reset);
    document.getElementById('preproc-skip').addEventListener('click',   () => _finish(false));
    document.getElementById('preproc-apply').addEventListener('click',  () => _finish(true));
    document.getElementById('preproc-close').addEventListener('click',  () => _finish(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _finish(false); });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function _draw() {
    if (!_imgEl || !_canvas) return;

    const totalDeg = _rotation + _free;
    const rad      = totalDeg * Math.PI / 180;

    // Compute bounding box of rotated image
    const w = _imgEl.naturalWidth;
    const h = _imgEl.naturalHeight;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bw  = Math.round(w * cos + h * sin);
    const bh  = Math.round(w * sin + h * cos);

    // Limit to max display size
    const maxW  = Math.min(bw, 500);
    const scale = maxW / bw;
    _canvas.width  = Math.round(bw * scale);
    _canvas.height = Math.round(bh * scale);

    // Brightness / contrast via CSS filter
    const brightness = 100 + _bright;         // CSS percentage
    const contrast   = 100 + _contrast * 2;   // CSS percentage
    _ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    _ctx.save();
    _ctx.translate(_canvas.width / 2, _canvas.height / 2);
    _ctx.rotate(rad);
    _ctx.scale(scale, scale);
    _ctx.drawImage(_imgEl, -w / 2, -h / 2, w, h);
    _ctx.restore();
  }

  // ── Finish ─────────────────────────────────────────────────────────────────

  async function _finish(applyChanges) {
    const backdrop = document.getElementById('preproc-backdrop');

    if (!applyChanges || !_canvas) {
      backdrop?.remove();
      _resolve(_origFile);
      return;
    }

    // Export canvas to Blob and wrap as File
    _canvas.toBlob((blob) => {
      backdrop?.remove();
      if (!blob) { _resolve(_origFile); return; }
      const ext  = _origFile.name.match(/\.\w+$/) ? _origFile.name.match(/\.\w+$/)[0] : '.jpg';
      const name = _origFile.name.replace(/\.\w+$/, '') + '_bearbeitet' + ext;
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
      _resolve(file);
    }, 'image/jpeg', 0.95);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _reset() {
    _rotation = 0; _free = 0; _bright = 0; _contrast = 0;
    ['preproc-free', 'preproc-bright', 'preproc-contrast'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 0;
    });
    document.getElementById('preproc-free-val')    .textContent = '0°';
    document.getElementById('preproc-bright-val')  .textContent = '0';
    document.getElementById('preproc-contrast-val').textContent = '0';
    _draw();
  }

  function _bindSlider(sliderId, valId, onChange, suffix = '') {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(valId);
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      label.textContent = v + suffix;
      onChange(v);
    });
  }

  return { open };
})();
