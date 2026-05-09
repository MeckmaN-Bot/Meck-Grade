// MeckGrade Holo — extras: cmd+K palette, notifications, settings, friends,
// profile screens. All wired to the real backend.
const { useState: uXS, useEffect: uXE, useRef: uXR } = React;

// ──────────────────────────── CMD+K PALETTE ────────────────────────────
function CmdPalette({ appState, go, onClose }) {
  const [q, setQ] = uXS("");
  const [tcgdex, setTcgdex] = uXS([]);
  const [users, setUsers] = uXS([]);
  const inputRef = uXR(null);
  const debRef = uXR(0);

  uXE(() => { inputRef.current?.focus(); }, []);
  uXE(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (q.trim().length < 2) { setTcgdex([]); setUsers([]); return; }
    debRef.current = setTimeout(async () => {
      try {
        const [c, u] = await Promise.all([
          window.HoloAPI.searchCards(q),
          window.HoloAPI.searchUsers(q),
        ]);
        setTcgdex(c.results || []);
        setUsers(u.results || []);
      } catch {}
    }, 220);
  }, [q]);

  const routes = [
    { id: "dashboard",  label: "Dashboard",          ic: "home" },
    { id: "analyze",    label: "Analyze · New scan", ic: "scan" },
    { id: "collection", label: "Collection",         ic: "vault" },
    { id: "submission", label: "Submission Builder", ic: "submit" },
    { id: "watchlist",  label: "Watchlist",          ic: "eye" },
    { id: "resub",      label: "Crack & Resub",      ic: "swap" },
    { id: "population", label: "Population",         ic: "pop" },
    { id: "sets",       label: "Sets",               ic: "set" },
    { id: "friends",    label: "Friends",            ic: "friends" },
    { id: "settings",   label: "Settings",           ic: "cog" },
    { id: "profile",    label: "My Profile",         ic: "friends" },
  ];

  const ql = q.trim().toLowerCase();
  const filteredRoutes = ql
    ? routes.filter(r => r.label.toLowerCase().includes(ql))
    : routes.slice(0, 8);

  const myCards = (appState.history || [])
    .filter(h => h.card_name && (!ql || h.card_name.toLowerCase().includes(ql)))
    .slice(0, 6);

  const close = () => onClose && onClose();

  return (
    <div className="holo-modal-back" onClick={close}>
      <div className="cmdk-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Ic k="search" s={16}/>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search cards, scans, sets, friends…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && close()}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="cmdk-list">
          <Section title="Navigate">
            {filteredRoutes.map(r => (
              <CmdRow key={r.id} icon={r.ic} title={r.label} hint="Route"
                onClick={() => { close(); go(r.id); }}/>
            ))}
            {filteredRoutes.length === 0 && <Empty/>}
          </Section>
          {myCards.length > 0 && (
            <Section title={`My collection · ${myCards.length}`}>
              {myCards.map(c => (
                <CmdRow key={c.id} icon="vault" title={c.card_name || "Unbenannte"}
                  hint={`${c.card_set || ""} · PSA ${c.psa_grade || "—"}`}
                  onClick={() => { close(); go("card", { sessionId: c.id }); }}/>
              ))}
            </Section>
          )}
          {tcgdex.length > 0 && (
            <Section title="TCGdex">
              {tcgdex.map(c => (
                <CmdRow key={c.id} icon="set" title={c.name}
                  hint={`#${c.number || "—"} · ${c.id}`}
                  onClick={() => { close(); window.HoloAPI.toast("Tipp", "Karte aus Sammlung wählen oder neu scannen, um zu bewerten."); }}/>
              ))}
            </Section>
          )}
          {users.length > 0 && (
            <Section title="Users">
              {users.map(u => (
                <CmdRow key={u.username} icon="friends"
                  title={u.display_name || u.username}
                  hint={`@${u.username}`}
                  avatar={u.avatar}
                  onClick={() => { close(); go("publicprofile", { publicUsername: u.username }); }}/>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
function Section({ title, children }) {
  return (<div className="cmdk-section">
    <div className="cmdk-section-title">{title}</div>
    <div>{children}</div>
  </div>);
}
function Empty() { return <div className="cmdk-empty">Keine Treffer.</div>; }
function CmdRow({ icon, title, hint, avatar, onClick }) {
  return (
    <div className="cmdk-row" onClick={onClick}>
      <span className="cmdk-row-icon">
        {avatar ? <Avatar value={avatar} size={20}/> : <Ic k={icon} s={14}/>}
      </span>
      <span className="cmdk-row-title">{title}</span>
      <span className="cmdk-row-hint">{hint}</span>
    </div>
  );
}

// ──────────────────────────── SETTINGS ────────────────────────────
function ScreenSettings({ go, appState }) {
  const me = appState.me;
  const [draft, setDraft] = uXS(() => ({
    display_name: me?.display_name || "",
    username: me?.username || "",
    bio: me?.bio || "",
    avatar: me?.avatar || "✨",
    settings: { ...(me?.settings || {}) },
  }));
  const [saving, setSaving] = uXS(false);

  uXE(() => {
    if (me) {
      setDraft({
        display_name: me.display_name || "",
        username: me.username || "",
        bio: me.bio || "",
        avatar: me.avatar || "✨",
        settings: { ...(me.settings || {}) },
      });
    }
  }, [me?.id]);

  const save = async () => {
    setSaving(true);
    try {
      await window.HoloAPI.updateMe(draft);
      await window.HoloAPI.refreshMe();
      window.HoloAPI.toast("Gespeichert", "Profil aktualisiert.");
    } catch (e) {
      window.HoloAPI.toast("Fehler", e.message || "Speichern fehlgeschlagen", "error");
    } finally { setSaving(false); }
  };

  if (!me) return <div className="content"><PageHead eyebrow="Account" title='<em>Loading…</em>'/></div>;

  const setS = (k, v) => setDraft(d => ({...d, settings: {...d.settings, [k]: v}}));

  const pickAvatar = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg";
    inp.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!["image/png", "image/jpeg"].includes(f.type)) {
        window.HoloAPI.toast("Falsches Format", "Nur PNG oder JPG.", "error"); return;
      }
      if (f.size > 4 * 1024 * 1024) {
        window.HoloAPI.toast("Zu groß", "Max 4 MB.", "error"); return;
      }
      try {
        await window.HoloAPI.uploadAvatar(f);
        await window.HoloAPI.refreshMe();
        window.HoloAPI.toast("Avatar gesetzt", "Bild hochgeladen.");
      } catch (ex) {
        window.HoloAPI.toast("Upload fehlgeschlagen", ex.message || "", "error");
      }
    };
    inp.click();
  };

  const removeAvatar = async () => {
    if (!confirm("Avatar entfernen?")) return;
    try {
      await window.HoloAPI.deleteAvatar();
      await window.HoloAPI.refreshMe();
      window.HoloAPI.toast("Entfernt", "Standard-Avatar wieder aktiv.");
    } catch {}
  };

  return (
    <div>
      <PageHead
        eyebrow="08 · Account · Settings"
        title='<em>Settings.</em>'
        sub="Profil, Vault-Konfig und ROI-Parameter. Wird im lokalen Profil gespeichert."
        actions={<>
          <button className="btn btn-ghost" onClick={() => { if (confirm("Wirklich abmelden?")) { window.HoloAPI.logout(); go("onboard"); }}}>Abmelden</button>
          <button className="btn btn-glow" onClick={save} disabled={saving}>{saving ? "…" : "Speichern"}</button>
        </>}
      />

      <div className="grid-2">
        <div className="panel">
          <div className="panel-hd"><div className="panel-title">Profil</div><div className="panel-meta">öffentlich</div></div>
          <label className="label">Anzeigename</label>
          <input className="input" value={draft.display_name} onChange={(e) => setDraft({...draft, display_name: e.target.value})}/>
          <label className="label" style={{marginTop:14}}>Username</label>
          <input className="input" value={draft.username} onChange={(e) => setDraft({...draft, username: e.target.value})}/>
          <label className="label" style={{marginTop:14}}>Bio</label>
          <textarea className="input" rows={3} value={draft.bio} onChange={(e) => setDraft({...draft, bio: e.target.value})}/>
          <label className="label" style={{marginTop:14}}>Avatar</label>
          <div className="avatar-upload">
            <Avatar value={me.avatar} size={84} className="avatar-preview"/>
            <div className="avatar-actions">
              <button type="button" className="btn btn-ghost" onClick={pickAvatar}>
                <Ic k="upload" s={13}/> Bild hochladen
              </button>
              {me.avatar && (me.avatar.startsWith("/") || me.avatar.startsWith("http")) && (
                <button type="button" className="btn btn-ghost" onClick={removeAvatar}>Entfernen</button>
              )}
              <div className="muted" style={{fontSize:11.5, marginTop:4}}>PNG oder JPG · max 4 MB</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd"><div className="panel-title">Vault & ROI</div><div className="panel-meta">privat</div></div>
          <label className="label">PSA Express Fee (€/Karte)</label>
          <input className="input" type="number" value={draft.settings.psa_fee || 28} onChange={(e) => setS("psa_fee", parseFloat(e.target.value) || 0)}/>
          <label className="label" style={{marginTop:14}}>Versand-Kosten (€)</label>
          <input className="input" type="number" value={draft.settings.ship_cost || 22} onChange={(e) => setS("ship_cost", parseFloat(e.target.value) || 0)}/>
          <label className="label" style={{marginTop:14}}>Sprache</label>
          <select className="input" value={draft.settings.language || "de"} onChange={(e) => setS("language", e.target.value)}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
          <label className="label" style={{marginTop:14}}>Währung</label>
          <select className="input" value={draft.settings.currency || "EUR"} onChange={(e) => setS("currency", e.target.value)}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
          </select>
          <label className="label" style={{marginTop:14}}>Karten-Sprache</label>
          <select className="input" value={draft.settings.card_language || "de"} onChange={(e) => setS("card_language", e.target.value)}>
            {[["de","Deutsch"],["en","English"],["fr","Français"],["it","Italiano"],
              ["es","Español"],["pt","Português"],["ja","日本語 (JP)"],["ko","한국어"]].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="section panel">
        <div className="panel-hd"><div className="panel-title">Account</div><div className="panel-meta">Mecky · {me.email}</div></div>
        <div className="muted" style={{fontSize:13}}>Provider: {me.provider} · Erstellt: {new Date(me.created_at).toLocaleString("de-DE")}</div>
        <div style={{marginTop:14, display:"flex", gap:10}}>
          <a className="btn btn-ghost" href={`/u/${me.username}`} onClick={(e) => { e.preventDefault(); go("publicprofile", { publicUsername: me.username }); }}>Öffentliches Profil</a>
          <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/?u=${me.username}`); window.HoloAPI.toast("Link kopiert", "Profil-Link in Zwischenablage."); }}>Profil-Link kopieren</button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── MY PROFILE (vitrine builder) ────────────────────────────
// ─── Mouse-tilt wrapper: 3D card hover with holo gloss ─────────────────
function MouseTilt({ children, max = 18, className = "" }) {
  const ref = uXR(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    const inner = el.firstChild;
    if (inner && inner.style) {
      const ry = (x - 0.5) * max;
      const rx = (0.5 - y) * (max * 0.7);
      inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    }
    el.style.setProperty("--hx", `${x * 100}%`);
    el.style.setProperty("--hy", `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    const inner = el.firstChild;
    if (inner && inner.style) inner.style.transform = "rotateX(0deg) rotateY(0deg)";
  };
  return (
    <div ref={ref}
         className={"profile-tilt " + className}
         onMouseMove={onMove}
         onMouseLeave={onLeave}>
      {children}
    </div>
  );
}

// ─────────── PROFILE V2 (design handoff) ───────────
const PROFILE_FOILS = {
  aurora: {
    name: "Aurora",
    css: "linear-gradient(120deg, #c4a5ff 0%, #ff8fd3 25%, #ffc585 50%, #b8f5b0 75%, #87d8ff 100%)",
  },
  cosmos: {
    name: "Cosmos",
    css: "linear-gradient(120deg, #1a1346 0%, #5b3aa3 30%, #c66bff 55%, #ff7eb8 80%, #ffd1a3 100%)",
  },
  emerald: {
    name: "Emerald",
    css: "linear-gradient(120deg, #053b2e 0%, #0a7a5a 30%, #2ed3a1 55%, #b8f5b0 78%, #f4f2ee 100%)",
  },
  blood: {
    name: "Blood Foil",
    css: "linear-gradient(120deg, #2a0509 0%, #7a0a18 30%, #d6314a 55%, #ff8a92 78%, #ffd2c1 100%)",
  },
  obsidian: {
    name: "Obsidian",
    css: "linear-gradient(120deg, #07070b 0%, #1d1d2c 35%, #5c5a72 65%, #c7c5d4 92%, #f4f2ee 100%)",
  },
};
const PROFILE_ACCENTS = {
  mint:   { name: "Mint",   color: "#b8f5b0", text: "#052016" },
  violet: { name: "Violet", color: "#c4a5ff", text: "#150a30" },
  rose:   { name: "Rose",   color: "#ff8fd3", text: "#310520" },
  peach:  { name: "Peach",  color: "#ffc585", text: "#2a1503" },
  cyan:   { name: "Cyan",   color: "#87d8ff", text: "#021a2a" },
};

const DEFAULT_PROFILE_CUSTOM = {
  foil: "aurora", pattern: "flow", accent: "mint", grails: "podium",
  showWishlist: true, showFriends: true, showActivity: true, showBadges: true,
  location: "",
};

function FoilCanvas({ foil, pattern }) {
  return (
    <div className="profile-foil" style={{backgroundImage: foil.css, backgroundSize:"200% 200%"}}>
      {pattern === "grid" && <div className="foil-grid"></div>}
      {pattern === "rays" && (
        <svg viewBox="0 0 800 200" preserveAspectRatio="none" style={{position:"absolute", inset:0, width:"100%", height:"100%", mixBlendMode:"overlay", opacity:0.55}}>
          {Array.from({length:24}).map((_,i) => (
            <line key={i} x1={i*40} y1="0" x2={i*40 + 90} y2="200" stroke="#fff" strokeWidth="0.6" opacity="0.35"/>
          ))}
        </svg>
      )}
      {pattern === "orbs" && (
        <>
          <div className="foil-orb" style={{top:"-30%", left:"-5%", width:380, height:380}}></div>
          <div className="foil-orb" style={{bottom:"-40%", right:"-5%", width:420, height:420}}></div>
          <div className="foil-orb" style={{top:"30%", left:"45%", width:240, height:240, opacity:0.6}}></div>
        </>
      )}
      {pattern === "flow" && (
        <svg viewBox="0 0 800 220" preserveAspectRatio="none" style={{position:"absolute", inset:0, width:"100%", height:"100%", mixBlendMode:"overlay", opacity:0.5}}>
          <defs>
            <linearGradient id="flowg" x1="0" x2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0"/>
              <stop offset="50%" stopColor="#fff" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[40,80,120,160].map((y,i)=>(
            <path key={i} d={`M 0 ${y} Q 200 ${y - 20 + i*10} 400 ${y + 10} T 800 ${y - 5}`} stroke="url(#flowg)" strokeWidth="1.4" fill="none"/>
          ))}
        </svg>
      )}
      <div className="foil-vignette"></div>
    </div>
  );
}

// Derive everything we display from the real user state.
function _useProfileDerived(me, history, friends) {
  const top = me.top_cards || [];
  const vault = history.length;
  const avgGrade = vault > 0
    ? +(history.reduce((s,h) => s + (h.psa_grade || 0), 0) / vault).toFixed(1)
    : 0;

  // Tier from vault size (purely derived; no separate field)
  const tier = vault >= 30 ? "Curator · Pro"
             : vault >= 15 ? "Curator"
             : vault >= 5  ? "Collector"
             : "Newcomer";

  // Estimated cap: count graded slabs × tier rate. Honest placeholder.
  const slabs = history.filter(h => (h.psa_grade || 0) >= 7).length;
  const capEur = slabs * 220;
  const marketCap = vault > 0 ? `≈€${capEur.toLocaleString("de-DE")}` : "—";

  // Recent activity: last 5 history rows.
  const recent = history.slice(0, 5).map(h => ({
    date: h.timestamp ? new Date(h.timestamp).toLocaleDateString("de-DE", {day:"2-digit", month:"short"}) : "—",
    verb: "Acquired",
    obj: `${h.card_name || "Unbenannte"} · ${h.card_set || "—"}`,
    res: h.psa_grade ? `PSA ${h.psa_grade}` : "",
  }));

  // Badges: derive from real state.
  const streakDays = Math.max(1, Math.floor((Date.now() - new Date(me.created_at).getTime()) / 86400000));
  const psa10 = history.filter(h => (h.psa_grade || 0) >= 10).length;
  const psa9plus = history.filter(h => (h.psa_grade || 0) >= 9).length;
  const badges = [
    { ic: "flame",   name: streakDays >= 100 ? "100 Days Forged" : "First Steps",
      sub: `${streakDays} day${streakDays === 1 ? "" : "s"} active`, tone: "amber",
      earned: true },
    { ic: "sparkle", name: "First PSA 10", sub: psa10 > 0 ? `${psa10} slab${psa10>1?"s":""}` : "Earn one PSA 10",
      tone: "holo", earned: psa10 > 0 },
    { ic: "vault",   name: "Vault Veteran", sub: `${vault} slab${vault===1?"":"s"}`,
      tone: "violet", earned: vault >= 20 },
    { ic: "flag",    name: "Founders Edition", sub: "Early member", tone: "mint",
      earned: streakDays >= 60 },
    { ic: "swap",    name: "Trade Open", sub: `${(friends || []).length} friends`,
      tone: "amber", earned: (friends || []).length > 0 },
    { ic: "chart",   name: "PSA 9+ Streak", sub: `${psa9plus} slabs`,
      tone: "mint", earned: psa9plus >= 5 },
  ];

  return { top, vault, avgGrade, tier, marketCap, recent, badges };
}

function _initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0] || "?")[0] + (parts[1] || "")[0] || "").toUpperCase().slice(0, 2);
}

function ScreenMyProfile({ go, appState }) {
  const me = appState.me;
  const history = appState.history || [];
  const friends = appState.friends || [];
  const cardImages = appState.cardImages || {};
  const [editing, setEditing] = uXS(false);
  const [sharing, setSharing] = uXS(false);
  const [pickingSlot, setPickingSlot] = uXS(null);

  // Customization persists in `settings.profile` on the user record.
  const persisted = me?.settings?.profile || {};
  const [state, setState] = uXS({ ...DEFAULT_PROFILE_CUSTOM, ...persisted });

  // Debounced save when state changes (skip first render after login).
  uXE(() => {
    if (!me) return;
    const t = setTimeout(() => {
      window.HoloAPI.updateMe({ settings: { ...(me.settings || {}), profile: state } })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [state]);

  if (!me) return <div className="content"><PageHead title="Loading"/></div>;

  const foil = PROFILE_FOILS[state.foil] || PROFILE_FOILS.aurora;
  const accent = PROFILE_ACCENTS[state.accent] || PROFILE_ACCENTS.mint;
  const accentCss = { "--p-accent": accent.color, "--p-accent-text": accent.text };

  const { top, vault, avgGrade, tier, marketCap, recent, badges }
    = _useProfileDerived(me, history, friends);

  // Map top_cards (session ids) to grail entries.
  const grails = top.slice(0, 3).map((sid, i) => {
    const row = history.find(h => h.id === sid);
    if (!row) return null;
    const img = cardImages[sid] || (row.thumbnail_b64 ? `data:image/jpeg;base64,${row.thumbnail_b64}` : "");
    return {
      id: row.id, rank: String(i+1).padStart(2, "0"),
      name: row.card_name || "Unbenannte Karte",
      set: row.card_set || "—",
      grade: row.psa_grade || 0,
      img,
      quote: "", // placeholder — could be editable per-grail in a future iteration
      acq: row.timestamp ? `Owned · ${new Date(row.timestamp).toLocaleDateString("de-DE", {month:"short", year:"numeric"})}` : "Owned",
      price: row.psa_grade ? `PSA ${row.psa_grade}` : "—",
    };
  }).filter(Boolean);

  // Favourites = next 6 cards from history (after grails) — simple, real, automatic.
  const grailIds = new Set(top);
  const favourites = history.filter(h => !grailIds.has(h.id)).slice(0, 6).map(h => ({
    id: h.id,
    name: h.card_name || "Unbenannte",
    set: h.card_set || "—",
    grade: (h.psa_grade || 0) / 1, // PSA whole grade
    img: cardImages[h.id] || (h.thumbnail_b64 ? `data:image/jpeg;base64,${h.thumbnail_b64}` : ""),
  }));

  const wishlist = state.wishlist || [];

  const setSlot = async (slot, sid) => {
    const next = [...top];
    while (next.length <= slot) next.push(null);
    next[slot] = sid;
    await window.HoloAPI.updateMe({ top_cards: next.filter(Boolean) });
    await window.HoloAPI.refreshMe();
    window.HoloAPI.toast("Holy grails", "Karte gesetzt.");
    setPickingSlot(null);
  };

  return (
    <div className="profile-screen" style={accentCss}>
      {/* HERO BANNER */}
      <div className="profile-banner fade-up">
        <FoilCanvas foil={foil} pattern={state.pattern}/>
        <div className="profile-banner-inner">
          <div className="row-between" style={{alignItems:"flex-start"}}>
            <span className="chip holo"><span className="dot"></span>· Public profile</span>
            <div className="row" style={{gap:8}}>
              <button className="btn btn-ghost btn-on-foil" onClick={() => setEditing(true)}>
                <Ic k="cog" s={13}/> Customize
              </button>
              <button className="btn-on-foil-solid" onClick={() => setSharing(true)}>
                <Ic k="upload" s={13}/> Share profile
              </button>
            </div>
          </div>
        </div>
        <div className="profile-banner-shadow"></div>
      </div>

      {/* IDENTITY ROW */}
      <div className="profile-id-v2">
        <div className="profile-avatar-v2">
          <div className="profile-avatar-inner" style={{backgroundImage: foil.css}}>
            {me.avatar && me.avatar.startsWith("/")
              ? <img className="pa-img" src={me.avatar} alt={me.display_name} draggable="false"/>
              : <span className="pa-init">{_initials(me.display_name || me.username)}</span>}
          </div>
        </div>
        <div style={{flex:1, minWidth:0}}>
          <div className="row" style={{gap:12, alignItems:"baseline", flexWrap:"wrap"}}>
            <h1 className="profile-name-v2">{me.display_name}</h1>
            <span className="mono" style={{fontSize:13, color:"var(--text-3)", letterSpacing:"0.04em"}}>@{me.username}</span>
            <span className="chip" style={{borderColor:"var(--p-accent)", color:"var(--p-accent)"}}>
              <span className="dot"></span>{tier}
            </span>
          </div>
          <div className="row" style={{gap:18, marginTop:10, fontSize:13, color:"var(--text-3)", flexWrap:"wrap"}}>
            {state.location && <span className="row" style={{gap:6}}><Ic k="flag" s={12}/>{state.location}</span>}
            <span className="row" style={{gap:6}}><Ic k="flame" s={12}/>Member since {new Date(me.created_at).toLocaleDateString("de-DE", {month:"short", year:"numeric"})}</span>
            <span className="row" style={{gap:6}}><Ic k="vault" s={12}/>{vault} slab{vault===1?"":"s"}</span>
          </div>
          <p className="profile-bio-v2">{me.bio || "Bio in Settings setzen — erscheint hier und im öffentlichen Profil."}</p>
        </div>
        <div className="profile-meta-stats">
          {[
            ["Friends", friends.length],
            ["Avg",     avgGrade > 0 ? avgGrade.toFixed(1) : "—"],
            ["Vault",   vault],
          ].map(([l, v]) => (
            <div key={l}>
              <div className="pmeta-v">{v}</div>
              <div className="pmeta-l">{l}</div>
            </div>
          ))}
          <button className="btn btn-mono" style={{marginTop:6}} onClick={() => go("settings")}>
            <Ic k="cog" s={12}/> Edit
          </button>
        </div>
      </div>

      {/* STATS BAND */}
      <div className="profile-stats-v2">
        <div className="pst">
          <div className="pst-l">Vault size</div>
          <div className="pst-v">{vault}<span className="pst-u"> slab{vault===1?"":"s"}</span></div>
        </div>
        <div className="pst">
          <div className="pst-l">Estimated cap</div>
          <div className="pst-v" style={{color:"var(--p-accent)"}}>{marketCap}</div>
        </div>
        <div className="pst">
          <div className="pst-l">Avg. grade</div>
          <div className="pst-v">{avgGrade > 0 ? avgGrade.toFixed(1) : "—"}</div>
        </div>
        <div className="pst">
          <div className="pst-l">Holy grails</div>
          <div className="pst-v">{grails.length}<span className="pst-u"> / 3 pinned</span></div>
        </div>
      </div>

      {/* HOLY GRAILS */}
      <section className="section">
        <div className="section-hd">
          <div>
            <div className="panel-num">· 01 · Pinned to the top</div>
            <h2 className="section-title" style={{marginTop:6}}>Holy grails</h2>
          </div>
          <div className="row" style={{gap:8}}>
            <span className="chip mint"><span className="dot"></span>{grails.length} pinned</span>
            <button className="btn btn-mono" onClick={() => setPickingSlot(grails.length)}>
              <Ic k="plus" s={12}/> Pin a card
            </button>
          </div>
        </div>

        <GrailsView
          layout={state.grails}
          grails={grails}
          openCard={(id) => go("card", { sessionId: id })}
          onPick={(slot) => setPickingSlot(slot)}
          onClear={async (slot) => {
            const next = [...top]; next[slot] = null;
            await window.HoloAPI.updateMe({ top_cards: next.filter(Boolean) });
            await window.HoloAPI.refreshMe();
          }}
        />
      </section>

      {/* FAVOURITES */}
      <section className="section">
        <div className="panel">
          <div className="panel-hd">
            <div>
              <div className="panel-num">· 02 · Showcase</div>
              <div className="panel-title" style={{marginTop:4}}>Favourite cards</div>
            </div>
            <div className="row" style={{gap:8}}>
              <div className="panel-meta">{favourites.length} from your vault</div>
              <button className="btn btn-mono" onClick={() => go("collection")}>
                <Ic k="vault" s={12}/> Vault
              </button>
            </div>
          </div>
          {favourites.length === 0 ? (
            <div className="muted" style={{padding:"24px 0", textAlign:"center", fontSize:13}}>
              Noch keine Karten — scanne ein paar in der Sammlung.
            </div>
          ) : (
            <div className="fav-grid-wide">
              {favourites.map(c => (
                <div key={c.id} className="fav-item" onClick={() => go("card", { sessionId: c.id })}>
                  <MouseTilt max={16}>
                    <div className="fav-card">
                      {c.img && <img src={c.img} alt={c.name} onError={(e)=>e.target.style.display="none"}/>}
                      <div className="profile-tilt-prism"></div>
                      <div className="profile-tilt-gloss"></div>
                    </div>
                  </MouseTilt>
                  {c.grade > 0 && <div className="fav-grade-pill">PSA {c.grade}</div>}
                  <div className="fav-info">
                    <div style={{fontWeight:600, fontSize:13}}>{c.name}</div>
                    <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", letterSpacing:"0.04em", marginTop:2}}>{c.set}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* WISHLIST + BADGES */}
      {(state.showWishlist || state.showBadges) && (
        <div className="grid-2 section" style={{alignItems:"stretch"}}>
          {state.showWishlist && (
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <div className="panel-num">· 03 · Open hunt</div>
                  <div className="panel-title" style={{marginTop:4}}>Wishlist</div>
                </div>
                <span className="chip amber"><span className="dot"></span>open to offers</span>
              </div>
              {wishlist.length === 0 ? (
                <div className="muted" style={{padding:"14px 0 4px", fontSize:13}}>
                  Lege Karten an, die du jagst — sichtbar im Public-Profil.
                </div>
              ) : (
                <div className="col" style={{gap:0}}>
                  {wishlist.map((w, i) => (
                    <div key={i} className="row" style={{padding:"10px 0", borderBottom: i < wishlist.length - 1 ? "1px solid var(--line)" : "none"}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:500, fontSize:13.5}}>{w.name}</div>
                        <div className="muted" style={{fontSize:11.5}}>{w.note}</div>
                      </div>
                      <div className="mono" style={{fontSize:12, color:"var(--p-accent)"}}>{w.budget}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:12}}
                      onClick={() => {
                        const name = prompt("Karten-Name?"); if (!name) return;
                        const note = prompt("Notiz (z. B. 'PSA 9 only')?") || "";
                        const budget = prompt("Budget (z. B. €500)?") || "Open";
                        setState({...state, wishlist: [...wishlist, { name, note, budget }]});
                      }}>
                <Ic k="plus" s={12}/> Add to hunt
              </button>
            </div>
          )}

          {state.showBadges && (
            <div className="panel">
              <div className="panel-hd">
                <div>
                  <div className="panel-num">· 04 · Earned</div>
                  <div className="panel-title" style={{marginTop:4}}>Badges</div>
                </div>
                <div className="panel-meta">
                  {badges.filter(b => b.earned).length}/{badges.length}
                </div>
              </div>
              <div className="badge-grid">
                {badges.map((b, i) => (
                  <div key={i} className={"badge-card " + b.tone + (b.earned ? "" : " locked")}>
                    <span className="badge-ic"><Ic k={b.ic} s={18}/></span>
                    <div>
                      <div style={{fontWeight:600, fontSize:13}}>{b.name}</div>
                      <div className="mono" style={{fontSize:10, color:"var(--text-3)", letterSpacing:"0.06em", marginTop:2}}>{b.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRADE CIRCLE + ACTIVITY */}
      <div className="grid-2 section" style={{alignItems:"flex-start"}}>
        {state.showFriends && (
          <div className="panel">
            <div className="panel-hd">
              <div>
                <div className="panel-num">· 05 · Trade circle</div>
                <div className="panel-title" style={{marginTop:4}}>Friends</div>
              </div>
              <button className="btn btn-mono" onClick={() => go("friends")}>All friends →</button>
            </div>
            {friends.length === 0 ? (
              <div className="muted" style={{padding:"14px 0", fontSize:13}}>
                Folge anderen Sammlern via Cmd+K.
              </div>
            ) : (
              <div className="col" style={{gap:10}}>
                {friends.slice(0, 6).map((f, i) => (
                  <div key={i} className="friend-row">
                    <div className="friend-avatar-v2">
                      {f.avatar && f.avatar.startsWith("/")
                        ? <img src={f.avatar} alt=""/>
                        : (f.display_name || f.username || "?")[0].toUpperCase()}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:600, fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>@{f.username}</div>
                      <div className="muted" style={{fontSize:11.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.display_name || ""}</div>
                    </div>
                    <button className="btn btn-mono" style={{padding:"6px 10px"}}
                            onClick={() => go("publicprofile", { publicUsername: f.username })}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state.showActivity && (
          <div className="panel">
            <div className="panel-hd">
              <div>
                <div className="panel-num">· 06 · Latest scans</div>
                <div className="panel-title" style={{marginTop:4}}>Activity</div>
              </div>
              <div className="panel-meta">Public</div>
            </div>
            {recent.length === 0 ? (
              <div className="muted" style={{padding:"14px 0", fontSize:13}}>
                Noch keine Aktivität — scanne deine erste Karte.
              </div>
            ) : (
              <div className="col" style={{gap:0}}>
                {recent.map((a, i) => (
                  <div key={i} className="row" style={{padding:"12px 0", borderBottom: i < recent.length - 1 ? "1px solid var(--line)" : "none", alignItems:"flex-start"}}>
                    <div className="mono" style={{fontSize:10.5, color:"var(--text-4)", width:64, flexShrink:0, paddingTop:2, letterSpacing:"0.04em"}}>{a.date}</div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                        <span className="mono" style={{fontSize:10.5, color:"var(--p-accent)", letterSpacing:"0.14em", textTransform:"uppercase", marginRight:8}}>{a.verb}</span>
                        {a.obj}
                      </div>
                      {a.res && <div className="muted" style={{fontSize:11.5, marginTop:2}}>{a.res}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && <CustomizeRail state={state} set={setState} onClose={() => setEditing(false)}/>}
      {sharing && <ShareProfileModal me={me} foil={PROFILE_FOILS.aurora}
                     stats={{ vault, avgGrade, friends: friends.length }}
                     onClose={() => setSharing(false)}/>}

      {pickingSlot != null && (
        <div className="holo-modal-back" onClick={() => setPickingSlot(null)}>
          <div className="holo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-hd">
              <div className="panel-title">Karte für Grail #{pickingSlot+1}</div>
              <div className="panel-meta">aus deiner Sammlung</div>
            </div>
            <div className="vitrine-pick-list">
              {history.length === 0 && <div className="muted" style={{padding:14, fontSize:13}}>Noch keine Karten — scanne zuerst eine Karte.</div>}
              {history.map(h => (
                <div key={h.id} className="vitrine-pick-row" onClick={() => setSlot(pickingSlot, h.id)}>
                  <div className="vitrine-pick-thumb">
                    {(cardImages[h.id] || h.thumbnail_b64) && (
                      <img src={cardImages[h.id] || `data:image/jpeg;base64,${h.thumbnail_b64}`}/>
                    )}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:600}}>{h.card_name || "Unbenannte"}</div>
                    <div className="muted" style={{fontSize:12}}>{h.card_set || "—"} · PSA {h.psa_grade || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GrailsView({ layout, grails, openCard, onPick, onClear }) {
  // pad to 3 slots so empty positions still render as "+ pin a card"
  const slots = [0, 1, 2].map(i => grails[i] || null);

  const TiltImg = ({ src, alt, className }) => (
    <MouseTilt max={18} className={className}>
      <div className="grail-img-inner">
        {src && <img src={src} alt={alt} draggable="false"/>}
        <div className="profile-tilt-prism"></div>
        <div className="profile-tilt-gloss"></div>
      </div>
    </MouseTilt>
  );

  if (layout === "stack") {
    return (
      <div className="col" style={{gap:14}}>
        {slots.map((g, i) => g ? (
          <div key={g.id} className="grail-stack" onClick={() => openCard(g.id)} style={{cursor:"pointer"}}>
            <div className="grail-rank">{g.rank}</div>
            <div className="grail-stack-tilt"><TiltImg src={g.img} alt={g.name}/></div>
            <div style={{minWidth:0}}>
              <div className="grail-name" style={{fontSize:22}}>{g.name}</div>
              <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", letterSpacing:"0.06em", marginTop:2}}>{g.set}</div>
            </div>
            <div style={{textAlign:"right", flexShrink:0}}>
              <span className="chip" style={{borderColor:"var(--p-accent)", color:"var(--p-accent)"}}>{g.acq}</span>
              <div className="mono" style={{fontSize:11.5, color:"var(--text-2)", marginTop:6}}>{g.price}</div>
            </div>
          </div>
        ) : (
          <div key={i} className="grail-empty" onClick={() => onPick(i)}>
            <Ic k="plus" s={20}/><span style={{marginTop:6}}>Pin grail #{i+1}</span>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "row") {
    return (
      <div className="grid-3" style={{gap:16}}>
        {slots.map((g, i) => g ? (
          <div key={g.id} className="grail-pod" onClick={() => openCard(g.id)} style={{cursor:"pointer"}}>
            <div className="grail-rank">{g.rank}</div>
            <div className="grail-img-wrap"><TiltImg src={g.img} alt={g.name}/></div>
            <div className="grail-meta">
              <div className="grail-name" style={{fontSize:22}}>{g.name}</div>
              <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", letterSpacing:"0.06em", marginTop:2}}>{g.set}</div>
            </div>
          </div>
        ) : (
          <div key={i} className="grail-empty" onClick={() => onPick(i)}>
            <Ic k="plus" s={20}/><span style={{marginTop:6}}>Pin grail #{i+1}</span>
          </div>
        ))}
      </div>
    );
  }

  // Default: podium — 2nd, 1st, 3rd order with center elevated
  const order = [slots[1], slots[0], slots[2]];
  const heights = [380, 440, 360];
  const isCenter = (i) => i === 1;
  const slotIndex = [1, 0, 2];
  return (
    <div className="grail-podium">
      {order.map((g, i) => g ? (
        <div key={g.id}
             className={"grail-pod" + (isCenter(i) ? " center" : "")}
             style={{minHeight: heights[i], cursor:"pointer"}}
             onClick={() => openCard(g.id)}>
          <div className="grail-rank">{g.rank}</div>
          <div className="grail-img-wrap"><TiltImg src={g.img} alt={g.name}/></div>
          <div className="grail-meta">
            <div className="grail-name">{g.name}</div>
            <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", letterSpacing:"0.06em", marginTop:2}}>{g.set}</div>
            <div className="row-between" style={{marginTop:14, paddingTop:12, borderTop:"1px solid var(--line)"}}>
              <span className="chip" style={{borderColor:"var(--p-accent)", color:"var(--p-accent)"}}>{g.acq}</span>
              <span className="mono" style={{fontSize:11.5, color:"var(--text-2)"}}>{g.price}</span>
            </div>
          </div>
        </div>
      ) : (
        <div key={i} className="grail-empty"
             style={{minHeight: heights[i]}}
             onClick={() => onPick(slotIndex[i])}>
          <Ic k="plus" s={20}/><span style={{marginTop:6}}>Pin grail #{slotIndex[i]+1}</span>
        </div>
      ))}
    </div>
  );
}

function CustomizeRail({ state, set, onClose }) {
  return (
    <div className="custom-rail">
      <div className="custom-panel">
        <div className="row-between" style={{marginBottom:4}}>
          <div>
            <div className="panel-num">· Profile · Customize</div>
            <div className="panel-title" style={{fontSize:18, marginTop:4}}>Make it yours.</div>
          </div>
          <button className="topbar-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Banner foil</div>
          <div className="row" style={{flexWrap:"wrap", gap:10}}>
            {Object.entries(PROFILE_FOILS).map(([k, f]) => (
              <button key={k} className={"foil-chip" + (state.foil === k ? " on" : "")}
                      onClick={() => set({...state, foil: k})}>
                <span className="foil-chip-bar" style={{backgroundImage: f.css}}></span>
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Pattern</div>
          <div className="row" style={{gap:8}}>
            {[{k:"flow", l:"Flow"}, {k:"grid", l:"Grid"}, {k:"rays", l:"Rays"}, {k:"orbs", l:"Orbs"}].map(p => (
              <button key={p.k} className={"seg-btn" + (state.pattern === p.k ? " on" : "")}
                      onClick={() => set({...state, pattern: p.k})}>{p.l}</button>
            ))}
          </div>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Accent signal</div>
          <div className="row" style={{gap:10}}>
            {Object.entries(PROFILE_ACCENTS).map(([k, a]) => (
              <button key={k} className={"acc-dot" + (state.accent === k ? " on" : "")}
                      onClick={() => set({...state, accent: k})}
                      style={{background: a.color, color: a.color}}
                      title={a.name}/>
            ))}
          </div>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Grails layout</div>
          <div className="row" style={{gap:8}}>
            {[{k:"podium", l:"Podium"}, {k:"row", l:"Triptych"}, {k:"stack", l:"Stack"}].map(p => (
              <button key={p.k} className={"seg-btn" + (state.grails === p.k ? " on" : "")}
                      onClick={() => set({...state, grails: p.k})}>{p.l}</button>
            ))}
          </div>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Location</div>
          <input type="text"
                 placeholder="z. B. Hamburg, DE"
                 value={state.location || ""}
                 onChange={e => set({...state, location: e.target.value})}
                 style={{padding:"8px 12px", border:"1px solid var(--line)", background:"var(--surf)", color:"var(--text)", borderRadius:8, fontSize:13, fontFamily:"inherit"}}/>
        </div>

        <div className="cust-sec">
          <div className="cust-lab">Show</div>
          <div className="col" style={{gap:8}}>
            {[
              ["showWishlist", "Wishlist"],
              ["showFriends",  "Trade circle"],
              ["showActivity", "Recent activity"],
              ["showBadges",   "Badges"],
            ].map(([k, l]) => (
              <label key={k} className="cust-toggle">
                <input type="checkbox" checked={!!state[k]} onChange={e => set({...state, [k]: e.target.checked})}/>
                <span className="cust-toggle-track"><span className="cust-toggle-knob"></span></span>
                <span>{l}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="cust-sec" style={{borderTop:"1px solid var(--line)", paddingTop:14, marginTop:6}}>
          <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", letterSpacing:"0.14em"}}>
            · Änderungen werden automatisch gespeichert.
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareProfileModal({ me, foil, stats, onClose }) {
  const [copied, setCopied] = uXS(false);
  const link = `${window.location.origin}/#profile/${me.username}`;
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { /* noop */ }
  };
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-card" onClick={e => e.stopPropagation()}>
        <div className="row-between" style={{marginBottom:18}}>
          <div>
            <div className="panel-num">· Share profile</div>
            <div className="panel-title" style={{fontSize:18, marginTop:4}}>Send your card to a collector.</div>
          </div>
          <button className="topbar-btn" onClick={onClose}>×</button>
        </div>

        <div className="share-slab">
          <FoilCanvas foil={foil} pattern="orbs"/>
          <div className="share-slab-content">
            <div className="row" style={{alignItems:"center", gap:12}}>
              <div style={{width:44, height:44, borderRadius:12, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--display)", fontWeight:700, fontSize:16, color:"#fff"}}>
                {_initials(me.display_name || me.username)}
              </div>
              <div>
                <div className="display" style={{fontSize:18}}>@{me.username}</div>
                <div className="mono" style={{fontSize:10.5, color:"rgba(255,255,255,0.7)", letterSpacing:"0.12em", textTransform:"uppercase"}}>MeckGrade</div>
              </div>
            </div>
            <div className="share-stat-row">
              <div><div className="ssr-v">{stats.vault}</div><div className="ssr-l">Vault</div></div>
              <div><div className="ssr-v">{stats.avgGrade > 0 ? stats.avgGrade.toFixed(1) : "—"}</div><div className="ssr-l">Avg grade</div></div>
              <div><div className="ssr-v">{stats.friends}</div><div className="ssr-l">Friends</div></div>
            </div>
          </div>
        </div>

        <div className="share-link">
          <Ic k="lock" s={12}/>
          <span className="mono" style={{fontSize:12.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1}}>{link}</span>
          <button className="btn btn-mono" style={{padding:"6px 12px"}} onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="row" style={{gap:10, marginTop:14}}>
          <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}}
                  onClick={() => { window.open("https://discord.com/channels/@me", "_blank"); }}>Discord</button>
          <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}}
                  onClick={() => { window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent("My MeckGrade vault")}`, "_blank"); }}>X / Twitter</button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// ──────────────────────────── PUBLIC PROFILE ────────────────────────────
function ScreenPublicProfile({ go, appState }) {
  const username = appState.publicProfile?.username;
  const [data, setData] = uXS(null);
  const [cards, setCards] = uXS([]);
  const [error, setError] = uXS(null);

  uXE(() => {
    if (!username) return;
    window.HoloAPI.getPublicProfile(username).then(setData).catch(e => setError(e.message));
    window.HoloAPI.getPublicCards(username).then(setCards).catch(() => {});
  }, [username]);

  if (error) return <div className="content"><PageHead title='Profile not found.' sub={error}/></div>;
  if (!data) return <div className="content"><PageHead title='<em>Loading…</em>'/></div>;

  const topRows = (data.top_cards || []).map(sid => cards.find(c => c.id === sid)).filter(Boolean);
  const isMe = appState.me && appState.me.username === username;
  const followed = (appState.friends || []).some(f => f.username === username);

  const toggleFollow = async () => {
    if (followed) {
      await window.HoloAPI.removeFriend(username);
      window.HoloAPI.toast("Entfolgt", `@${username}`);
    } else {
      await window.HoloAPI.addFriend(username);
      window.HoloAPI.toast("Folgst jetzt", `@${username}`);
    }
    window.HoloAPI.refreshFriends();
  };

  return (
    <div>
      <PageHead
        eyebrow={`Public · @${data.username}`}
        title={`<em>${escapeHtml(data.display_name)}.</em>`}
        sub={data.bio || "—"}
        actions={isMe
          ? <button className="btn btn-glow" onClick={() => go("settings")}>Profil bearbeiten</button>
          : <button className={"btn " + (followed ? "btn-ghost" : "btn-glow")} onClick={toggleFollow}>{followed ? "Entfolgen" : "Folgen"}</button>
        }
      />

      <div className="profile-hero">
        <Avatar value={data.avatar} size={96} className="profile-avatar-img"/>
        <div>
          <div className="profile-handle">@{data.username}</div>
          <div className="profile-since">Seit {new Date(data.created_at).toLocaleDateString("de-DE")}</div>
        </div>
      </div>

      {topRows.length > 0 && (
        <div className="section">
          <div className="section-hd">
            <div className="section-title">Vitrine · Top {topRows.length}</div>
            <div className="panel-meta">die besten Stücke</div>
          </div>
          <div className="vitrine-grid public">
            {topRows.map((row, i) => (
              <div key={row.id} className="vitrine-slot">
                <div className="vitrine-card glow">
                  {row.thumbnail_b64 && <img src={`data:image/jpeg;base64,${row.thumbnail_b64}`}/>}
                  <div className="vitrine-rank holo">{i + 1}</div>
                </div>
                <div className="vitrine-name">{row.card_name}</div>
                <div className="vitrine-meta">{row.card_set} · PSA {row.psa_grade}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section panel">
        <div className="panel-hd"><div className="panel-title">Sammlung · {cards.length}</div><div className="panel-meta">öffentlich</div></div>
        {cards.length === 0 ? (
          <div className="muted" style={{padding:20, textAlign:"center"}}>Keine öffentlichen Karten.</div>
        ) : (
          <div className="public-card-grid">
            {cards.slice(0, 24).map(c => (
              <div key={c.id} className="public-card">
                {c.thumbnail_b64 && <img src={`data:image/jpeg;base64,${c.thumbnail_b64}`}/>}
                <div className="public-card-name">{c.card_name || "—"}</div>
                <div className="public-card-grade">PSA {c.psa_grade || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────── FRIENDS ────────────────────────────
function ScreenFriends({ go, appState }) {
  const friends = appState.friends || [];
  const [q, setQ] = uXS("");
  const [results, setResults] = uXS([]);

  uXE(() => {
    if (q.trim().length < 1) { setResults([]); return; }
    window.HoloAPI.searchUsers(q).then(r => setResults(r.results || []));
  }, [q]);

  const follow = async (username) => {
    await window.HoloAPI.addFriend(username);
    window.HoloAPI.toast("Folgst jetzt", `@${username}`);
    window.HoloAPI.refreshFriends();
  };
  const unfollow = async (username) => {
    await window.HoloAPI.removeFriend(username);
    window.HoloAPI.refreshFriends();
  };

  return (
    <div>
      <PageHead
        eyebrow="08 · Account · Friends"
        title='<em>Friends</em> & Trades.'
        sub="Folge anderen Sammlern, sieh ihre Vitrine an, schick ihnen Trade-Vorschläge."
      />

      <div className="panel">
        <div className="panel-hd"><div className="panel-title">Suche</div><div className="panel-meta">Username oder Anzeigename</div></div>
        <div className="row" style={{gap:8}}>
          <input className="input" style={{flex:1}} placeholder="Username eingeben…" value={q} onChange={(e) => setQ(e.target.value)}/>
        </div>
        {results.length > 0 && (
          <div style={{marginTop:14}}>
            {results.map(u => {
              const isFollowed = friends.some(f => f.username === u.username);
              const isMe = appState.me?.username === u.username;
              return (
                <div key={u.username} className="row" style={{padding:"10px 0", borderBottom:"1px solid var(--line)"}}>
                  <Avatar value={u.avatar} size={36}/>
                  <div style={{flex:1, cursor:"pointer"}} onClick={() => go("publicprofile", { publicUsername: u.username })}>
                    <div style={{fontWeight:600}}>{u.display_name}</div>
                    <div className="muted" style={{fontSize:12}}>@{u.username}</div>
                  </div>
                  {!isMe && (isFollowed
                    ? <button className="btn btn-ghost" onClick={() => unfollow(u.username)}>Entfolgen</button>
                    : <button className="btn btn-glow" onClick={() => follow(u.username)}>Folgen</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section panel">
        <div className="panel-hd"><div className="panel-title">Folge ich · {friends.length}</div><div className="panel-meta">live</div></div>
        {friends.length === 0 ? (
          <div className="muted" style={{padding:20, textAlign:"center"}}>Du folgst noch niemandem. Such oben nach Username.</div>
        ) : (
          <div className="friends-grid">
            {friends.map(f => (
              <div key={f.username} className="friend-card" onClick={() => go("publicprofile", { publicUsername: f.username })}>
                <Avatar value={f.avatar} size={64} className="friend-avatar"/>
                <div className="friend-name">{f.display_name}</div>
                <div className="muted" style={{fontSize:11}}>@{f.username}</div>
                {f.bio && <div className="friend-bio">{f.bio}</div>}
                <div className="muted mono" style={{fontSize:10, marginTop:8}}>{(f.top_cards || []).length} Vitrine-Karten</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────── SETS (real, browseable) ────────────────────────────
function ScreenSets({ go, appState }) {
  const { useState: uSS, useEffect: uSE } = React;
  const history = appState?.history || [];
  const [search, setSearch] = uSS("");
  const [setMeta, setSetMeta] = uSS({});

  const buckets = {};
  history.forEach(h => {
    const s = h.card_set || "Unbekannt";
    if (!buckets[s]) buckets[s] = [];
    buckets[s].push(h);
  });

  const setNames = Object.keys(buckets)
    .filter(n => !search || n.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (buckets[b]?.length || 0) - (buckets[a]?.length || 0));

  uSE(() => {
    const lang = appState?.me?.settings?.card_language || "de";
    const missing = setNames.filter(n => !setMeta[n] && n !== "Unbekannt").slice(0, 8);
    if (missing.length === 0) return;
    missing.forEach((name, i) => {
      setTimeout(async () => {
        try {
          const r = await window.HoloAPI.searchSets(name, lang);
          const match = (r.results || []).find(s =>
            s.name.toLowerCase() === name.toLowerCase() ||
            s.name.toLowerCase().includes(name.toLowerCase().slice(0, 6))
          );
          setSetMeta(m => ({...m, [name]: match || {}}));
        } catch { setSetMeta(m => ({...m, [name]: {}})); }
      }, i * 400);
    });
  }, [history.length, search]);

  return (
    <div>
      <PageHead
        eyebrow="07 · Vault · Sets"
        title='<em>Sets</em> & Completion.'
        sub="Deine Sammlung gruppiert nach Set — mit Set-Logo, Vault-Fortschritt und Gesamt-Anzahl aus TCGdex."
      />
      <input className="input" placeholder="Set suchen…" value={search}
             onChange={e => setSearch(e.target.value)} style={{marginBottom:16}}/>
      {setNames.length === 0 ? (
        <div className="panel" style={{padding:48, textAlign:"center"}}>
          <div className="muted">Noch keine Karten — leg los mit New scan.</div>
          <button className="btn btn-glow" style={{marginTop:18}} onClick={() => go("analyze")}>Karte scannen</button>
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16}}>
          {setNames.map(setName => {
            const rows = buckets[setName] || [];
            const meta = setMeta[setName] || {};
            const bestGrade = rows.reduce((b, h) => Math.max(b, h.psa_grade || 0), 0);
            return (
              <div key={setName} className="panel" style={{padding:18, cursor:"pointer"}}
                   onClick={() => go("collection")}>
                {meta.logo ? (
                  <img src={meta.logo} alt={setName}
                       style={{height:40, width:"auto", maxWidth:"100%", objectFit:"contain", marginBottom:12, display:"block"}}
                       onError={e => e.target.style.display="none"}/>
                ) : (
                  <div style={{height:40, marginBottom:12, display:"flex", alignItems:"center"}}>
                    <span style={{fontFamily:"var(--display)", fontWeight:700, fontSize:15, letterSpacing:"-0.01em"}}>{setName}</span>
                  </div>
                )}
                <div style={{fontWeight:600, fontSize:13.5, marginBottom:4}}>{setName}</div>
                {meta.serie && <div className="muted" style={{fontSize:11, marginBottom:8}}>{meta.serie}</div>}
                <div className="row" style={{gap:8, marginBottom:10, flexWrap:"wrap"}}>
                  <span className="chip mint" style={{fontSize:10}}><span className="dot"></span>{rows.length} im Vault</span>
                  {meta.total > 0 && <span className="chip" style={{fontSize:10}}>{meta.total} total</span>}
                </div>
                {meta.total > 0 && (
                  <div className="bar" style={{height:4}}>
                    <div className="bar-fill solid" style={{width: Math.min(100, (rows.length/meta.total)*100) + "%"}}></div>
                  </div>
                )}
                {bestGrade > 0 && (
                  <div className="mono" style={{fontSize:10, color:"var(--text-3)", marginTop:6}}>Best: PSA {bestGrade}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── NOTIFICATIONS DROPDOWN ────────────────────────────
function NotifDropdown({ appState, onClose, go }) {
  const items = appState.notifications || [];
  uXE(() => {
    if (items.some(i => !i.is_read)) {
      window.HoloAPI.markNotificationsRead();
    }
  }, []);
  return (
    <div className="notif-pop" onClick={(e) => e.stopPropagation()}>
      <div className="notif-head">
        <span>Notifications</span>
        <span className="muted mono" style={{fontSize:10}}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="notif-empty">Keine Benachrichtigungen.</div>
      ) : (
        <div className="notif-list">
          {items.map(n => (
            <div key={n.id} className={"notif-row " + (n.is_read ? "" : "unread")}>
              <div className="notif-dot" style={{background: kindColor(n.kind)}}></div>
              <div style={{flex:1, minWidth:0}}>
                <div className="notif-title">{n.title}</div>
                <div className="notif-body">{n.body}</div>
                <div className="notif-ts">{relTime(n.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function kindColor(kind) {
  return ({
    welcome: "var(--mint)",
    analysis_done: "var(--violet)",
    friend_request: "var(--holo-2)",
    watchlist_trigger: "var(--amber)",
  })[kind] || "var(--text-3)";
}
function relTime(iso) {
  const d = new Date(iso); const now = Date.now();
  const m = Math.round((now - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("de-DE");
}

window.CmdPalette = CmdPalette;
window.ScreenSettings = ScreenSettings;
window.ScreenMyProfile = ScreenMyProfile;
window.ScreenPublicProfile = ScreenPublicProfile;
window.ScreenFriends = ScreenFriends;
window.ScreenSets = ScreenSets;
window.NotifDropdown = NotifDropdown;
