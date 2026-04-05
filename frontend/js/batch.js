/**
 * BatchUploader — Verwaltet mehrere Karten-Paare und verarbeitet sie sequenziell.
 *
 * Jede Karte hat eine eigene Zeile mit Vorder- und Rückseiten-Slot.
 * Die Verarbeitung erfolgt sequenziell (eine nach der anderen) via bestehender
 * API.upload + API.analyzeStream Pipeline.
 */
const BatchUploader = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let _rows      = [];   // [{front: File|null, back: File|null, id: number}]
  let _rowIdSeq  = 0;
  let _container = null; // DOM container für Zeilen
  let _isRunning = false;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init(containerEl) {
    _container = containerEl;
    _rows = [];
    _rowIdSeq = 0;
    addRow();  // Erste Zeile direkt hinzufügen
  }

  function addRow() {
    const id = ++_rowIdSeq;
    _rows.push({ id, front: null, back: null });
    _renderRows();
    return id;
  }

  function removeRow(id) {
    if (_rows.length <= 1) return; // Mindestens eine Zeile
    _rows = _rows.filter(r => r.id !== id);
    _renderRows();
  }

  function reset() {
    _rows = [];
    _rowIdSeq = 0;
    addRow();
    _isRunning = false;
  }

  function getRows() { return _rows; }

  function isReady() {
    return _rows.some(r => r.front !== null);
  }

  // ── Render Zeilen ──────────────────────────────────────────────────────────
  function _renderRows() {
    if (!_container) return;
    _container.innerHTML = '';

    _rows.forEach((row, idx) => {
      const div = document.createElement('div');
      div.className = 'batch-row';
      div.dataset.id = row.id;
      div.innerHTML = `
        <span class="batch-row-num">${idx + 1}</span>
        <div class="batch-slot" data-side="front" data-rowid="${row.id}">
          <input type="file" class="batch-file-input" accept=".jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff">
          <span class="batch-slot-icon">${row.front ? '✓' : '⊕'}</span>
          <span class="batch-slot-label">${row.front ? _truncate(row.front.name, 20) : 'Vorderseite'}</span>
        </div>
        <div class="batch-slot" data-side="back" data-rowid="${row.id}">
          <input type="file" class="batch-file-input" accept=".jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff">
          <span class="batch-slot-icon">${row.back ? '✓' : '⊕'}</span>
          <span class="batch-slot-label">${row.back ? _truncate(row.back.name, 20) : 'Rückseite'}</span>
        </div>
        ${_rows.length > 1
          ? `<button class="batch-remove-btn" data-rowid="${row.id}" title="Zeile entfernen">✕</button>`
          : '<span class="batch-remove-placeholder"></span>'}
      `;

      // File input events
      div.querySelectorAll('.batch-slot').forEach(slot => {
        const input = slot.querySelector('.batch-file-input');
        slot.addEventListener('click', (e) => {
          if (e.target !== input) input.click();
        });
        slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', e => {
          e.preventDefault();
          slot.classList.remove('drag-over');
          const file = e.dataTransfer.files[0];
          if (file && _isImage(file)) _setFile(row.id, slot.dataset.side, file);
        });
        input.addEventListener('change', () => {
          const file = input.files[0];
          if (file && _isImage(file)) _setFile(row.id, slot.dataset.side, file);
        });
      });

      // Remove button
      const rmBtn = div.querySelector('.batch-remove-btn');
      if (rmBtn) rmBtn.addEventListener('click', () => removeRow(Number(rmBtn.dataset.rowid)));

      _container.appendChild(div);
    });

    _notifyReady();
  }

  function _setFile(rowId, side, file) {
    const row = _rows.find(r => r.id === rowId);
    if (!row) return;
    row[side] = file;
    _renderRows();
  }

  // ── Status-Grid ────────────────────────────────────────────────────────────
  /**
   * Rendert das Status-Grid im Analyzing-Panel.
   * @param {HTMLElement} gridEl
   * @param {Array}       rows  — array of {id, front, back}
   */
  function renderStatusGrid(gridEl, rows) {
    gridEl.innerHTML = rows.map((r, i) => `
      <div class="batch-status-item" id="bsi-${r.id}">
        <span class="bsi-num">${i + 1}</span>
        <div class="bsi-bar-wrap">
          <div class="bsi-bar" id="bsi-bar-${r.id}" style="width:0%"></div>
        </div>
        <span class="bsi-label" id="bsi-label-${r.id}">Warteschlange</span>
        <span class="bsi-result" id="bsi-result-${r.id}"></span>
      </div>
    `).join('');
  }

  function updateStatusItem(rowId, pct, msg, result, error) {
    const bar    = document.getElementById(`bsi-bar-${rowId}`);
    const label  = document.getElementById(`bsi-label-${rowId}`);
    const resEl  = document.getElementById(`bsi-result-${rowId}`);
    const item   = document.getElementById(`bsi-${rowId}`);

    if (bar)   bar.style.width = `${Math.min(pct, 98)}%`;
    if (label) label.textContent = msg || '';

    if (result) {
      if (bar)  bar.style.width = '100%';
      if (item) item.classList.add('done');
      const psa = result.grades?.psa;
      const col = psa >= 9 ? 'var(--pass)' : psa >= 7 ? 'var(--accent)' : 'var(--warn)';
      if (resEl) resEl.innerHTML = `<span style="color:${col};font-weight:700">PSA ${psa}</span>`;
    }
    if (error) {
      if (item) item.classList.add('error');
      if (resEl) resEl.innerHTML = `<span style="color:var(--fail)">Fehler</span>`;
    }
  }

  // ── Sequential processing ──────────────────────────────────────────────────
  /**
   * Process all rows sequentially.
   * @param {function(rowId)}                          onStart
   * @param {function(rowId, pct, msg)}                onProgress
   * @param {function(rowId, result)}                  onDone
   * @param {function(rowId, error)}                   onError
   * @param {function(allResults)}                     onAllDone
   */
  async function runAll(onStart, onProgress, onDone, onError, onAllDone) {
    if (_isRunning) return;
    _isRunning = true;

    const rowsToProcess = _rows.filter(r => r.front !== null);
    const allResults = [];

    for (const row of rowsToProcess) {
      onStart(row.id);

      try {
        // Upload
        onProgress(row.id, 8, 'Hochladen…');
        const uploaded = await API.upload(row.front, row.back || null);
        const sessionId = uploaded.session_id;

        // Analyze via SSE
        const result = await new Promise((resolve, reject) => {
          API.analyzeStream(
            sessionId,
            (pct, msg) => onProgress(row.id, pct, msg),
            (res)      => resolve(res),
            (err)      => reject(err),
          );
        });

        allResults.push({ rowId: row.id, result, sessionId });
        onDone(row.id, result);

      } catch (err) {
        onError(row.id, err);
        allResults.push({ rowId: row.id, error: err });
      }
    }

    _isRunning = false;
    onAllDone(allResults);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _isImage(file) {
    return /^image\/(jpeg|png|tiff?)$/.test(file.type) ||
           /\.(jpe?g|png|tiff?)$/i.test(file.name);
  }

  function _truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  let _onReadyCallback = null;
  function onReady(cb) { _onReadyCallback = cb; }
  function _notifyReady() { if (_onReadyCallback) _onReadyCallback(isReady()); }

  return { init, addRow, removeRow, reset, getRows, isReady, onReady,
           renderStatusGrid, updateStatusItem, runAll };

})();
