// MeckGrade Holo — API client + reactive store
// Wires the React UI to the real backend. Auth, profile, social, OCR.

(function () {
  const BASE = "";
  const LS_USER = "meckgrade.holo.userId";

  // ─── Low-level fetch (auto-attaches X-User-Id) ──────────────────────────
  function _headers(extra = {}) {
    const uid = localStorage.getItem(LS_USER);
    const h = { ...extra };
    if (uid) h["X-User-Id"] = uid;
    return h;
  }
  async function jget(path, opts = {}) {
    const r = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { ..._headers(), ...(opts.headers || {}) },
    });
    if (!r.ok) {
      const err = new Error(`${path} → ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }
  function jpost(path, body) {
    return jget(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }
  function jpatch(path, body) {
    return jget(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }
  function jdelete(path, body) {
    return jget(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  // ─── Analyze flow ───────────────────────────────────────────────────────
  async function uploadFiles(front, back) {
    const fd = new FormData();
    fd.append("front", front);
    if (back) fd.append("back", back);
    const r = await fetch("/api/upload", {
      method: "POST", body: fd, headers: _headers(),
    });
    if (!r.ok) throw new Error(`upload → ${r.status}`);
    return r.json();
  }
  function analyzeStream(sessionId, onEvent) {
    return new Promise((resolve, reject) => {
      const es = new EventSource(`/api/analyze/stream/${sessionId}`);
      es.onmessage = (m) => {
        try {
          const data = JSON.parse(m.data);
          onEvent && onEvent(data);
          if (data.done) { es.close(); resolve(data.result); }
        } catch {}
      };
      es.onerror = (e) => { es.close(); reject(e); };
    });
  }
  function addToCollection(sessionId, cardName, cardSet, cardId, cardNumber) {
    return jpost(`/api/history/${sessionId}`, {
      card_name:   cardName   || "",
      card_set:    cardSet    || "",
      card_id:     cardId     || "",
      card_number: cardNumber || "",
    });
  }
  function lookupCard(sessionId, nameOverride, cardId, lang) {
    const params = [];
    if (nameOverride) params.push(`name=${encodeURIComponent(nameOverride)}`);
    if (cardId)       params.push(`card_id=${encodeURIComponent(cardId)}`);
    const l = lang || _state.me?.settings?.card_language || "de";
    params.push(`lang=${encodeURIComponent(l)}`);
    const q = params.length ? `?${params.join("&")}` : "";
    return jget(`/api/lookup/${sessionId}${q}`);
  }
  function searchCards(query) {
    if (!query || query.trim().length < 2) return Promise.resolve({ results: [] });
    return jget(`/api/search/cards?q=${encodeURIComponent(query.trim())}`);
  }
  function getCardById(id) { return jget(`/api/search/card/${encodeURIComponent(id)}`); }
  function searchSets(q, lang) {
    return jget(`/api/search/sets?q=${encodeURIComponent(q || "")}&lang=${lang || "de"}`);
  }
  async function csvPreview(file) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/history/csv-preview", {
      method: "POST", body: fd, headers: _headers(),
    });
    if (!r.ok) throw new Error(`csv-preview → ${r.status}`);
    return r.json();
  }
  async function importCsv(file, mapping) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping || {}));
    const r = await fetch("/api/history/import-csv", {
      method: "POST", body: fd, headers: _headers(),
    });
    if (!r.ok) throw new Error(`import-csv → ${r.status}`);
    return r.json();
  }
  async function exportCsvDownload() {
    const r = await fetch("/api/history/export?format=csv", {
      headers: _headers(),
    });
    if (!r.ok) throw new Error(`export → ${r.status}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meckgrade-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function getHistory() { return jget("/api/history"); }
  function getHistoryItem(id) { return jget(`/api/history/${id}`); }
  function deleteHistory(id) { return jdelete(`/api/history/${id}`); }
  function getRoi(id) { return jget(`/api/roi/${id}`); }
  function patchHistoryTags(id, tags) { return jpatch(`/api/history/${id}/tags`, { tags }); }

  // ─── Auth ──────────────────────────────────────────────────────────────
  async function login(provider, email, displayName) {
    const profile = await jpost("/api/auth/login", {
      provider, email, display_name: displayName || "",
    });
    localStorage.setItem(LS_USER, profile.id);
    setState({ me: profile });
    refreshAll();
    return profile;
  }
  function logout() {
    localStorage.removeItem(LS_USER);
    setState({ me: null, notifications: [], notifUnread: 0, friends: [] });
  }
  async function refreshMe() {
    if (!localStorage.getItem(LS_USER)) return null;
    try {
      const me = await jget("/api/me");
      setState({ me });
      return me;
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem(LS_USER);
        setState({ me: null });
      }
      return null;
    }
  }
  function updateMe(patch) { return jpatch("/api/me", patch); }

  async function uploadAvatar(file) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/me/avatar", {
      method: "POST", body: fd, headers: _headers(),
    });
    if (!r.ok) {
      let msg = "Upload fehlgeschlagen";
      try { msg = (await r.json())?.detail || msg; } catch {}
      throw new Error(msg);
    }
    const profile = await r.json();
    setState({ me: profile });
    return profile;
  }
  async function deleteAvatar() {
    const r = await fetch("/api/me/avatar", { method: "DELETE", headers: _headers() });
    if (!r.ok) throw new Error(await r.text());
    const profile = await r.json();
    setState({ me: profile });
    return profile;
  }

  // ─── Profile (public) ──────────────────────────────────────────────────
  function getPublicProfile(username) { return jget(`/api/profile/${encodeURIComponent(username)}`); }
  function getPublicCards(username)   { return jget(`/api/profile/${encodeURIComponent(username)}/cards`); }
  function searchUsers(q)             { return jget(`/api/users/search?q=${encodeURIComponent(q || "")}`); }

  // ─── Friends ───────────────────────────────────────────────────────────
  function listFriends()                  { return jget("/api/friends"); }
  function addFriend(username)            { return jpost("/api/friends", { username }); }
  function removeFriend(username)         { return jdelete("/api/friends", { username }); }

  async function refreshFriends() {
    if (!localStorage.getItem(LS_USER)) return;
    try { setState({ friends: await listFriends() }); } catch {}
  }

  // ─── Notifications ─────────────────────────────────────────────────────
  async function refreshNotifications() {
    if (!localStorage.getItem(LS_USER)) return;
    try {
      const r = await jget("/api/notifications");
      setState({ notifications: r.items || [], notifUnread: r.unread || 0 });
    } catch {}
  }
  function markNotificationsRead(ids = null) {
    return jpost("/api/notifications/read", { ids }).then(refreshNotifications);
  }

  // ─── Persistent reactive state store ───────────────────────────────────
  const _state = {
    me: null,
    history: [],
    activeResult: null,
    activeSession: null,
    activeCardInfo: null,
    cardImages: {},
    submission: [],
    watchlist: [],
    friends: [],
    notifications: [],
    notifUnread: 0,
    cmdK: false,
    publicProfile: null,
  };
  const _subs = new Set();
  function subscribe(fn) { _subs.add(fn); return () => _subs.delete(fn); }
  function emit() { _subs.forEach(fn => { try { fn(_state); } catch {} }); }
  function setState(patch) { Object.assign(_state, patch); emit(); }
  function getState() { return _state; }

  const LS_SUB = "meckgrade.holo.submission";
  const LS_WATCH = "meckgrade.holo.watchlist";
  function loadLocal() {
    try { _state.submission = JSON.parse(localStorage.getItem(LS_SUB) || "[]"); } catch {}
    try { _state.watchlist  = JSON.parse(localStorage.getItem(LS_WATCH) || "[]"); } catch {}
  }
  loadLocal();

  function addToSubmission(sid) {
    if (!_state.submission.includes(sid)) {
      _state.submission = [..._state.submission, sid];
      localStorage.setItem(LS_SUB, JSON.stringify(_state.submission)); emit();
    }
  }
  function removeFromSubmission(sid) {
    _state.submission = _state.submission.filter(s => s !== sid);
    localStorage.setItem(LS_SUB, JSON.stringify(_state.submission)); emit();
  }
  function addToWatchlist(item) {
    if (item.sessionId && _state.watchlist.some(w => w.sessionId === item.sessionId)) return;
    _state.watchlist = [..._state.watchlist, { ...item, ts: item.ts || Date.now() }];
    localStorage.setItem(LS_WATCH, JSON.stringify(_state.watchlist)); emit();
  }
  function removeFromWatchlist(sessionId) {
    _state.watchlist = _state.watchlist.filter(w => w.sessionId !== sessionId);
    localStorage.setItem(LS_WATCH, JSON.stringify(_state.watchlist)); emit();
  }

  async function refreshHistory() {
    try {
      const hist = (await getHistory()) || [];
      // Drop submission/watchlist entries whose session no longer exists in
      // this user's history (orphaned by deletion or migration).
      const ids = new Set(hist.map(h => h.id));
      const subClean = (_state.submission || []).filter(sid => ids.has(sid));
      const watchClean = (_state.watchlist || []).filter(w => ids.has(w.sessionId));
      const dirtySub = subClean.length !== (_state.submission || []).length;
      const dirtyWatch = watchClean.length !== (_state.watchlist || []).length;
      if (dirtySub) localStorage.setItem(LS_SUB, JSON.stringify(subClean));
      if (dirtyWatch) localStorage.setItem(LS_WATCH, JSON.stringify(watchClean));
      setState({
        history: hist,
        ...(dirtySub  ? { submission: subClean }   : {}),
        ...(dirtyWatch? { watchlist: watchClean } : {}),
      });
    } catch {}
  }

  let _backfillInFlight = false;
  async function backfillCardImages() {
    if (_backfillInFlight) return;
    _backfillInFlight = true;
    try {
      const lang = _state.me?.settings?.card_language || "de";
      const need = (_state.history || []).filter(h =>
        h && (h.card_name || h.card_id) && !_state.cardImages[h.id]
      ).slice(0, 24);
      const next = { ..._state.cardImages };
      let dirty = false, lastEmit = Date.now();
      for (const row of need) {
        try {
          let imageUrl = null;
          // card_id path: exact lookup — most reliable
          if (row.card_id) {
            const info = await lookupCard(row.id, undefined, row.card_id, lang);
            imageUrl = info?.image_url || null;
            // If lookup returned no image but we have a card_id, try direct card detail
            if (!imageUrl) {
              const detail = await getCardById(row.card_id);
              imageUrl = detail?.image_url || null;
            }
          } else if (row.card_name) {
            // Name-only: try lookup but don't cache empty results (to allow retry later)
            const info = await lookupCard(row.id, row.card_name, undefined, lang);
            imageUrl = info?.image_url || null;
          }
          if (imageUrl) { next[row.id] = imageUrl; dirty = true; }
          // If no image found and no card_id: skip (don't mark as checked so retry is possible)
        } catch {}
        if (dirty && Date.now() - lastEmit > 600) {
          _state.cardImages = { ...next }; emit(); lastEmit = Date.now(); dirty = false;
        }
        await new Promise(r => setTimeout(r, 250));
      }
      if (dirty) { _state.cardImages = next; emit(); }
    } finally { _backfillInFlight = false; }
  }

  async function refreshAll() {
    await refreshMe();
    if (_state.me) {
      refreshHistory();
      refreshFriends();
      refreshNotifications();
    }
  }

  // ─── Toast ─────────────────────────────────────────────────────────────
  function _ensureToastStack() {
    let s = document.querySelector(".holo-toast-stack");
    if (!s) { s = document.createElement("div"); s.className = "holo-toast-stack"; document.body.appendChild(s); }
    return s;
  }
  function toast(title, body, kind = "ok", ms = 3200) {
    const stack = _ensureToastStack();
    const t = document.createElement("div");
    t.className = "holo-toast " + (kind === "error" ? "error" : kind === "warn" ? "warn" : "");
    t.innerHTML = `<div class="holo-toast-title"></div><div class="holo-toast-body"></div>`;
    t.querySelector(".holo-toast-title").textContent = title || "";
    t.querySelector(".holo-toast-body").textContent  = body  || "";
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, ms);
  }

  // Start polling notifications periodically
  setInterval(() => { if (_state.me) refreshNotifications(); }, 60_000);

  window.HoloAPI = {
    // analyze
    uploadFiles, analyzeStream, lookupCard, addToCollection, searchCards, getCardById,
    searchSets, csvPreview, importCsv, exportCsvDownload,
    getHistory, getHistoryItem, deleteHistory, patchHistoryTags, getRoi,
    refreshHistory, backfillCardImages,
    // auth + profile
    login, logout, refreshMe, updateMe,
    uploadAvatar, deleteAvatar,
    getPublicProfile, getPublicCards, searchUsers,
    // social
    listFriends, addFriend, removeFriend, refreshFriends,
    // notifications
    refreshNotifications, markNotificationsRead,
    // local lists
    addToSubmission, removeFromSubmission, addToWatchlist, removeFromWatchlist,
    // store
    subscribe, getState, setState,
    refreshAll,
    // ui
    toast,
  };
})();
