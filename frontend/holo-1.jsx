// MeckGrade Holo — Screens A: Onboard, Dashboard, Analyze, Analyzing
const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR } = React;

// ─── Mouse-tracked dot grid ───────────────────────────────────────────────
function DotGridBackdrop() {
  const wrapRef = uR(null);
  const canvasRef = uR(null);
  const mouseRef = uR({ x: -1e6, y: -1e6, active: false });
  const animRef = uR(0);

  uE(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    // Listen on the parent panel so we still get mouse moves even though
    // the canvas wrapper itself is pointer-events:none (so it doesn't
    // block clicks on the hero / buttons).
    const host = wrap.parentElement;
    const ctx = cvs.getContext("2d");
    const STEP = 16;       // tighter raster
    const BASE_R = 0.5;    // tiny dots at rest
    const MAX_R = 2.6;     // modest max under cursor
    const FALLOFF = 110;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;

    const resize = () => {
      const r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      cvs.style.width  = `${w}px`;
      cvs.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, active: true };
    };
    const onLeave = () => { mouseRef.current = { x: -1e6, y: -1e6, active: false }; };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const m = mouseRef.current;
      const cols = Math.ceil(w / STEP) + 1;
      const rows = Math.ceil(h / STEP) + 1;
      for (let i = 0; i <= rows; i++) {
        for (let j = 0; j <= cols; j++) {
          const x = j * STEP;
          const y = i * STEP;
          const dx = x - m.x, dy = y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const t = m.active ? Math.max(0, 1 - dist / FALLOFF) : 0;
          const r = BASE_R + (MAX_R - BASE_R) * (t * t);
          const a = 0.06 + t * 0.32;
          const hue = 270 + t * 60;
          ctx.fillStyle = t > 0.05
            ? `hsla(${hue}, 80%, 76%, ${a})`
            : `rgba(244, 242, 238, ${a * 0.5})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };

    resize();
    tick();

    window.addEventListener("resize", resize);
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="onboard-dotgrid-host" style={{position:"absolute", inset:0, zIndex:-1, pointerEvents:"none"}}>
      <canvas ref={canvasRef} className="onboard-dotgrid"/>
    </div>
  );
}

// ──────────────────────────── ONBOARD ────────────────────────────
function ScreenOnboard({ go }) {
  const [email, setEmail] = uS("");
  const [pass, setPass]   = uS("••••••••••");
  const [cardLang, setCardLang] = uS("de");
  const [busy, setBusy]   = uS(false);
  const [err, setErr]     = uS(null);

  const doSupabaseOAuth = async (provider) => {
    const sb = window._supabase;
    if (!sb) {
      setErr("Supabase nicht konfiguriert — nutze Email-Login.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + "/?auth=1" },
      });
      if (error) throw error;
      // Redirect happens — on return the callback handler below picks up the session
    } catch (ex) {
      setErr(ex.message || "OAuth fehlgeschlagen");
      setBusy(false);
    }
  };

  const doLogin = async (provider, prefix = "") => {
    // Use real Supabase OAuth for Google/Apple/Discord if configured
    if (provider !== "email" && window._supabase) {
      return doSupabaseOAuth(provider);
    }
    setBusy(true); setErr(null);
    try {
      let e;
      if (provider === "email") {
        e = (email || "").trim();
        if (!e || !e.includes("@")) throw new Error("Bitte gültige Email eingeben.");
      } else if (email && email.includes("@")) {
        e = email.trim();
      } else {
        e = `${provider}-${Date.now()}@meckgrade.app`;
      }
      await window.HoloAPI.login(provider, e);
      try { await window.HoloAPI.updateMe({ settings: { card_language: cardLang } }); } catch {}
      go("dashboard");
    } catch (ex) {
      setErr(ex.message || "Login fehlgeschlagen");
    } finally { setBusy(false); }
  };

  // Handle OAuth callback (Supabase returns access_token in URL hash)
  u2E(() => {
    const sb = window._supabase;
    if (!sb) return;
    // Check both ?auth=1 param and hash fragment (Supabase uses hash)
    const hasAuth = window.location.search.includes("auth=1") ||
                    window.location.hash.includes("access_token=");
    if (!hasAuth) return;
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      try {
        setBusy(true);
        // Use email from Supabase session to login via MeckGrade backend
        const userEmail = session.user.email || "";
        const displayName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split("@")[0];
        const provider = session.user.app_metadata?.provider || "google";
        // Call existing /api/auth/login with full Railway URL
        await window.HoloAPI.login(provider, userEmail, displayName);
        try { await window.HoloAPI.updateMe({ settings: { card_language: cardLang } }); } catch {}
        history.replaceState(null, "", window.location.pathname);
        go("dashboard");
      } catch (ex) {
        setErr("OAuth Login fehlgeschlagen: " + ex.message);
      } finally { setBusy(false); }
    });
  }, []);

  return (
    <div className="onboard">
      <div className="onboard-left">
        {/* Drifting gradient blobs */}
        <div className="onboard-blob b1"></div>
        <div className="onboard-blob b2"></div>
        <div className="onboard-blob b3"></div>
        <div className="onboard-blob b4"></div>

        <div className="row" style={{gap:10}}>
          <div className="brand-mark"></div>
          <div>
            <div className="brand-name" style={{fontSize:18}}>MeckGrade</div>
            <div className="brand-tag">Holo Lab · v0.6</div>
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{marginBottom:24}}>
            <span className="pulse"></span>
            <span>Pre-Grading · TCG Lab</span>
          </div>
          <h1 className="onboard-hero">
            Grade with<br/>
            <em>holographic</em><br/>certainty.
          </h1>
          <p className="page-sub" style={{marginTop:28, maxWidth:480, fontSize:16}}>
            Computer-vision centering, edge &amp; surface analysis paired with a live ROI engine.
            Know exactly which cards earn the cost of grading — before the slab.
          </p>
        </div>

        <div className="row" style={{gap:24, fontFamily:"var(--mono)", fontSize:11, letterSpacing:"0.16em", textTransform:"uppercase", color:"var(--text-3)"}}>
          <span><span style={{color:"var(--mint)"}}>● </span>0.4mm precision</span>
          <span><span style={{color:"var(--mint)"}}>● </span>14M card index</span>
          <span><span style={{color:"var(--mint)"}}>● </span>Live PSA pop sync</span>
        </div>
      </div>

      <div className="onboard-right">
        <div className="panel-num" style={{marginBottom:18}}>· Sign in / Begin</div>
        <h2 style={{fontFamily:"var(--display)", fontWeight:700, fontSize:36, letterSpacing:"-0.025em", lineHeight:1.05, margin:"0 0 8px"}}>
          Welcome back.
        </h2>
        <p className="muted" style={{marginBottom:32}}>
          Six new market events on your watchlist since last login.
        </p>

        <label className="label">Karten-Sprache</label>
        <select className="input" value={cardLang} onChange={e => setCardLang(e.target.value)}>
          {[["de","Deutsch"],["en","English"],["fr","Français"],["it","Italiano"],
            ["es","Español"],["pt","Português"],["ja","日本語 (JP)"],["ko","한국어"]].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <label className="label" style={{marginTop:18}}>Email</label>
        <input className="input" placeholder="dein@meckgrade.app" value={email} onChange={(e) => setEmail(e.target.value)}/>

        <label className="label" style={{marginTop:18}}>Passphrase</label>
        <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)}/>

        <div className="row-between" style={{marginTop:14, fontSize:12, color:"var(--text-3)"}}>
          <span><Ic k="lock" s={12}/> &nbsp;Vault locked by device key</span>
          <span style={{color:"var(--text-2)", cursor:"pointer"}}
                onClick={() => window.HoloAPI.toast("Passphrase Reset", "Lokales Profil — einfach mit beliebiger Mail neu anmelden.", "warn")}>Forgot?</span>
        </div>

        {err && <div style={{marginTop:12, color:"var(--rose)", fontSize:13}}>{err}</div>}

        <button className="btn btn-glow" style={{width:"100%", justifyContent:"center", marginTop:28, padding:"14px"}}
                onClick={() => doLogin("email")} disabled={busy || !email}>
          {busy ? "Sende…" : "Enter Lab"} <Ic k="arrow" s={14}/>
        </button>

        <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:14, alignItems:"center", margin:"24px 0", color:"var(--text-4)", fontFamily:"var(--mono)", fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase"}}>
          <div style={{height:1, background:"var(--line)"}}></div>
          <span>or</span>
          <div style={{height:1, background:"var(--line)"}}></div>
        </div>

        <div className="row" style={{gap:10}}>
          <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}} disabled={busy}
                  onClick={() => doLogin("apple", "apple-")}>Apple ID</button>
          <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}} disabled={busy}
                  onClick={() => doLogin("google", "google-")}>Google</button>
          <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}} disabled={busy}
                  onClick={() => doLogin("discord", "discord-")}>Discord</button>
        </div>

        <div style={{marginTop:32, padding:14, border:"1px dashed var(--line-2)", borderRadius:10, fontSize:12, color:"var(--text-3)"}}>
          <span className="mono" style={{color:"var(--mint)", fontSize:10, letterSpacing:"0.16em"}}>NEW · </span>
          Battery Express — drop 25+ cards in one shot. Auto-grouped by set, scored within 90 seconds.
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── DASHBOARD ────────────────────────────
function ScreenDashboard({ go, appState }) {
  const history    = appState?.history    || [];
  const friends    = appState?.friends    || [];
  const submission = appState?.submission || [];

  const vaultVal = history.reduce((s, h) => {
    const g = h.psa_grade || 0;
    return s + (g >= 9.5 ? 2200 : g >= 9 ? 800 : g >= 8 ? 320 : 120);
  }, 0);
  const avgGrade = history.length > 0
    ? (history.reduce((s, h) => s + (h.psa_grade || 0), 0) / history.length).toFixed(1)
    : "—";
  const grade9plus = history.filter(h => (h.psa_grade || 0) >= 9).length;

  return (
    <div>
      <PageHead
        eyebrow="01 · Workspace · Live"
        live
        title='Welcome back, <em>Mecky.</em>'
        sub="Your vault at a glance. Recent scans, activity and friends below."
        actions={<>
          <button className="btn btn-ghost" onClick={() => go("collection")}><Ic k="vault" s={14}/> Open Vault</button>
          <button className="btn btn-glow" onClick={() => go("analyze")}><Ic k="scan" s={14}/> New Scan</button>
        </>}
      />

      <Ticker appState={appState}/>

      <div className="stat-row" style={{marginTop:24}}>
        <div className="stat stat-feature fade-up">
          <div className="stat-label">Vault est. value</div>
          <div className="stat-value">€{vaultVal > 0 ? vaultVal.toLocaleString() : "—"}</div>
          <div className="stat-delta">{history.length} cards · rough est.</div>
          <div className="stat-spark"><Sparkline data={[40,38,41,42,40,42,44]} w={80} h={28} color="rgba(244,242,238,0.5)"/></div>
        </div>
        <div className="stat fade-up-1">
          <div className="stat-label">Cards graded</div>
          <div className="stat-value">{history.length}<span className="unit"> scanned</span></div>
          <div className="stat-delta">{grade9plus} grade 9+</div>
        </div>
        <div className="stat fade-up-2">
          <div className="stat-label">Pending submissions</div>
          <div className="stat-value">{submission.length}</div>
          <div className="stat-delta">{submission.length === 0 ? "Add cards from vault" : "cards ready to ship"}</div>
        </div>
        <div className="stat fade-up-3">
          <div className="stat-label">Avg. realised grade</div>
          <div className="stat-value">{avgGrade}</div>
          <div className="stat-delta">{history.length} cards analysed</div>
        </div>
      </div>

      {/* Express banner */}
      <div className="section panel panel-holo fade-up" style={{padding:0}}>
        <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap:24, padding:"26px 28px", alignItems:"center"}}>
          <div>
            <div className="eyebrow"><span style={{color:"var(--mint)"}}>● </span>Battery Express · Beta</div>
            <h3 style={{fontFamily:"var(--display)", fontWeight:700, fontSize:32, letterSpacing:"-0.02em", lineHeight:1.05, margin:"6px 0 8px"}}>
              Drop 25 cards. Get 25 verdicts in 90 seconds.
            </h3>
            <p className="muted" style={{maxWidth:540, margin:0}}>
              Front + back batch upload. We auto-group by set, run centering &amp; surface in parallel,
              then push your ROI verdicts as they land. Skip the queue.
            </p>
          </div>
          <button className="btn btn-glow" onClick={() => go("analyze")}><Ic k="upload" s={14}/> Try Express</button>
        </div>
      </div>

      <div className="grid-2 section">
        {/* Recent scans */}
        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Recent scans</div>
            <div className="panel-meta" onClick={() => go("collection")} style={{cursor:"pointer"}}>View all →</div>
          </div>
          <div className="col" style={{gap:0}}>
            {history.length === 0 ? (
              <div className="muted" style={{padding:"24px 0", textAlign:"center", fontSize:13}}>
                Noch keine Scans — analysiere deine erste Karte.
              </div>
            ) : history.slice(0, 5).map((h, i) => (
              <div key={h.id} className="row" style={{padding:"12px 0", borderBottom: i < Math.min(4, history.length - 1) ? "1px solid var(--line)" : "none", cursor:"pointer"}}
                   onClick={() => go("card", { sessionId: h.id })}>
                <div style={{width:42, aspectRatio:"63/88", borderRadius:6, overflow:"hidden", background:"var(--surf-3)"}}>
                  {h.thumbnail_b64 && <img src={`data:image/jpeg;base64,${h.thumbnail_b64}`} style={{width:"100%", height:"100%", objectFit:"cover"}}/>}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600}}>{h.card_name || "Unbenannte Karte"}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--text-3)", letterSpacing:"0.04em"}}>{h.card_set || "—"} · {h.id.slice(0, 12)}</div>
                </div>
                <GradePill g={h.psa_grade || 0}/>
              </div>
            ))}
          </div>
        </div>

        {/* Activity derived from real history */}
        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Activity stream</div>
            <div className="panel-meta">Recent scans</div>
          </div>
          <div className="col" style={{gap:14}}>
            {history.length === 0 ? (
              <div className="muted" style={{padding:"14px 0", textAlign:"center", fontSize:13}}>
                Noch keine Aktivität.
              </div>
            ) : history.slice(0, 4).map((h, i) => {
              const date = h.timestamp ? new Date(h.timestamp) : null;
              const timeStr = date
                ? date.toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"})
                : "—";
              const g = h.psa_grade || 0;
              const chip  = g >= 9.5 ? "holo" : g >= 9 ? "mint" : g >= 8 ? "amber" : "rose";
              const chipL = g >= 9.5 ? "gem" : g >= 9 ? "mint" : g >= 8 ? "nm-mt" : "review";
              return (
                <div key={h.id} className="row" style={{alignItems:"flex-start", padding:"6px 0", cursor:"pointer"}}
                     onClick={() => go("card", { sessionId: h.id })}>
                  <div className="mono" style={{fontSize:10.5, color:"var(--text-4)", width:70, flexShrink:0, paddingTop:2}}>{timeStr}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500, fontSize:13.5}}>{h.card_name || "Unbenannte"} {g > 0 ? `· PSA ${g}` : "· analysiert"}</div>
                    <div className="muted" style={{fontSize:12, marginTop:2}}>{h.card_set || "—"}</div>
                  </div>
                  <span className={"chip " + chip}><span className="dot"></span>{chipL}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="panel" style={{gridColumn:"span 1"}}>
          <div className="panel-hd">
            <div className="panel-title">Vault performance</div>
            <div className="panel-meta">Raw → Graded est.</div>
          </div>
          <div className="row" style={{alignItems:"flex-end", gap:24, marginTop:6}}>
            <div>
              <div className="kpi-big holo">+228%</div>
              <div className="muted mono" style={{fontSize:11, letterSpacing:"0.1em", marginTop:8}}>RAW €12,860 → GRADED €42,180</div>
            </div>
            <div style={{flex:1}}>
              <ChartArea/>
            </div>
          </div>
          <div className="row" style={{gap:18, marginTop:18, paddingTop:18, borderTop:"1px solid var(--line)", fontSize:12}}>
            <span><span className="dot" style={{display:"inline-block", width:8, height:8, borderRadius:"50%", background:"var(--text-3)", marginRight:6}}></span>Raw value</span>
            <span><span className="dot" style={{display:"inline-block", width:8, height:8, borderRadius:"50%", background:"var(--mint)", marginRight:6}}></span>Graded estimate</span>
            <div style={{flex:1}}></div>
            <span className="muted mono" style={{fontSize:10.5}}>12W · 6M · 1Y · ALL</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Friends · Trade activity</div>
            <div className="panel-meta">{friends.length} following</div>
          </div>
          <div className="col" style={{gap:12}}>
            {friends.length === 0 ? (
              <div className="muted" style={{padding:"14px 0", textAlign:"center", fontSize:13}}>
                Noch keine Freunde. Cmd+K → Nutzer suchen.
              </div>
            ) : friends.slice(0, 4).map((f, i) => (
              <div key={f.username || i} className="row" style={{padding:"6px 0", cursor:"pointer"}}
                   onClick={() => go("publicprofile", { publicUsername: f.username })}>
                <div style={{width:32, height:32, borderRadius:"50%", background:"var(--surf-3)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--display)", fontWeight:600, fontSize:13, position:"relative", overflow:"hidden"}}>
                  {f.avatar && (f.avatar.startsWith("/") || f.avatar.startsWith("http"))
                    ? <img src={f.avatar} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
                    : (f.display_name || f.username || "?")[0].toUpperCase()
                  }
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500, fontSize:13.5}}>@{f.username}</div>
                  <div className="muted" style={{fontSize:11.5}}>{f.display_name || f.bio || "—"}</div>
                </div>
                <div className="mono" style={{fontSize:12, color:"var(--text-2)"}}>{(f.top_cards || []).length} grails</div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:14}} onClick={() => go("friends")}>
            All friends &amp; trades
          </button>
        </div>
      </div>
    </div>
  );
}

function ChartArea() {
  const raw = [12, 13, 14, 15, 16, 17, 18, 18.5, 19, 20, 22, 24];
  const graded = [22, 24, 26, 27, 28, 31, 33, 35, 37, 38, 40, 42];
  const W = 380, H = 110, P = 4;
  const pts = (data, max) => data.map((d, i) =>
    `${P + (i / (data.length - 1)) * (W - 2*P)},${H - P - (d/max) * (H - 2*P)}`
  ).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{maxHeight:120}}>
      <defs>
        <linearGradient id="ch1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(184,245,176,0.4)"/>
          <stop offset="100%" stopColor="rgba(184,245,176,0)"/>
        </linearGradient>
      </defs>
      <polygon points={`${P},${H-P} ${pts(graded, 50)} ${W-P},${H-P}`} fill="url(#ch1)"/>
      <polyline points={pts(graded, 50)} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round"/>
      <polyline points={pts(raw, 50)} fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round"/>
    </svg>
  );
}

// ──────────────────────────── ANALYZE (UPLOAD) ────────────────────────────
function ScreenAnalyze({ go }) {
  const [frontFile, setFrontFile] = uS(null);
  const [backFile, setBackFile] = uS(null);
  const [frontPreview, setFrontPreview] = uS(null);
  const [backPreview, setBackPreview] = uS(null);
  const [busy, setBusy] = uS(false);
  const [error, setError] = uS(null);

  const acceptFile = (f, which) => {
    if (!f || !f.type.startsWith("image/")) {
      setError("Bitte ein Bild ablegen (JPG / PNG / HEIC).");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    if (which === "front") { setFrontFile(f); setFrontPreview(url); }
    else                   { setBackFile(f);  setBackPreview(url); }
  };

  const pickFile = (which) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = (e) => acceptFile(e.target.files[0], which);
    inp.click();
  };

  // Paste from clipboard (Cmd/Ctrl-V) lands as front by default, back if front exists.
  uE(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type?.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) { acceptFile(f, frontFile ? "back" : "front"); return; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [frontFile]);

  const runPipeline = async () => {
    if (!frontFile || busy) return;
    setBusy(true); setError(null);
    try {
      const up = await window.HoloAPI.uploadFiles(frontFile, backFile);
      go("analyzing", { sessionId: up.session_id });
    } catch (e) {
      setError("Upload fehlgeschlagen — " + e.message);
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        eyebrow="02 · Workspace · Analyze"
        title='Drop the card. <em>We do the rest.</em>'
        sub="Front + back ideal. We auto-detect the card boundary, run centering analysis (outer edge + inner-frame), then look up the card and Cardmarket price via TCGdex."
      />

      <div className="grid-2">
        <div className="panel" style={{padding:0, overflow:"hidden"}}>
          <div className="row-between" style={{padding:"16px 22px", borderBottom:"1px solid var(--line)"}}>
            <div className="panel-title" style={{fontSize:14}}>Front · Required</div>
            <span className={"chip " + (frontFile ? "mint" : "")}><span className="dot"></span>{frontFile ? "Captured" : "Awaiting"}</span>
          </div>
          <div style={{padding:36, position:"relative"}}>
            <UploadZone active={!!frontFile} onClick={() => pickFile("front")} src={frontPreview}
                        onDropFile={(f) => acceptFile(f, "front")}/>
          </div>
        </div>
        <div className="panel" style={{padding:0, overflow:"hidden"}}>
          <div className="row-between" style={{padding:"16px 22px", borderBottom:"1px solid var(--line)"}}>
            <div className="panel-title" style={{fontSize:14}}>Back · Optional</div>
            <span className={"chip " + (backFile ? "mint" : "")}><span className="dot"></span>{backFile ? "Captured" : "Awaiting"}</span>
          </div>
          <div style={{padding:36, position:"relative"}}>
            <UploadZone active={!!backFile} onClick={() => pickFile("back")} src={backPreview}
                        onDropFile={(f) => acceptFile(f, "back")}/>
          </div>
        </div>
      </div>

      {error && (
        <div className="section panel" style={{borderColor:"rgba(255,143,143,0.3)", background:"rgba(255,143,143,0.05)"}}>
          <div style={{color:"var(--rose)", fontSize:13}}>{error}</div>
        </div>
      )}

      <div className="section panel">
        <div className="row-between">
          <div>
            <div className="panel-num">· Pre-flight</div>
            <div className="panel-title" style={{marginTop:6}}>
              {frontFile ? "Bereit zum Senden" : "Bitte zuerst Vorderseite auswählen"}
            </div>
            <div className="muted" style={{marginTop:6, fontSize:13}}>
              Empfohlen: scharfes Foto auf einfarbigem Hintergrund, gleichmäßige Beleuchtung, Karte fast bildfüllend.
            </div>
          </div>
          <button className="btn btn-glow" onClick={runPipeline} disabled={!frontFile || busy}>
            <Ic k="play" s={13}/> {busy ? "Sende…" : "Run pipeline"}
          </button>
        </div>
        <div className="row" style={{gap:16, marginTop:18, paddingTop:18, borderTop:"1px solid var(--line)"}}>
          {[
            ["Front", frontFile ? frontFile.name.slice(0, 22) : "—", frontFile ? "mint" : ""],
            ["Front size",   frontFile ? Math.round(frontFile.size/1024) + " KB" : "—", ""],
            ["Back",  backFile  ? backFile.name.slice(0, 22)  : "(optional)", backFile ? "mint" : ""],
            ["Pipeline",     "Centering · Lookup", ""],
            ["Endpoint",     "/api/analyze/stream", "mint"]
          ].map(([k, v, c], i) => (
            <div key={i} style={{flex:1, padding:"10px 14px", borderLeft: i > 0 ? "1px solid var(--line)" : "none", minWidth:0}}>
              <div className="panel-num" style={{fontSize:9.5}}>{k}</div>
              <div className="mono" style={{fontSize:12, color: c === "mint" ? "var(--mint)" : "var(--text)", marginTop:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadZone({ active, onClick, src, onDropFile }) {
  const [dragOver, setDragOver] = uS(false);

  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && onDropFile) onDropFile(f);
  };

  return (
    <div className={(active ? "scan-frame " : "") + (dragOver ? "drop-active" : "")}
         onClick={onClick}
         onDragOver={onDragOver}
         onDragEnter={onDragOver}
         onDragLeave={onDragLeave}
         onDrop={onDrop}
         style={{
           aspectRatio:"63/88", maxWidth:320, margin:"0 auto",
           border: dragOver ? "2px solid var(--mint)" : (active ? "1px solid var(--line-2)" : "1px dashed var(--line-2)"),
           borderRadius:14,
           background: dragOver ? "rgba(184,245,176,0.06)" : (active ? "var(--bg)" : "transparent"),
           display:"flex", alignItems:"center", justifyContent:"center",
           cursor:"pointer",
           overflow:"hidden",
           position:"relative",
           transition:"border-color 0.15s ease, background 0.15s ease"
         }}>
      {active && src ? (
        <>
          <span className="scan-corner tl"></span>
          <span className="scan-corner tr"></span>
          <span className="scan-corner bl"></span>
          <span className="scan-corner br"></span>
          <img src={src} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
          {dragOver && (
            <div style={{position:"absolute", inset:0, background:"rgba(7,7,11,0.7)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--mint)", fontSize:14, fontWeight:600}}>
              Hier ablegen — ersetzt
            </div>
          )}
        </>
      ) : (
        <div style={{textAlign:"center", padding:40, pointerEvents:"none"}}>
          <div style={{width:48, height:48, borderRadius:"50%", border:"1px dashed var(--line-2)", display:"inline-flex", alignItems:"center", justifyContent:"center", color: dragOver ? "var(--mint)" : "var(--text-3)"}}>
            <Ic k="upload"/>
          </div>
          <div style={{fontWeight:500, marginTop:14, color: dragOver ? "var(--mint)" : "var(--text)"}}>
            {dragOver ? "Hier ablegen" : "Bild ablegen oder klicken"}
          </div>
          <div className="muted" style={{fontSize:12, marginTop:4}}>JPG · PNG · HEIC · ⌘V</div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── ANALYZING ────────────────────────────
function ScreenAnalyzing({ go, appState }) {
  // Maps server progress.pct → step index. Display labels are stylised but
  // each step ticks off when its threshold is crossed.
  const steps = [
    { id: "ingest",   label: "Ingest · color profile",      th: 5  },
    { id: "detect",   label: "Card detection · perspective", th: 25 },
    { id: "match",    label: "Card boundary · sub-pixel",   th: 50 },
    { id: "center",   label: "Centering · inner-frame ΔE",  th: 70 },
    { id: "lookup",   label: "TCGdex · Cardmarket lookup",  th: 90 },
    { id: "render",   label: "Generate editor image",       th: 99 }
  ];
  const [step, setStep] = uS(0);
  const [pct, setPct] = uS(0);
  const [msg, setMsg] = uS("Starte Pipeline…");
  const [error, setError] = uS(null);
  const [previewSrc, setPreviewSrc] = uS(null);

  const sessionId = appState?.activeSession;

  uE(() => {
    if (!sessionId) {
      setError("Keine Session gefunden — zurück zu Analyze.");
      return;
    }

    // Pull preview img if user uploaded — locate via API session handle.
    // Best-effort: try to read the most recent uploaded blob URL from sessionStorage if set.
    let cancelled = false;
    (async () => {
      try {
        const result = await window.HoloAPI.analyzeStream(sessionId, (e) => {
          if (cancelled) return;
          if (typeof e.pct === "number") setPct(e.pct);
          if (e.msg) setMsg(e.msg);
          // Advance step based on pct threshold
          let s = 0;
          for (let i = 0; i < steps.length; i++) {
            if (e.pct >= steps[i].th) s = i + 1;
          }
          setStep(Math.min(s, steps.length));
        });
        if (cancelled) return;
        setPct(100);
        window.HoloAPI.setState({
          activeResult: result,
          activeSession: sessionId,
          activeCardInfo: null,
          cardInfoLoading: true,
        });
        window.HoloAPI.lookupCard(sessionId)
          .then(info => window.HoloAPI.setState({ activeCardInfo: info, cardInfoLoading: false }))
          .catch(() => window.HoloAPI.setState({ cardInfoLoading: false }));
        window.HoloAPI.refreshHistory();
        // Toast + notification feedback
        const psa = result?.grades?.psa;
        if (psa) {
          window.HoloAPI.toast("Analyse fertig", `PSA ${psa} · ${result.grades.psa_label || ""}`);
        }
        // Refresh notifications (server may have logged something)
        window.HoloAPI.refreshNotifications();
        setTimeout(() => go("result"), 600);
      } catch (e) {
        if (!cancelled) setError("Stream-Fehler: " + (e.message || "unbekannt"));
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Use the editor preview from the result if it exists (SSE may emit it last)
  uE(() => {
    const r = window.HoloAPI.getState().activeResult;
    if (r && r.clean_front_b64) setPreviewSrc(`data:image/jpeg;base64,${r.clean_front_b64}`);
  }, [pct]);

  return (
    <div>
      <PageHead
        eyebrow="02 · Workspace · Pipeline running"
        live
        title='Reading the <em>foil.</em>'
        sub="Eight passes, one verdict. The model walks the card millimetre by millimetre."
      />

      <div className="grid-2" style={{alignItems:"start"}}>
        <div className="panel" style={{padding:0, overflow:"hidden"}}>
          <div className="row-between" style={{padding:"14px 22px", borderBottom:"1px solid var(--line)"}}>
            <div className="panel-num">· Pipeline · live</div>
            <div className="mono" style={{fontSize:11, color:"var(--text-2)"}}>{pct}%</div>
          </div>
          <div style={{padding:48, display:"flex", justifyContent:"center", alignItems:"center", minHeight:520, position:"relative"}}>
            <div style={{position:"relative"}}>
              <div className="scan-frame" style={{width:280, aspectRatio:"63/88", borderRadius:14, overflow:"hidden", border:"1px solid var(--line-2)", boxShadow:"0 0 80px -20px rgba(196,165,255,0.4)", background:"var(--surf)"}}>
                <span className="scan-corner tl"></span>
                <span className="scan-corner tr"></span>
                <span className="scan-corner bl"></span>
                <span className="scan-corner br"></span>
                {previewSrc && <img src={previewSrc} style={{width:"100%", height:"100%", objectFit:"cover"}}/>}
              </div>
              <ScanRings/>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Routine</div>
            <div className="panel-meta">{step}/{steps.length}</div>
          </div>
          {error && (
            <div style={{padding:"12px 14px", border:"1px solid rgba(255,143,143,0.3)", background:"rgba(255,143,143,0.05)", borderRadius:8, color:"var(--rose)", fontSize:13, marginBottom:14}}>
              {error}
              <button className="btn btn-ghost" style={{marginTop:10}} onClick={() => go("analyze")}>Zurück</button>
            </div>
          )}
          <div className="col" style={{gap:0}}>
            {steps.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s.id} className="row" style={{padding:"14px 0", borderBottom: i < steps.length - 1 ? "1px solid var(--line)" : "none", opacity: i > step + 1 ? 0.4 : 1, transition:"opacity 0.3s"}}>
                  <div style={{width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    background: done ? "var(--mint)" : active ? "transparent" : "var(--surf-3)",
                    border: active ? "1.5px solid var(--mint)" : "none",
                    color: done ? "#052016" : "var(--mint)"}}>
                    {done ? <Ic k="check" s={12}/> : active ? <span className="loader-dots" style={{transform:"scale(0.7)"}}><span></span><span></span><span></span></span> : <span className="mono" style={{fontSize:9, color:"var(--text-4)"}}>{String(i+1).padStart(2,"0")}</span>}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13.5, fontWeight: active ? 600 : 500, color: active ? "var(--text)" : done ? "var(--text-2)" : "var(--text-3)"}}>{s.label}</div>
                  </div>
                  <div className="mono" style={{fontSize:11, color: done ? "var(--mint)" : active ? "var(--text-2)" : "var(--text-4)"}}>
                    {done ? "OK" : active ? <span className="loader-dots"><span></span><span></span><span></span></span> : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:18, paddingTop:18, borderTop:"1px solid var(--line)"}}>
            <div className="bar" style={{height:8}}>
              <div className="bar-fill solid" style={{width: pct + "%", transition:"width 0.5s ease"}}></div>
            </div>
            <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", marginTop:8, letterSpacing:"0.14em"}}>
              {pct}% · {msg}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanRings() {
  return (
    <svg style={{position:"absolute", top:"50%", left:"50%", transform:"translate(-50%, -50%)", pointerEvents:"none"}}
         width="500" height="500">
      <defs>
        <linearGradient id="ring1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(196,165,255,0.6)"/>
          <stop offset="100%" stopColor="rgba(135,216,255,0.2)"/>
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="180" fill="none" stroke="url(#ring1)" strokeWidth="1" strokeDasharray="2 8" style={{animation:"spinSlow 18s linear infinite", transformOrigin:"center"}}/>
      <circle cx="250" cy="250" r="220" fill="none" stroke="rgba(244,242,238,0.06)" strokeWidth="1" strokeDasharray="1 6"/>
      <circle cx="250" cy="250" r="240" fill="none" stroke="rgba(244,242,238,0.04)" strokeWidth="1"/>
    </svg>
  );
}

window.ScreenOnboard = ScreenOnboard;
window.ScreenDashboard = ScreenDashboard;
window.ScreenAnalyze = ScreenAnalyze;
window.ScreenAnalyzing = ScreenAnalyzing;
