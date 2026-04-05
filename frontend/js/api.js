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

  return { health, upload, analyze, deleteSession };
})();
