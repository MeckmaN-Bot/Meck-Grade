// MeckGrade Holo — shell (sidebar, topbar, page head, common pieces)

const HData = window.HOLO_DATA;

// SVG icons (line, currentColor)
function Ic({ k, s = 16 }) {
  const p = {
    home:    "M3 11l9-8 9 8M5 10v10h14V10",
    scan:    "M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10",
    vault:   "M4 5h16v14H4zM8 9h8v6H8zM12 12h.01",
    submit:  "M4 4h12l4 4v12H4zM8 12h8M8 16h6",
    eye:     "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
    swap:    "M7 4l-4 4 4 4M3 8h14M17 12l4 4-4 4M21 16H7",
    pop:     "M3 20V10l9-6 9 6v10M9 20v-7h6v7",
    friends: "M16 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 0112 0v1M22 21v-1a4 4 0 00-3-3.87",
    set:     "M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4",
    bell:    "M6 8a6 6 0 1112 0v5l2 3H4l2-3V8zM10 19a2 2 0 004 0",
    plus:    "M12 5v14M5 12h14",
    arrow:   "M5 12h14M13 6l6 6-6 6",
    arrowdn: "M12 5v14M6 13l6 6 6-6",
    check:   "M5 12l5 5L20 7",
    trash:   "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
    cog:     "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.4-2.4 1a7.5 7.5 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.4 2.4-1a7.5 7.5 0 001.7 1L11 20.5h4l.4-2.5a7.5 7.5 0 001.7-1l2.4 1 2-3.4z",
    search:  "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
    cmd:     "M9 9h6v6H9zM9 9V6a3 3 0 10-3 3M15 9h3a3 3 0 10-3-3M15 15v3a3 3 0 103-3M9 15H6a3 3 0 103 3",
    upload:  "M12 16V4M6 10l6-6 6 6M4 20h16",
    lock:    "M6 11V8a6 6 0 1112 0v3M5 11h14v10H5z",
    sparkle: "M12 3l1.5 5L19 9.5l-5 2L12 17l-2-5.5L5 9.5l5.5-1.5L12 3z",
    play:    "M8 5l12 7-12 7V5z",
    flag:    "M5 3v18M5 4h13l-2 4 2 4H5",
    flame:   "M12 21a6 6 0 006-6c0-3-2-5-4-7-1 2-2 3-4 3 0-3 2-5 2-8-4 2-7 5-7 9a6 6 0 003 5",
    chart:   "M3 3v18h18M7 14l3-3 4 4 5-6"
  }[k];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={p}/>
    </svg>
  );
}

function Sidebar({ route, setRoute, appState }) {
  const collCount = appState?.history?.length ?? 0;
  const subCount  = appState?.submission?.length ?? 0;
  const watchCount = appState?.watchlist?.length ?? 0;
  const items = [
    { sec: "Workspace", rows: [
      { id: "dashboard",  ic: "home", label: "Dashboard" },
      { id: "analyze",    ic: "scan", label: "Analyze",   badge: "New" },
      { id: "collection", ic: "vault", label: "Collection", badge: collCount }
    ]},
    { sec: "Submission", rows: [
      { id: "submission", ic: "submit", label: "Builder",  badge: subCount || null },
      { id: "watchlist",  ic: "eye", label: "Watchlist", badge: watchCount || null },
      { id: "resub",      ic: "swap", label: "Crack & Resub" }
    ]},
    { sec: "Vault", rows: [
      { id: "population", ic: "pop", label: "Population" },
      { id: "sets",       ic: "set", label: "Sets" }
    ]},
    { sec: "Account", rows: [
      { id: "friends",    ic: "friends", label: "Friends" },
      { id: "settings",   ic: "cog", label: "Settings" }
    ]}
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <div className="brand-name">MeckGrade</div>
          <div className="brand-tag">Holo Lab · v0.6</div>
        </div>
      </div>

      {items.map((sec, i) => (
        <div key={i} className="nav-section">
          <div className="nav-label">{sec.sec}</div>
          <div className="col" style={{gap: 2}}>
            {sec.rows.map(r => (
              <div key={r.id}
                   className={"nav-item" + (route === r.id ? " active" : "")}
                   onClick={() => setRoute(r.id)}>
                <span className="nav-icon"><Ic k={r.ic}/></span>
                <span>{r.label}</span>
                {r.badge != null && <span className="nav-badge">{r.badge}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{flex:1}}></div>
      <div className="user-card" onClick={() => setRoute && setRoute("profile")} style={{cursor:"pointer"}}>
        <Avatar value={appState?.me?.avatar} size={36} className="user-avatar-slot"/>
        <div style={{minWidth:0}}>
          <div className="user-name">{appState?.me?.display_name || "Guest"}</div>
          <div className="user-tier">{appState?.me ? "@" + appState.me.username : "not signed in"}</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs, appState, go }) {
  const { useState, useEffect, useRef } = React;
  const [notifOpen, setNotifOpen] = useState(false);
  const popRef = useRef(null);
  const unread = appState?.notifUnread || 0;

  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    setTimeout(() => document.addEventListener("click", onClick), 50);
    return () => document.removeEventListener("click", onClick);
  }, [notifOpen]);

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "now" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-spacer"></div>
      <div className="topbar-search" onClick={() => window.HoloAPI.setState({ cmdK: true })}>
        <Ic k="search" s={14}/>
        <span style={{flex:1}}>Karten, Scans, Routes, User suchen…</span>
        <span className="kbd">⌘K</span>
      </div>
      <div ref={popRef} style={{position:"relative"}}>
        <button className="topbar-btn" onClick={() => setNotifOpen(!notifOpen)}>
          <Ic k="bell"/>
          {unread > 0 && <span className="topbar-badge">{unread}</span>}
        </button>
        {notifOpen && window.NotifDropdown && (
          <NotifDropdown appState={appState} go={go} onClose={() => setNotifOpen(false)}/>
        )}
      </div>
      <button className="topbar-btn" onClick={() => go && go("settings")}><Ic k="cog"/></button>
    </div>
  );
}

function PageHead({ eyebrow, title, sub, actions, live }) {
  return (
    <header className="page-head fade-up">
      <div>
        <div className="eyebrow">
          {live && <span className="pulse"></span>}
          <span>{eyebrow}</span>
        </div>
        <h1 className="page-title" dangerouslySetInnerHTML={{__html: title}}></h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function Sparkline({ data, w = 80, h = 28, color = "var(--mint)" }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) =>
    `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * h}`
  ).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={w} cy={h - ((data[data.length-1] - min) / (max - min || 1)) * h}
              r="2.5" fill={color}/>
    </svg>
  );
}

function Ticker({ appState }) {
  const history = (appState?.history || []).slice(0, 8);
  if (history.length === 0) {
    const items = [...HData.ticker, ...HData.ticker];
    return (
      <div className="ticker-wrap">
        <div className="ticker">
          {items.map((t, i) => (
            <span key={i}>
              <span style={{color:"var(--text)"}}>{t.name}</span>
              <span style={{margin:"0 8px", color:"var(--text-4)"}}>·</span>
              <span style={{color:"var(--text-2)"}}>{t.val}</span>
              <span style={{margin:"0 8px"}}>·</span>
              <span className={t.dir}>{t.d}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  const items = [...history, ...history];
  return (
    <div className="ticker-wrap">
      <div className="ticker">
        {items.map((h, i) => (
          <span key={i}>
            <span style={{color:"var(--text)"}}>{h.card_name || "Karte"}</span>
            <span style={{margin:"0 8px", color:"var(--text-4)"}}>·</span>
            <span style={{color:"var(--text-2)"}}>PSA {h.psa_grade || "—"}</span>
            <span style={{margin:"0 8px"}}>·</span>
            <span style={{color:"var(--text-3)"}}>{h.card_set || "—"}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Holo card visual with shimmer overlay
function CardImg({ src, holo = true, className = "" }) {
  return (
    <div className={"card-holo " + className}>
      <img src={src} alt="" draggable="false"/>
    </div>
  );
}

// Small grade pill
function GradePill({ g, large }) {
  const isMax = g >= 9.5;
  return (
    <div className={"coll-grade " + (isMax ? "holo" : "")} style={large ? {fontSize:18, padding:"6px 14px"} : {}}>
      {isMax ? <span>{g.toFixed(1)}</span> : g.toFixed(1)}
    </div>
  );
}

// Floating popup rendered at fixed coords below the input — escapes
// any parent stacking context / overflow:hidden completely.
function CardSearchPopup({ anchor, results, onPick }) {
  const { useState, useEffect } = React;
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const el = anchor.current; if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: r.width });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => { window.removeEventListener("scroll", compute, true); window.removeEventListener("resize", compute); };
  }, []);
  if (!pos) return null;
  return (
    <div className="card-search-pop card-search-pop-fixed"
         style={{ left: pos.left, top: pos.top, width: pos.width }}>
      {results.map(c => (
        <div key={c.id} className="card-search-row" onMouseDown={() => onPick(c)}>
          <div className="card-search-thumb">
            {c.image && <img src={c.image} alt="" onError={(e) => e.target.style.display='none'}/>}
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div className="card-search-name">{c.name}</div>
            <div className="card-search-meta">#{c.number || "—"} · {c.id}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Type-ahead card search (autocomplete) ────────────────────────────────
function CardSearch({ initial = "", onPick, onSearch, placeholder = "Karte suchen — z.B. Charizard, Glurak…", autoFocus = false }) {
  const { useState, useEffect, useRef } = React;
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await window.HoloAPI.searchCards(q);
        setResults(r.results || []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  const pick = (card) => {
    setOpen(false);
    setQ(card.name);
    if (onPick) onPick(card);
  };

  const submit = () => {
    if (!q.trim()) return;
    setOpen(false);
    if (onSearch) onSearch(q.trim());
  };

  return (
    <div style={{position:"relative"}}>
      <div className="row" style={{gap:8}}>
        <input
          ref={inputRef}
          className="input"
          style={{flex:1, padding:"10px 14px", fontSize:14}}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setOpen(false);
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        <button className="btn btn-ghost" onClick={submit} disabled={!q.trim() || loading}>
          {loading ? "…" : "Suchen"}
        </button>
      </div>
      {open && results.length > 0 && (
        <CardSearchPopup anchor={inputRef} results={results} onPick={pick}/>
      )}
    </div>
  );
}

// ─── Avatar (img if URL, else emoji) ──────────────────────────────────────
function Avatar({ value, size = 32, className = "" }) {
  const v = (value || "").trim();
  const isUrl = v && (v.startsWith("/") || v.startsWith("http"));
  const style = { width: size, height: size, fontSize: Math.round(size * 0.55) };
  if (isUrl) {
    return (
      <span className={"avatar-img " + className} style={style}>
        <img src={v} alt="" onError={(e) => { e.target.style.display = "none"; }}/>
      </span>
    );
  }
  return <span className={"avatar-emoji " + className} style={style}>{v || "✨"}</span>;
}

window.Ic = Ic;
window.Sidebar = Sidebar;
window.Topbar = Topbar;
window.PageHead = PageHead;
window.Sparkline = Sparkline;
window.Ticker = Ticker;
window.CardImg = CardImg;
window.GradePill = GradePill;
window.CardSearch = CardSearch;
window.Avatar = Avatar;
