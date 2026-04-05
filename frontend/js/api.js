/**
 * API wrapper for all Meck-Grade backend calls.
 */
const API = (() => {
  const BASE = '';

  async function health() {
    const r = await fetch(`${BASE}/api/health`);
    return r.json();
  }

  async function upload(frontFile, backFile) {
    const fd = new FormData();
    fd.append('front', frontFile);
    if (backFile) fd.append('back', backFile);
    const r = await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    return r.json();
  }

  /**
   * SSE-based analysis with real-time progress events.
   * @param {string} sessionId
   * @param {function(number, string): void} onProgress  - called with (pct, msg)
   * @param {function(object): void}         onDone      - called with full result
   * @param {function(Error): void}          onError
   * @returns {EventSource} — caller can call .close() to cancel
   */
  function analyzeStream(sessionId, onProgress, onDone, onError) {
    const es = new EventSource(`${BASE}/api/analyze/stream/${sessionId}`);

    es.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data.error) {
        es.close();
        onError(new Error(data.msg || 'Analysis failed'));
        return;
      }

      if (data.done) {
        es.close();
        onDone(data.result);
      } else {
        onProgress(data.pct || 0, data.msg || '');
      }
    };

    es.onerror = () => {
      es.close();
      onError(new Error('Connection to analysis server lost.'));
    };

    return es;
  }

  /** Fallback: synchronous analyze (POST) for environments that don't support SSE well. */
  async function analyze(sessionId) {
    const r = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || 'Analysis failed');
    }
    return r.json();
  }

  async function deleteSession(sessionId) {
    await fetch(`${BASE}/api/session/${sessionId}`, { method: 'DELETE' });
  }

  async function getHistory() {
    const r = await fetch(`${BASE}/api/history`);
    if (!r.ok) return [];
    return r.json();
  }

  async function deleteHistoryEntry(sessionId) {
    await fetch(`${BASE}/api/history/${sessionId}`, { method: 'DELETE' });
  }

  async function updateHistoryNotes(sessionId, notes) {
    await fetch(`${BASE}/api/history/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
  }

  async function lookupCard(sessionId) {
    const r = await fetch(`${BASE}/api/lookup/${sessionId}`);
    if (!r.ok) return null;
    return r.json();
  }

  return { health, upload, analyze, analyzeStream, deleteSession,
           getHistory, deleteHistoryEntry, updateHistoryNotes, lookupCard };
})();
