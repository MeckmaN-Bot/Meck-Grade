// MeckGrade Holo — Screens B: Result, Collection, Card Detail
const { useState: u2S, useEffect: u2E, useRef: u2R } = React;

// ─── 3D mouse-tilt collection card with holo gloss ────────────────────────
function TiltCard({ card, delay = 0, onClick }) {
  const ref = u2R(null);

  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    const ry = (x - 0.5) * 20;
    const rx = (0.5 - y) * 14;
    const inner = el.querySelector(".tilt-inner");
    if (inner) inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    el.style.setProperty("--hx", `${x * 100}%`);
    el.style.setProperty("--hy", `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    const inner = el.querySelector(".tilt-inner");
    if (inner) inner.style.transform = "rotateX(0deg) rotateY(0deg)";
  };

  return (
    <div
      ref={ref}
      className="coll-card tilt fade-up"
      style={{animationDelay: delay + "s"}}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <div className="tilt-inner">
        <div className="tilt-card">
          {card.img && <img src={card.img} alt="" draggable="false" onError={(e) => e.target.style.display='none'}/>}
          <div className="tilt-prism"></div>
          <div className="tilt-gloss"></div>
        </div>
        <div className="tilt-grade">
          <GradePill g={card.grade / 10}/>
        </div>
        <div className="tilt-info">
          <div className="coll-name">{card.name}</div>
          <div className="coll-meta">{card.set}</div>
          <div className="row-between" style={{marginTop:10, paddingTop:10, borderTop:"1px solid var(--line)"}}>
            <span className="mono" style={{fontSize:11, color:"var(--text-2)"}}>{card.date}</span>
            <span className="mono" style={{fontSize:10.5, color:"var(--text-3)"}}>{card.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CornerVizCard: image + radius arc overlays + penalty breakdown ─────
function CornerVizCard({ c }) {
  const score10 = (c.corner_score || 0) / 10;
  const cls = score10 >= 9 ? "mint" : score10 >= 8 ? "amber" : "rose";
  const label = ({
    "top_left":"Oben Links","top_right":"Oben Rechts",
    "bottom_left":"Unten Links","bottom_right":"Unten Rechts"
  })[c.position] || c.position;

  // Apex location (in crop pixels) for each corner.
  const apex = (() => {
    switch (c.position) {
      case "top_left":     return { x: 0,        y: 0        };
      case "top_right":    return { x: c.crop_w, y: 0        };
      case "bottom_left":  return { x: 0,        y: c.crop_h };
      case "bottom_right": return { x: c.crop_w, y: c.crop_h };
      default:             return { x: 0,        y: 0        };
    }
  })();
  // Inward direction for the arc center.
  const dx = c.position.includes("right")  ? -1 : 1;
  const dy = c.position.includes("bottom") ? -1 : 1;
  const expR = c.expected_radius_px || 0;
  const measR = c.measured_radius_px || 0;
  const expCx = apex.x + dx * expR;
  const expCy = apex.y + dy * expR;
  const measCx = apex.x + dx * measR;
  const measCy = apex.y + dy * measR;

  // Arc start/end in radians for each corner (90° arc that opens away from apex).
  const arcRange = (() => {
    switch (c.position) {
      case "top_left":     return [Math.PI,           1.5 * Math.PI];
      case "top_right":    return [1.5 * Math.PI,     2 * Math.PI  ];
      case "bottom_right": return [0,                 0.5 * Math.PI];
      case "bottom_left":  return [0.5 * Math.PI,     Math.PI      ];
    }
  })();
  const arcPath = (cx, cy, r) => {
    if (r <= 0) return "";
    const x0 = cx + Math.cos(arcRange[0]) * r;
    const y0 = cy + Math.sin(arcRange[0]) * r;
    const x1 = cx + Math.cos(arcRange[1]) * r;
    const y1 = cy + Math.sin(arcRange[1]) * r;
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };

  const measColor = c.radius_match >= 80 ? "#5be29a" : c.radius_match >= 60 ? "#ffd24a" : "#ff8f8f";

  // Penalty breakdown sums up to (100 - corner_score).
  const pens = [
    { k: "Whitening", v: c.pen_whitening, max: 40, na: c.whitening_unreliable },
    { k: "Radius",    v: c.pen_radius,    max: 20 },
    { k: "Angle",     v: c.pen_angle,     max: 25 },
    { k: "Sharpness", v: c.pen_sharpness, max: 15 },
  ];

  return (
    <div className="corner-card">
      <div className="row-between" style={{marginBottom:10}}>
        <div className="panel-num">· {label}</div>
        <div style={{fontFamily:"var(--display)", fontSize:22, fontWeight:700, letterSpacing:"-0.02em", color:`var(--${cls})`}}>
          {score10.toFixed(1)}<span className="mono" style={{fontSize:10, color:"var(--text-3)", marginLeft:3}}>/10</span>
        </div>
      </div>

      <div className="corner-stage">
        {c.crop_b64 ? (
          <img className="corner-img"
               src={`data:image/jpeg;base64,${c.crop_b64}`}
               alt={label}
               draggable="false"/>
        ) : <div className="corner-empty">kein Crop</div>}
        {c.whitening_mask_b64 && (
          <img className="corner-mask"
               src={`data:image/png;base64,${c.whitening_mask_b64}`}
               alt=""
               draggable="false"/>
        )}
        {c.crop_w > 0 && (
          <svg className="corner-overlay" viewBox={`0 0 ${c.crop_w} ${c.crop_h}`} preserveAspectRatio="none">
            {expR > 0 && (
              <path d={arcPath(expCx, expCy, expR)}
                    fill="none" stroke="rgba(255,255,255,0.85)"
                    strokeWidth={Math.max(1, c.crop_w / 80)}
                    strokeDasharray={`${c.crop_w/30} ${c.crop_w/40}`}/>
            )}
            {measR > 0 && (
              <path d={arcPath(measCx, measCy, measR)}
                    fill="none" stroke={measColor}
                    strokeWidth={Math.max(1.4, c.crop_w / 60)}/>
            )}
            {/* apex marker */}
            <circle cx={apex.x} cy={apex.y} r={Math.max(2, c.crop_w / 40)}
                    fill="rgba(255,255,255,0.9)" stroke="rgba(0,0,0,0.7)" strokeWidth="1"/>
          </svg>
        )}
      </div>

      <div className="corner-meta">
        <div className="corner-meta-row">
          <span>Radius</span>
          <span style={{color: measColor}}>
            {c.radius_mm > 0 ? `${c.radius_mm.toFixed(2)}mm · ${c.radius_match.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="corner-meta-row">
          <span>Whitening</span>
          <span style={{color: c.whitening_unreliable ? "var(--text-4)" : undefined}}>
            {c.whitening_unreliable ? "n/a" : `${(c.whitening_ratio * 100).toFixed(0)}%`}
          </span>
        </div>
        <div className="corner-meta-row">
          <span>Angle</span>
          <span>{c.angle_deviation.toFixed(1)}°</span>
        </div>
      </div>

      <div className="corner-pens">
        <div className="panel-num" style={{marginBottom:6}}>· Punktabzug</div>
        {pens.map((p, i) => (
          <div key={i} className="corner-pen-row" style={{opacity: p.na ? 0.4 : 1}}>
            <span className="corner-pen-label">{p.k}</span>
            <div className="corner-pen-bar">
              <div className="corner-pen-fill"
                   style={{width: p.na ? "0%" : Math.min(100, (p.v / p.max) * 100) + "%",
                           background: p.v < 5 ? "var(--mint)" : p.v < 15 ? "var(--amber)" : "var(--rose)"}}></div>
            </div>
            <span className="corner-pen-val">{p.na ? "n/a" : `−${p.v.toFixed(1)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────── RESULT ────────────────────────────
function ScreenResult({ go, appState }) {
  const result = appState?.activeResult;
  const sessionId = appState?.activeSession;
  const cardInfo = appState?.activeCardInfo;
  const [g, setG] = u2S(0);
  const [searching, setSearching] = u2S(false);
  // Live override from the editor — overrides the centering subscore + drives the headline grade.
  const [liveCent, setLiveCent] = u2S(null);
  const [addState, setAddState] = u2S("idle"); // "idle" | "adding" | "added"

  // Reset collection-state whenever a new session is shown.
  u2E(() => { setAddState("idle"); }, [sessionId]);

  // If this session already exists in history (e.g. user navigated back),
  // mark as already added.
  u2E(() => {
    if (!sessionId) return;
    const inHistory = (appState?.history || []).some(h => h.id === sessionId);
    if (inHistory) setAddState("added");
  }, [sessionId, appState?.history]);

  const psaGrade = result?.grades?.psa || 0;
  const psaLabel = result?.grades?.psa_label || "";
  const cent = result?.centering_front;
  const subs = result?.subgrades || {};
  const conf = result?.grades?.confidence_pct || 0;
  const lowG = result?.grades?.grade_low || psaGrade;
  const highG = result?.grades?.grade_high || psaGrade;
  const limFactor = result?.grades?.limiting_factor || "";
  const quarantined = !!result?.analyzers_quarantined;

  // Effective centering subscore: prefer live editor reading, else server.
  const liveCentScore = liveCent != null ? liveCent : (subs.centering ?? 0);
  // When user adjusts centering editor, recompute grade from liveCent + backend subgrades.
  const effectiveGrade = liveCent != null
    ? (_recomputeGradeFromLive(liveCent, subs) ?? psaGrade)
    : psaGrade;

  u2E(() => {
    if (!effectiveGrade) return;
    const target = effectiveGrade;
    let n = g;
    const id = setInterval(() => {
      const step = (target - n) * 0.18;
      if (Math.abs(target - n) < 0.05) { setG(target); clearInterval(id); }
      else { n = n + step; setG(parseFloat(n.toFixed(1))); }
    }, 30);
    return () => clearInterval(id);
  }, [effectiveGrade]);

  u2E(() => {
    if (result && window.Viewer) {
      setTimeout(() => {
        try { window.Viewer.render(result); } catch (e) { console.warn(e); }
      }, 50);
    }
  }, [result]);

  // Listen for live edits from the editor.
  u2E(() => {
    const onUpdate = (e) => {
      const d = e.detail; if (!d || d.side !== 'front') return;
      setLiveCent(Math.round(d.score));
    };
    window.addEventListener('cedit:update', onUpdate);
    return () => window.removeEventListener('cedit:update', onUpdate);
  }, []);

  if (!result) {
    return (
      <div>
        <PageHead eyebrow="02.5 · Verdict" title='No <em>result.</em>' sub="Bitte zuerst eine Karte analysieren."/>
        <button className="btn btn-glow" onClick={() => go("analyze")}>← Analyze</button>
      </div>
    );
  }

  const probabilities = computeGradeProbabilities(effectiveGrade, conf, lowG, highG);

  const verdict = effectiveGrade >= 9 ? "SUBMIT RECOMMENDED"
                 : effectiveGrade >= 7 ? "BORDERLINE"
                 : "DO NOT SUBMIT";
  const verdictClass = effectiveGrade >= 9 ? "mint" : effectiveGrade >= 7 ? "amber" : "rose";

  const cardTitle = cardInfo?.name
    ? `${cardInfo.name}. <em>${effectiveGrade.toFixed ? effectiveGrade.toFixed(1) : effectiveGrade}.</em>`
    : `Verdict. <em>${effectiveGrade.toFixed ? effectiveGrade.toFixed(1) : effectiveGrade}.</em>`;

  return (
    <div>
      <PageHead
        eyebrow={"02.5 · Workspace · Verdict · " + (sessionId || "").slice(0, 8)}
        live
        title={cardTitle}
        sub={cent
          ? `Linien anpassen für Live-Score. Karte: ${cardInfo?.name || "—"}.`
          : "Analyse abgeschlossen — bitte Editor unten prüfen."}
        actions={<>
          <button className="btn btn-ghost" onClick={() => sessionId && window.open(`/api/export/${sessionId}/pdf`, "_blank")}><Ic k="upload" s={14}/> Export PDF</button>
          <button className="btn btn-ghost" onClick={() => go("analyze")}><Ic k="plus" s={14}/> New scan</button>
          {addState === "added" ? (
            <button className="btn btn-ghost" onClick={() => go("collection")}>
              <Ic k="vault" s={14}/> Open Vault
            </button>
          ) : (() => {
            const idLoading = !!appState?.cardInfoLoading || searching;
            const hasId = !!cardInfo?.name;
            const blocked = addState === "adding" || !sessionId || idLoading || !hasId;
            const label =
              addState === "adding"  ? "Speichere…" :
              idLoading              ? "Identifikation läuft…" :
              !hasId                 ? "Karte zuerst identifizieren" :
              "Add to Collection";
            return (
              <button className={"btn " + (blocked ? "btn-ghost" : "btn-glow")}
                      disabled={blocked}
                      title={!hasId ? "Bitte erst die Karten-Identifikation abwarten oder per Suche bestätigen." : ""}
                      onClick={async () => {
                        if (blocked) return;
                        setAddState("adding");
                        try {
                          await window.HoloAPI.addToCollection(
                            sessionId,
                            cardInfo.name,
                            cardInfo.set_name || "",
                            cardInfo.id || "",
                            cardInfo.number || ""
                          );
                          await window.HoloAPI.refreshHistory();
                          setAddState("added");
                          window.HoloAPI.toast("Hinzugefügt", `${cardInfo.name} ist jetzt in deiner Sammlung.`);
                        } catch (e) {
                          setAddState("idle");
                          window.HoloAPI.toast("Fehler", e.message || "Konnte nicht hinzufügen.", "error");
                        }
                      }}>
                <Ic k="vault" s={14}/> {label}
              </button>
            );
          })()}
        </>}
      />

      {/* HERO: editor (left) + grade verdict (right) */}
      <div className="grid-2" style={{gridTemplateColumns:"minmax(0, 1.55fr) minmax(320px, 1fr)", alignItems:"start", gap:20}}>
        <div className="panel" style={{padding:18}}>
          <div className="panel-hd">
            <div className="panel-title">Centering · Feinjustage</div>
            <div className="panel-meta">drag · zoom · raster</div>
          </div>
          <div id="editor-host" className="cedit-host"></div>
        </div>

        <div className="col gap-24" style={{gap:14}}>
          <div className="panel panel-holo" style={{padding:"22px 22px 20px", textAlign:"center", position:"relative", overflow:"hidden"}}>
            <div className="panel-num" style={{textAlign:"left", marginBottom:6}}>· MeckScore™ {liveCent != null ? <span style={{color:"var(--mint)"}}>· live preview</span> : ""}</div>
            <div style={{position:"relative", display:"inline-block", marginTop:6}}>
              <span className="grade-mega-shadow">{(g || 0).toFixed(1)}</span>
              <span className="grade-mega" style={{display:"block", position:"relative"}}>{(g || 0).toFixed(1)}</span>
            </div>
            <div className="muted mono" style={{fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", marginTop:6}}>{psaLabel}</div>
            <div className="row" style={{justifyContent:"center", gap:6, marginTop:14, flexWrap:"wrap"}}>
              <span className={"chip " + verdictClass}><span className="dot"></span>{verdict}</span>
              <span className="chip"><span className="dot" style={{background:"var(--text-3)"}}></span>CONF {conf}%</span>
              {limFactor && <span className="chip"><span className="dot" style={{background:"var(--text-3)"}}></span>LIM {limFactor.toUpperCase()}</span>}
            </div>
          </div>

          <div className="panel" style={{padding:"16px 18px"}}>
            <div className="panel-num" style={{marginBottom:10}}>· Likelihood band {lowG}–{highG}</div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8}}>
              {probabilities.map((x, i) => (
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{height:60, position:"relative", display:"flex", alignItems:"flex-end", justifyContent:"center"}}>
                    <div style={{width:32, background:`var(--${x.c})`, height:x.p+"%", borderRadius:"4px 4px 0 0",
                                 boxShadow: x.p > 50 ? `0 0 22px var(--${x.c})` : "none",
                                 transformOrigin:"bottom", animation:"barFill 1s cubic-bezier(.2,.8,.2,1) both"}}></div>
                  </div>
                  <div className="mono" style={{fontSize:10, color:"var(--text-3)", marginTop:6, letterSpacing:"0.08em"}}>PSA {x.g}</div>
                  <div className="mono" style={{fontSize:12, color:"var(--text)", fontWeight:600}}>{x.p}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{padding:"14px 18px"}}>
            <div className="panel-num" style={{marginBottom:8}}>· Subscores</div>
            {[
              { label: "Centering", value: liveCentScore, live: liveCent != null },
              { label: "Corners",   value: subs.corners },
            ].map((s, i) => {
              const v10 = (s.value || 0) / 10;
              const inactive = s.value == null;
              return (
                <div key={i} className="score-row" style={{opacity: inactive ? 0.35 : 1}}>
                  <div className="score-label">{s.label}{s.live ? " ·" : ""}</div>
                  <div className="bar"><div className={"bar-fill " + (v10 >= 9 ? "" : v10 >= 8 ? "amber" : "rose")} style={{width:(s.value || 0)+"%"}}></div></div>
                  <div className="score-num">{s.value != null ? v10.toFixed(1) : "—"}</div>
                </div>
              );
            })}
            {cent?.lr_ratio != null && (
              <div className="muted" style={{fontSize:10.5, marginTop:8, fontFamily:"var(--mono)", letterSpacing:"0.06em"}}>
                L/R ratio: {cent.lr_ratio.toFixed(4)} · threshold 0.5500
                {cent.lr_ratio <= 0.55
                  ? <span style={{color:"var(--mint)"}}> ✓ PSA 10 eligible</span>
                  : <span style={{color:"var(--rose)"}}> ✗ exceeds 0.55 → PSA 9 cap</span>}
              </div>
            )}
            <div className="muted" style={{fontSize:11, marginTop:6, lineHeight:1.5}}>
              Score basiert auf Zentrierung + Ecken (Whitening, Radius, Schärfe).
              Kanten + Oberfläche werden nicht bewertet.
            </div>
          </div>
        </div>
      </div>

      {/* CARD ID + MARKETS */}
      <div className="section grid-2" style={{gridTemplateColumns:"1fr 1fr", alignItems:"start"}}>
        <div className="panel">
          <div className="panel-hd">
            <div className="panel-title">Card identification</div>
            <div className="panel-meta">
              {(appState?.cardInfoLoading || searching) ? "lookup läuft…" : (cardInfo?.set_id || "TCGdex · DE")}
            </div>
          </div>
          {(appState?.cardInfoLoading || searching) && (
            <div className="lookup-loader" style={{marginBottom:14}}>
              <div className="lookup-bar"><div className="lookup-bar-fill"></div></div>
              <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", marginTop:6, letterSpacing:"0.1em"}}>
                Suche Set + Nummer · Cardmarket Preise · TCGplayer
              </div>
            </div>
          )}
          {cardInfo?.name ? (
            <div className="row" style={{gap:14, alignItems:"flex-start", marginBottom:12, opacity: searching ? 0.5 : 1}}>
              {cardInfo.image_url && (
                <img src={cardInfo.image_url} alt="" style={{width:78, aspectRatio:"63/88", objectFit:"cover", borderRadius:6, background:"var(--surf-3)"}}
                     onError={(e) => e.target.style.display = "none"}/>
              )}
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:"var(--display)", fontWeight:700, fontSize:18, letterSpacing:"-0.02em"}}>{cardInfo.name}</div>
                <div className="muted" style={{fontSize:12.5}}>{cardInfo.set_name} {cardInfo.number ? "· #" + cardInfo.number : ""}</div>
                {cardInfo.rarity && <div className="mono" style={{fontSize:10.5, color:"var(--text-3)", marginTop:5, letterSpacing:"0.06em"}}>{cardInfo.rarity}</div>}
                {cardInfo.raw_nm_price != null && (
                  <div style={{marginTop:8, fontFamily:"var(--mono)", fontSize:13, color:"var(--mint)"}}>
                    {cardInfo.currency === "EUR" ? "€" : "$"}{cardInfo.raw_nm_price.toFixed(2)} <span className="muted" style={{fontSize:10, marginLeft:5}}>NM raw</span>
                  </div>
                )}
              </div>
            </div>
          ) : !appState?.cardInfoLoading && (
            <div className="muted" style={{fontSize:13, marginBottom:10}}>
              Karte nicht automatisch erkannt — Namen tippen für Live-Vorschläge:
            </div>
          )}
          <CardSearch
            initial=""
            autoFocus={!cardInfo?.name}
            placeholder="Karte suchen — Charizard, Glurak, Mega-Dragoran…"
            onPick={async (card) => {
              if (!sessionId) return;
              setSearching(true);
              try {
                // Pass the exact tcgdex card-id so the backend resolves the
                // *exact* variant the user picked (avoids 152 vs 290 drift).
                const info = await window.HoloAPI.lookupCard(sessionId, card.name, card.id);
                window.HoloAPI.setState({ activeCardInfo: info });
                window.HoloAPI.refreshHistory();
              } finally { setSearching(false); }
            }}
            onSearch={async (q) => {
              if (!sessionId) return;
              setSearching(true);
              try {
                const info = await window.HoloAPI.lookupCard(sessionId, q);
                window.HoloAPI.setState({ activeCardInfo: info });
                window.HoloAPI.refreshHistory();
              } finally { setSearching(false); }
            }}
          />
        </div>

        {cardInfo?.prices?.length > 0 ? (
          <div className="panel">
            <div className="panel-hd">
              <div className="panel-title">Markt · live</div>
              <div className="panel-meta">{cardInfo.currency} · Cardmarket + PSA</div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:0, border:"1px solid var(--line)", borderRadius:10, overflow:"hidden"}}>
              {cardInfo.prices.slice(0, 6).map((p, i) => (
                <div key={i} style={{padding:"12px 14px", borderRight: (i % 2 === 0) ? "1px solid var(--line)" : "none", borderBottom: i < 4 ? "1px solid var(--line)" : "none"}}>
                  <div className="panel-num" style={{marginBottom:6}}>· {typeof p.grade === "number" ? "PSA " + p.grade : p.grade}</div>
                  <div className="mono" style={{fontSize:16, color: typeof p.grade === "number" && p.grade >= 9 ? "var(--mint)" : "var(--text)"}}>{p.price_str}</div>
                </div>
              ))}
            </div>
            {cardInfo.cardmarket_url && (
              <div className="row" style={{marginTop:12, gap:8}}>
                <a className="btn btn-ghost" href={cardInfo.cardmarket_url} target="_blank" rel="noreferrer">Cardmarket →</a>
                {cardInfo.name && (
                  <a className="btn btn-ghost"
                     href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(((cardInfo.name||"") + " " + (cardInfo.set_name||"")).trim())}`}
                     target="_blank" rel="noreferrer">TCGplayer →</a>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-hd">
              <div className="panel-title">Markt</div>
              <div className="panel-meta">offen</div>
            </div>
            <div className="muted" style={{fontSize:13}}>
              Sobald die Karte erkannt ist, erscheinen hier Live-Preise (raw NM, PSA 9, PSA 10).
            </div>
          </div>
        )}
      </div>

      {result.corners?.length > 0 && (
        <div className="section panel">
          <div className="panel-hd">
            <div className="panel-title">Ecken · Detail</div>
            <div className="panel-meta">
              worst {Math.min(...result.corners.map(c => c.corner_score)).toFixed(0)} ·
              avg {(result.corners.reduce((s,c) => s + c.corner_score, 0) / result.corners.length).toFixed(0)}
            </div>
          </div>
          <div className="muted" style={{fontSize:11.5, marginBottom:14, lineHeight:1.5}}>
            Weiß gestrichelt = erwarteter Radius (3 mm). Solid farbig = gemessen.
            Gelbe Pixel = erkannte Whitening-Stellen.
          </div>
          <div className="corner-grid">
            {result.corners.map((c, i) => <CornerVizCard key={i} c={c}/>)}
          </div>
        </div>
      )}

      {result.warnings?.length > 0 && (
        <div className="section panel">
          <div className="panel-hd">
            <div className="panel-title">Hinweise</div>
            <div className="panel-meta">{result.warnings.length} entries</div>
          </div>
          <div className="col" style={{gap:6}}>
            {result.warnings.map((w, i) => (
              <div key={i} className="row" style={{gap:10, padding:"4px 0"}}>
                <span style={{color: w.includes("nicht") || w.includes("fail") ? "var(--rose)" : "var(--text-3)", marginTop:2}}>•</span>
                <span style={{fontSize:13, color:"var(--text-2)"}}>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function _recomputeGradeFromLive(centScore, subs) {
  const parts = [
    { score: centScore,     w: 0.25 },
    { score: subs?.corners, w: 0.30 },
    { score: subs?.edges,   w: 0.25 },
    { score: subs?.surface, w: 0.20 },
  ].filter(p => p.score != null && p.score > 0);
  if (parts.length === 0) return null;
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const composite = parts.reduce((s, p) => s + p.score * p.w, 0) / totalW;
  if (composite >= 95) return 10;
  if (composite >= 85) return 9;
  if (composite >= 75) return 8;
  if (composite >= 65) return 7;
  if (composite >= 55) return 6;
  if (composite >= 45) return 5;
  if (composite >= 35) return 4;
  if (composite >= 25) return 3;
  if (composite >= 15) return 2;
  return 1;
}

// Map a centering subscore (0..100) to a PSA-style 1..10 grade (decimal).
function _scoreToPsa(score) {
  // 100 → 10, 90 → 9.5, 80 → 9, 70 → 8.5, 60 → 8, 50 → 7, 40 → 6, ...
  if (score >= 100) return 10;
  if (score >= 90)  return 9 + (score - 90) / 20;     // 9.0 – 9.5
  if (score >= 80)  return 9;
  if (score >= 70)  return 8.5;
  if (score >= 60)  return 8;
  if (score >= 50)  return 7;
  if (score >= 40)  return 6;
  if (score >= 30)  return 5;
  return 4;
}

function computeGradeProbabilities(grade, conf, low, high) {
  // Build a 4-bar likelihood spectrum centered on `grade`.
  const colours = { 10: "violet", 9: "mint", 8: "amber", 7: "rose", 6: "rose", 5: "rose", 4: "rose", 3: "rose", 2: "rose", 1: "rose" };
  const base = Math.max(grade, 7);
  // When grade=10, base+1=11 clamps to 10 creating a duplicate — always use [base, base-1, base-2, base-3] when at ceiling.
  const rawLabels = base >= 10
    ? [10, 9, 8, 7]
    : [base + 1, base, base - 1, base - 2].map(g => Math.max(1, Math.min(10, g)));
  const peakP = Math.max(35, Math.min(85, conf || 60));
  const sideP = Math.round((100 - peakP) / 3);
  const probs = base >= 10
    ? [peakP, sideP, sideP, 100 - peakP - 2 * sideP]
    : [sideP, peakP, sideP, 100 - peakP - 2 * sideP];
  return rawLabels.map((g, i) => ({ g: g.toString(), p: probs[i], c: colours[g] || "rose" }));
}

function CenteringPlot({ label, lr, reading }) {
  const inset = (lr.l) * 1.6, insetT = (lr.t) * 1.1;
  return (
    <div style={{textAlign:"center", padding:"18px 0"}}>
      <div className="panel-num" style={{marginBottom:14}}>· {label}</div>
      <div style={{position:"relative", width:160, aspectRatio:"63/88", margin:"0 auto", border:"1px solid var(--line-2)", borderRadius:8}}>
        {/* outer crosshairs */}
        <div style={{position:"absolute", left:"50%", top:0, bottom:0, width:1, background:"rgba(244,242,238,0.08)"}}></div>
        <div style={{position:"absolute", top:"50%", left:0, right:0, height:1, background:"rgba(244,242,238,0.08)"}}></div>
        {/* inner border */}
        <div style={{position:"absolute", left: lr.l + "%", right: lr.r + "%", top: lr.t + "%", bottom: lr.b + "%",
                     border:"1px solid var(--mint)", boxShadow:"0 0 18px rgba(184,245,176,0.4)",
                     transformOrigin:"center"}}></div>
      </div>
      <div className="mono" style={{fontSize:11, color:"var(--text-2)", marginTop:14, letterSpacing:"0.06em"}}>{reading}</div>
    </div>
  );
}

// ──────────────────────────── COLLECTION ────────────────────────────
function ScreenCollection({ go, appState }) {
  const [view, setView] = u2S("grid");
  const [selecting, setSelecting] = u2S(false);
  const [selected, setSelected] = u2S(() => new Set());
  const [importModal, setImportModal] = u2S(false);
  const [importPhase, setImportPhase] = u2S(1); // 1=upload 2=mapping 3=done
  const [importFile, setImportFile] = u2S(null);
  const [importHeaders, setImportHeaders] = u2S([]);
  const [importPreview, setImportPreview] = u2S([]);
  const [importMapping, setImportMapping] = u2S({ name_col:"", set_col:"", qty_col:"", lang_col:"", condition_col:"" });
  const [importBusy, setImportBusy] = u2S(false);
  const [importResult, setImportResult] = u2S(null);
  const history = appState?.history || [];
  const cardImages = appState?.cardImages || {};

  const toggleId = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const exitSelection = () => { setSelecting(false); setSelected(new Set()); };
  const selectAll  = () => setSelected(new Set(history.map(h => h.id)));
  const selectNone = () => setSelected(new Set());

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} Karte${ids.length===1?"":"n"} aus der Sammlung löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await Promise.all(ids.map(id => window.HoloAPI.deleteHistory(id)));
      await window.HoloAPI.refreshHistory();
      window.HoloAPI.toast("Gelöscht", `${ids.length} Karte${ids.length===1?"":"n"} aus der Sammlung entfernt.`);
      exitSelection();
    } catch (e) {
      window.HoloAPI.toast("Fehler", e.message || "Löschen fehlgeschlagen.", "error");
    }
  };
  const bulkAddSubmission = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    ids.forEach(id => window.HoloAPI.addToSubmission(id));
    window.HoloAPI.toast("Zu Submission", `${ids.length} Karte${ids.length===1?"":"n"} hinzugefügt.`);
    exitSelection();
  };

  // Map history rows → display cards. Prefer TCGdex CDN image when known
  // (clean / cut-out look); fall back to the warped thumbnail.
  const cards = history.map(h => {
    const grade = h.bgs_composite || h.psa_grade || 0;
    const cdnImg = cardImages[h.id];
    const isUnanalysed = !h.psa_grade && !h.thumbnail_b64;
    return {
      id: h.id,
      name: h.card_name || "Unbenannte Karte",
      set: h.card_set || "—",
      year: "",
      lang: appState?.me?.settings?.card_language?.toUpperCase() || "DE",
      img: cdnImg
        || (h.thumbnail_b64 ? `data:image/jpeg;base64,${h.thumbnail_b64}` : ""),
      grade: grade,
      raw: 0, graded10: 0, graded9: 0,
      status: isUnanalysed ? "unanalysiert" : (h.psa_grade >= 9 ? "graded" : "review"),
      date: h.timestamp ? new Date(h.timestamp).toLocaleDateString("de-DE", {day:"2-digit", month:"short"}) : "",
      trend: "flat",
      isUnanalysed,
    };
  });

  const openCard = (sessionId) => {
    go("card", { sessionId });
  };
  return (
    <div>
      <PageHead
        eyebrow={"03 · Vault · " + cards.length + " card" + (cards.length === 1 ? "" : "s")}
        title='Your <em>collection.</em>'
        sub={cards.length === 0
          ? "Noch keine Karten gescannt — leg los mit New scan."
          : "Klick eine Karte für Vault-Detail mit Centering, Preis-Historie & Population."}
        actions={<>
          <div className="row" style={{padding:4, border:"1px solid var(--line)", borderRadius:10, background:"var(--surf)"}}>
            <button className={"btn " + (view === "grid" ? "" : "btn-ghost")} style={{padding:"6px 12px", borderRadius:7, fontSize:12, background: view === "grid" ? "var(--surf-2)" : "transparent", border:"none"}} onClick={() => setView("grid")}>Grid</button>
            <button className={"btn " + (view === "list" ? "" : "btn-ghost")} style={{padding:"6px 12px", borderRadius:7, fontSize:12, background: view === "list" ? "var(--surf-2)" : "transparent", border:"none"}} onClick={() => setView("list")}>List</button>
          </div>
          {history.length > 0 && (
            <button className={"btn " + (selecting ? "btn-glow" : "btn-ghost")}
                    onClick={() => { selecting ? exitSelection() : setSelecting(true); }}>
              <Ic k="check" s={13}/> {selecting ? "Auswahl beenden" : "Auswählen"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => { window.HoloAPI.exportCsvDownload().catch(e => window.HoloAPI.toast("Fehler", e.message, "error")); }}><Ic k="upload" s={13}/> Export CSV</button>
          <button className="btn btn-ghost" onClick={() => { setImportModal(true); setImportPhase(1); setImportFile(null); setImportHeaders([]); setImportPreview([]); setImportResult(null); }}><Ic k="arrowdn" s={13}/> CSV Import</button>
          <button className="btn btn-glow" onClick={() => go("analyze")}><Ic k="plus" s={13}/> New scan</button>
        </>}
      />

      {selecting && (
        <div className="row" style={{padding:"12px 18px", border:"1px solid var(--line-2)", borderRadius:12, background:"var(--surf-2)", gap:14, marginBottom:18, alignItems:"center"}}>
          <span className="mono" style={{fontSize:11, color:"var(--text-3)", letterSpacing:"0.16em"}}>{selected.size} / {history.length} GEWÄHLT</span>
          <span style={{color:"var(--text-5)"}}>·</span>
          <button className="btn btn-ghost" style={{padding:"6px 10px", fontSize:12}} onClick={selectAll}>Alle</button>
          <button className="btn btn-ghost" style={{padding:"6px 10px", fontSize:12}} onClick={selectNone}>Keine</button>
          <div style={{flex:1}}></div>
          <button className="btn btn-ghost" disabled={selected.size === 0} onClick={bulkAddSubmission}>
            <Ic k="submit" s={13}/> Zu Submission ({selected.size})
          </button>
          <button className="btn btn-ghost" disabled={selected.size === 0}
                  style={{color: selected.size > 0 ? "var(--rose)" : undefined, borderColor: selected.size > 0 ? "rgba(255,143,143,0.3)" : undefined}}
                  onClick={bulkDelete}>
            <Ic k="trash" s={13}/> Löschen ({selected.size})
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="row" style={{padding:"14px 18px", border:"1px solid var(--line)", borderRadius:12, background:"var(--surf)", gap:18, marginBottom:24, flexWrap:"wrap"}}>
        {[
          ["SET", "All · Base · Jungle · Fossil · Promo"],
          ["GRADE", "All · 9.5+ · 9.0 · 8.0+"],
          ["TREND", "All · ↗ rising · ↘ falling"],
          ["STATUS", "All · Graded · Review · Submitted"]
        ].map(([k, v], i) => (
          <div key={i} className="row" style={{gap:6, fontSize:12}}>
            <span className="mono" style={{color:"var(--text-4)", fontSize:10, letterSpacing:"0.14em"}}>{k}</span>
            <span style={{color:"var(--text)"}}>{v}</span>
          </div>
        ))}
        <div style={{flex:1}}></div>
        <span className="mono muted" style={{fontSize:11}}>Sort · Last scanned ↓</span>
      </div>

      {cards.length === 0 ? (
        <div className="panel" style={{padding:48, textAlign:"center"}}>
          <div className="muted" style={{fontSize:14}}>Noch keine analysierten Karten.</div>
          <button className="btn btn-glow" style={{marginTop:18}} onClick={() => go("analyze")}><Ic k="plus" s={13}/> New scan</button>
        </div>
      ) : view === "grid" ? (
        <div className="coll-grid">
          {cards.map((c, i) => {
            const isSel = selected.has(c.id);
            const onClickCard = () => selecting ? toggleId(c.id) : openCard(c.id);
            return (
              <div key={c.id} className={"coll-card-wrap" + (selecting ? " selecting" : "") + (isSel ? " selected" : "")} style={{position:"relative"}}>
                <TiltCard card={c} delay={i * 0.04} onClick={onClickCard}/>
                {c.isUnanalysed && (
                  <div style={{position:"absolute", top:8, left:8, zIndex:2, padding:"2px 6px", background:"var(--amber)", color:"var(--surf)", borderRadius:4, fontSize:9, fontFamily:"var(--mono)", letterSpacing:"0.1em", textTransform:"uppercase", pointerEvents:"none"}}>
                    Nicht analysiert
                  </div>
                )}
                {selecting && (
                  <div className="coll-checkbox" onClick={(e) => { e.stopPropagation(); toggleId(c.id); }}>
                    {isSel ? <Ic k="check" s={14}/> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel" style={{padding:0}}>
          <table className="tbl">
            <thead>
              <tr>
                {selecting && <th style={{width:36}}></th>}
                <th>Card</th><th>Set</th><th>Date</th><th>Grade</th>
                <th style={{textAlign:"right"}}>Centering</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(c => {
                const isSel = selected.has(c.id);
                const onClickRow = () => selecting ? toggleId(c.id) : openCard(c.id);
                return (
                  <tr key={c.id} onClick={onClickRow} style={{cursor:"pointer", background: isSel ? "rgba(184,245,176,0.06)" : undefined}}>
                    {selecting && (
                      <td onClick={(e) => { e.stopPropagation(); toggleId(c.id); }}>
                        <div className={"coll-checkbox-list " + (isSel ? "on" : "")}>
                          {isSel ? <Ic k="check" s={12}/> : null}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="row">
                        <div style={{width:32, aspectRatio:"63/88", borderRadius:4, overflow:"hidden", background:"var(--surf-3)"}}>
                          <img src={c.img} style={{width:"100%", height:"100%", objectFit:"cover"}}/>
                        </div>
                        <span className="name">{c.name}</span>
                      </div>
                    </td>
                    <td>{c.set}</td>
                    <td className="num">{c.date}</td>
                    <td><GradePill g={c.grade / 10}/></td>
                    <td className="num" style={{textAlign:"right"}}>{(history.find(h => h.id === c.id)?.centering || 0).toFixed(0)}</td>
                    <td><span className={"chip " + (c.isUnanalysed ? "amber" : c.status === "graded" ? "mint" : "amber")}><span className="dot"></span>{c.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CSV Import Modal — 3-phase */}
      {importModal && (() => {
        // Fuzzy auto-match header name to a field
        const autoMatch = (headers, candidates) => {
          const lc = candidates.map(c => c.toLowerCase());
          return headers.find(h => lc.includes(h.toLowerCase())) || "";
        };
        const NAME_CANDS  = ["name","card name","card","title","karte"];
        const SET_CANDS   = ["set","set name","expansion","edition","series"];
        const LANG_CANDS  = ["language","lang","sprache"];
        const COND_CANDS  = ["condition","grade","zustand","quality"];
        const QTY_CANDS   = ["qty","quantity","anzahl","count","amount"];
        const closeModal  = () => { setImportModal(false); setImportPhase(1); setImportFile(null); };
        return (
          <div className="holo-modal-back" onClick={closeModal}>
            <div className="holo-modal" style={{maxWidth:560}} onClick={e => e.stopPropagation()}>
              <div className="panel-hd">
                <div>
                  <div className="panel-num">· CSV · Import · Phase {importPhase}/3</div>
                  <div className="panel-title" style={{marginTop:4}}>
                    {importPhase===1 ? "Datei auswählen" : importPhase===2 ? "Spalten zuordnen" : "Fertig"}
                  </div>
                </div>
                <button className="topbar-btn" onClick={closeModal}>×</button>
              </div>

              {importPhase === 1 && (
                <>
                  <div className="muted" style={{fontSize:13, marginBottom:14}}>
                    Collectr, TCGplayer, custom CSV — Komma, Semikolon und Tab werden automatisch erkannt.
                  </div>
                  <div style={{padding:40, border:"1px dashed var(--line-2)", borderRadius:10, textAlign:"center", cursor:"pointer"}}
                       onClick={() => {
                         const inp = document.createElement("input");
                         inp.type = "file"; inp.accept = ".csv,text/csv";
                         inp.onchange = async (ev) => {
                           const f = ev.target.files[0]; if (!f) return;
                           setImportFile(f);
                           setImportBusy(true);
                           try {
                             const preview = await window.HoloAPI.csvPreview(f);
                             setImportHeaders(preview.headers || []);
                             setImportPreview(preview.preview || []);
                             const h = preview.headers || [];
                             setImportMapping({
                               name_col:      autoMatch(h, NAME_CANDS),
                               set_col:       autoMatch(h, SET_CANDS),
                               qty_col:       autoMatch(h, QTY_CANDS),
                               lang_col:      autoMatch(h, LANG_CANDS),
                               condition_col: autoMatch(h, COND_CANDS),
                             });
                             setImportPhase(2);
                           } catch (e) {
                             window.HoloAPI.toast("Fehler", e.message, "error");
                           } finally { setImportBusy(false); }
                         };
                         inp.click();
                       }}>
                    {importBusy
                      ? <span className="muted">Analyse läuft…</span>
                      : <div className="muted"><Ic k="arrowdn" s={24}/><br/><br/>CSV hier ablegen oder klicken</div>}
                  </div>
                </>
              )}

              {importPhase === 2 && (
                <>
                  <div className="muted" style={{fontSize:12, marginBottom:12}}>{importFile?.name} · {importHeaders.length} Spalten erkannt</div>
                  {/* Preview table */}
                  {importPreview.length > 0 && (
                    <div style={{overflowX:"auto", marginBottom:14, fontSize:11}}>
                      <table className="tbl" style={{fontSize:11}}>
                        <thead><tr>{importHeaders.slice(0,6).map((h,j) => <th key={j}>{h}</th>)}</tr></thead>
                        <tbody>{importPreview.slice(0,5).map((row,i) => (
                          <tr key={i}>{row.slice(0,6).map((c,j) => <td key={j}>{c}</td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  {/* Column mapping selects */}
                  {[
                    {key:"name_col",      label:"Kartenname *", required:true},
                    {key:"set_col",       label:"Set-Name"},
                    {key:"qty_col",       label:"Anzahl (qty)"},
                    {key:"lang_col",      label:"Sprache"},
                    {key:"condition_col", label:"Zustand"},
                  ].map(({key, label, required}) => (
                    <div key={key} style={{marginBottom:10}}>
                      <label className="label">{label}</label>
                      <select className="input" value={importMapping[key] || ""}
                              onChange={e => setImportMapping({...importMapping, [key]: e.target.value})}>
                        <option value="">— nicht vorhanden —</option>
                        {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="row" style={{gap:10, marginTop:14}}>
                    <button className="btn btn-ghost" onClick={() => { setImportPhase(1); setImportFile(null); }}>← Andere Datei</button>
                    <button className="btn btn-glow" style={{flex:1, justifyContent:"center"}}
                            disabled={importBusy || !importMapping.name_col}
                            onClick={async () => {
                              setImportBusy(true);
                              try {
                                const result = await window.HoloAPI.importCsv(importFile, importMapping);
                                await window.HoloAPI.refreshHistory();
                                setImportResult(result);
                                setImportPhase(3);
                              } catch (e) {
                                window.HoloAPI.toast("Fehler", e.message || "Import fehlgeschlagen.", "error");
                              } finally { setImportBusy(false); }
                            }}>
                      {importBusy ? "Importiere…" : "Importieren →"}
                    </button>
                  </div>
                </>
              )}

              {importPhase === 3 && importResult && (
                <div style={{textAlign:"center", padding:"24px 0"}}>
                  <div className="kpi-big holo" style={{fontSize:48}}>{importResult.imported}</div>
                  <div className="muted" style={{marginTop:8}}>Karten importiert · {importResult.skipped} übersprungen</div>
                  <button className="btn btn-glow" style={{marginTop:24, padding:"12px 28px"}} onClick={closeModal}>
                    Zur Sammlung
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ──────────────────────────── CARD DETAIL ────────────────────────────
function CardFloat3D({ src }) {
  const ref = u2R(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;
    const ry = (x - 0.5) * 22;
    const rx = (0.5 - y) * 16;
    el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    el.style.setProperty("--hx", `${x * 100}%`);
    el.style.setProperty("--hy", `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transform = "rotateX(0deg) rotateY(0deg)";
  };
  return (
    <div style={{perspective:"900px", flexShrink:0, width:200}}>
      <div ref={ref}
           style={{
             width:200, aspectRatio:"63/88", borderRadius:14, overflow:"hidden",
             border:"1px solid var(--line-2)",
             boxShadow:"0 24px 64px -12px rgba(0,0,0,0.7), 0 0 48px rgba(196,165,255,0.25)",
             transition:"transform 0.08s ease",
             cursor:"pointer", position:"relative",
             transformStyle:"preserve-3d",
           }}
           onMouseMove={onMove}
           onMouseLeave={onLeave}>
        <img src={src} style={{width:"100%", height:"100%", objectFit:"cover"}} draggable={false}
             onError={(e) => e.target.style.display="none"}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%, rgba(0,0,0,0.12) 100%)", pointerEvents:"none"}}></div>
      </div>
    </div>
  );
}

function ScreenCard({ go, appState }) {
  const sessionId = appState?.activeSession;
  const histRow = appState?.history?.find(h => h.id === sessionId);
  const [info, setInfo] = u2S(null);
  const [result, setResult] = u2S(null);  // full AnalysisResult (clean images, corners, centering)
  const [scanFront, setScanFront] = u2S(null);  // blob URL for the user's original front photo
  const [scanBack,  setScanBack]  = u2S(null);

  u2E(() => {
    if (!sessionId) return;
    setResult(null);
    const cardId = histRow?.card_id && histRow.card_id.trim();
    const hint   = histRow?.card_name && histRow.card_name.trim();
    const lang   = appState?.me?.settings?.card_language || "de";
    if (cardId) {
      // Exact match — safe to use full result (name, image, prices)
      setInfo(null);
      window.HoloAPI.lookupCard(sessionId, undefined, cardId, lang)
        .then(setInfo).catch(() => {});
    } else if (hint) {
      // Name-only — use result only for image_url + prices (not name/set to avoid wrong variant)
      window.HoloAPI.lookupCard(sessionId, hint, undefined, lang)
        .then(r => {
          if (!r) return;
          setInfo(prev => ({
            ...(prev || {}),
            image_url:      r.image_url || prev?.image_url || "",
            prices:         r.prices    || prev?.prices    || [],
            raw_nm_price:   r.raw_nm_price ?? prev?.raw_nm_price,
            currency:       r.currency  || prev?.currency  || "EUR",
            cardmarket_url: r.cardmarket_url || prev?.cardmarket_url || "",
          }));
        }).catch(() => {});
    }
    window.HoloAPI.getHistoryItem(sessionId).then(setResult).catch(() => {});
  }, [sessionId, histRow?.card_id]);

  // Auth-gated original-scan fetch (the upload may be back/front; back is optional).
  u2E(() => {
    if (!sessionId) return;
    let aborted = false;
    const urls = [];
    const fetchScan = async (side, setter) => {
      try {
        const uid = localStorage.getItem("meckgrade.holo.userId");
        const r = await fetch(`/api/scan/${sessionId}/${side}`, {
          headers: uid ? { "X-User-Id": uid } : {},
        });
        if (!r.ok) return;
        const blob = await r.blob();
        if (aborted) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setter(url);
      } catch { /* missing back/front is ok */ }
    };
    fetchScan("front", setScanFront);
    fetchScan("back",  setScanBack);
    return () => { aborted = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [sessionId]);

  if (!sessionId || !histRow) {
    return (
      <div className="content">
        <PageHead eyebrow="Vault" title='No <em>card</em> selected.' sub="Bitte zur Sammlung gehen und eine Karte auswählen."/>
        <button className="btn btn-glow" onClick={() => go("collection")}>← Collection</button>
      </div>
    );
  }

  const grade = (histRow.psa_grade || 0);
  const cardName = info?.name || histRow.card_name || "Unbenannte Karte";
  const setName  = info?.set_name || histRow.card_set || "—";
  const number   = info?.number || histRow.card_number || "";
  const rarity   = info?.rarity || "";
  const tcgdexImg = info?.image_url || "";
  const warpedFront = result?.clean_front_b64 ? `data:image/jpeg;base64,${result.clean_front_b64}` : "";
  const warpedBack  = result?.clean_back_b64  ? `data:image/jpeg;base64,${result.clean_back_b64}`  : "";
  const prices   = info?.prices || [];
  const centeringFront = result?.centering_front;
  const corners = result?.corners || [];

  return (
    <div>
      <Topbar crumbs={["Vault", "Collection", cardName + " · " + setName]}/>
      <div className="content">
        <div className="row" style={{gap:14, marginBottom:18, fontFamily:"var(--mono)", fontSize:11, color:"var(--text-3)", letterSpacing:"0.14em", textTransform:"uppercase"}}>
          <span style={{color:"var(--text)", cursor:"pointer"}} onClick={() => go("collection")}>← Collection</span>
          <span>·</span>
          <span>{sessionId.slice(0, 8)}</span>
          <span>·</span>
          <span>{histRow.timestamp ? new Date(histRow.timestamp).toLocaleString("de-DE") : ""}</span>
        </div>

        {/* HERO: 3D card + card title + chips + market + actions */}
        <div style={{display:"grid", gridTemplateColumns: tcgdexImg ? "200px minmax(0,1fr) minmax(280px,1fr)" : "minmax(0, 1.4fr) minmax(320px, 1fr)", gap:32, alignItems:"start", marginBottom:28}}>
          {tcgdexImg && <CardFloat3D src={tcgdexImg}/>}
          <div>
            <div className="eyebrow">{setName} {number ? "· #" + number : ""} {rarity ? "· " + rarity : ""}</div>
            <h1 className="page-title" style={{fontSize:48, marginTop:6, marginBottom:14}}>{cardName}<em>.</em></h1>
            <div className="row" style={{gap:8, flexWrap:"wrap"}}>
              <span className="chip holo">MeckScore PSA {grade}</span>
              {info?.raw_nm_price != null && <span className="chip"><span className="dot" style={{background:"var(--text-3)"}}></span>RAW {info.currency === "EUR" ? "€" : "$"}{info.raw_nm_price.toFixed(2)}</span>}
              <span className="chip"><span className="dot" style={{background:"var(--text-3)"}}></span>{(histRow.centering || 0).toFixed(0)}/100 CENTER</span>
              {histRow.tags && histRow.tags.split(",").filter(t => t && t !== "submitted").map((t, i) => (
                <span key={i} className="chip"><span className="dot"></span>{t.trim()}</span>
              ))}
            </div>
            <div style={{marginTop:18, maxWidth:520}}>
              <CardSearch
                placeholder="Karten-Name korrigieren — Live-Vorschläge…"
                onPick={async (card) => {
                  const i = await window.HoloAPI.lookupCard(sessionId, card.name, card.id);
                  setInfo(i);
                }}
                onSearch={async (q) => {
                  const i = await window.HoloAPI.lookupCard(sessionId, q);
                  setInfo(i);
                }}
              />
            </div>
            <div className="row" style={{gap:10, marginTop:18, flexWrap:"wrap"}}>
              <button className="btn btn-ghost" onClick={() => go("collection")}>← Vault</button>
              {appState?.watchlist?.some(w => w.sessionId === sessionId) ? (
                <button className="btn btn-ghost"
                        style={{color:"var(--rose)", borderColor:"rgba(255,143,143,0.3)"}}
                        onClick={() => { window.HoloAPI.removeFromWatchlist(sessionId); window.HoloAPI.toast("Watchlist", `${cardName} entfernt.`); }}>
                  <Ic k="eye" s={14}/> Unwatch
                </button>
              ) : (
                <button className="btn btn-ghost"
                        onClick={() => { window.HoloAPI.addToWatchlist({ sessionId, card: cardName, ts: Date.now() }); window.HoloAPI.toast("Auf Watchlist", `${cardName} wird beobachtet.`); }}>
                  <Ic k="eye" s={14}/> Watch
                </button>
              )}
              <button className="btn btn-ghost"
                      onClick={() => { window.HoloAPI.addToSubmission(sessionId); window.HoloAPI.toast("Zu Submission", `${cardName} hinzugefügt.`); }}>
                <Ic k="submit" s={14}/> Submission
              </button>
              <button className="btn btn-ghost"
                      style={{color:"var(--rose)", borderColor:"rgba(255,143,143,0.3)"}}
                      onClick={async () => {
                        if (!confirm(`${cardName} aus der Sammlung entfernen?`)) return;
                        await window.HoloAPI.deleteHistory(sessionId);
                        await window.HoloAPI.refreshHistory();
                        go("collection");
                      }}>
                <Ic k="trash" s={14}/> Löschen
              </button>
            </div>
          </div>

          {/* Market table */}
          {prices.length > 0 ? (
            <div className="panel">
              <div className="panel-hd">
                <div className="panel-title">Markt · live</div>
                <div className="panel-meta">{info?.currency} · TCGdex</div>
              </div>
              <table className="tbl">
                <thead><tr><th>Quelle</th><th style={{textAlign:"right"}}>Preis</th></tr></thead>
                <tbody>
                  {prices.slice(0, 8).map((p, i) => (
                    <tr key={i}>
                      <td>{typeof p.grade === "number" ? "PSA " + p.grade : p.grade}</td>
                      <td className="num" style={{textAlign:"right", color: typeof p.grade === "number" && p.grade >= 9 ? "var(--mint)" : "var(--text)"}}>{p.price_str}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {info?.cardmarket_url && (
                <div className="row" style={{marginTop:12, gap:8}}>
                  <a className="btn btn-ghost" href={info.cardmarket_url} target="_blank" rel="noreferrer">Cardmarket →</a>
                  {info.name && (
                    <a className="btn btn-ghost"
                       href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(((info.name||"") + " " + (info.set_name||"")).trim())}`}
                       target="_blank" rel="noreferrer">TCGplayer →</a>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="panel">
              <div className="panel-hd"><div className="panel-title">Markt</div><div className="panel-meta">offen</div></div>
              <div className="muted" style={{fontSize:13, marginBottom: (info?.cardmarket_url || info?.name) ? 12 : 0}}>
                Sobald die Karte bestätigt ist, erscheinen hier Live-Preise.
              </div>
              {(info?.cardmarket_url || info?.name) && (
                <div className="row" style={{gap:8}}>
                  {info?.cardmarket_url && (
                    <a className="btn btn-ghost" href={info.cardmarket_url} target="_blank" rel="noreferrer">Cardmarket →</a>
                  )}
                  {info?.name && (
                    <a className="btn btn-ghost"
                       href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(((info.name||"") + " " + (info.set_name||"")).trim())}`}
                       target="_blank" rel="noreferrer">TCGplayer →</a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* IMAGES: original scan(s) · warped · tcgdex */}
        <div className="section">
          <div className="section-hd">
            <div>
              <div className="panel-num">· Scan archive</div>
              <h2 className="section-title" style={{marginTop:6}}>Hochgeladene Bilder + Analyse</h2>
            </div>
            <div className="panel-meta">{warpedFront ? "Warped + Original" : "—"}</div>
          </div>
          <div className="card-detail-imgs">
            <CardImgPanel label="Original · Vorderseite" sub={`${(histRow.psa_grade ? "PSA " + histRow.psa_grade + " · " : "")}gerendert ${histRow.timestamp ? new Date(histRow.timestamp).toLocaleDateString("de-DE") : ""}`}
                          src={scanFront} fallback="kein Original gespeichert"/>
            <CardImgPanel label="Warped · zentriert"
                          sub={centeringFront ? `L/R ${centeringFront.lr_percent} · O/U ${centeringFront.tb_percent}` : "—"}
                          src={warpedFront} fallback="kein warped Bild"/>
            {(scanBack || warpedBack) && (
              <CardImgPanel label="Rückseite · Original" sub="" src={scanBack} fallback="keine Rückseite gescannt"/>
            )}
            {/* TCGdex Referenzbild ist jetzt als schwebendes 3D-Bild oben im Hero */}
          </div>
        </div>

        {/* CORNER ANALYSIS */}
        {corners.length > 0 && (
          <div className="section panel">
            <div className="panel-hd">
              <div className="panel-title">Ecken · Detail</div>
              <div className="panel-meta">
                worst {Math.min(...corners.map(c => c.corner_score)).toFixed(0)} ·
                avg {(corners.reduce((s,c) => s + c.corner_score, 0) / corners.length).toFixed(0)}
              </div>
            </div>
            <div className="corner-grid">
              {corners.map((c, i) => <CornerVizCard key={i} c={c}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CardImgPanel({ label, sub, src, fallback }) {
  return (
    <div className="card-img-panel">
      <div className="card-img-frame">
        {src ? (
          <img src={src} alt={label} draggable="false" onError={(e) => e.target.style.display="none"}/>
        ) : (
          <div className="card-img-empty">{fallback || "—"}</div>
        )}
      </div>
      <div className="card-img-meta">
        <div className="panel-num">· {label}</div>
        {sub && <div className="mono" style={{fontSize:11, color:"var(--text-2)", marginTop:4}}>{sub}</div>}
      </div>
    </div>
  );
}

function PriceChart() {
  const W = 720, H = 180, P = 6;
  const months = 12;
  const raw    = [380, 410, 420, 440, 480, 460, 500, 530, 550, 560, 570, 580];
  const psa9   = [1800, 1840, 1880, 1900, 1950, 2050, 2100, 2180, 2240, 2320, 2380, 2400];
  const psa10  = [6800, 7000, 7100, 7400, 7600, 7900, 8200, 8400, 8600, 8800, 9000, 9200];
  const max = Math.max(...psa10) * 1.1;
  const path = (d) => d.map((v, i) => `${P + (i / (months-1)) * (W - 2*P)},${H - P - (v/max) * (H - 2*P)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{maxHeight:200}}>
      <defs>
        <linearGradient id="pc-mint" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(184,245,176,0.35)"/>
          <stop offset="100%" stopColor="rgba(184,245,176,0)"/>
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((y, i) => (
        <line key={i} x1={P} x2={W-P} y1={H * y} y2={H * y} stroke="rgba(244,242,238,0.04)" strokeDasharray="2 4"/>
      ))}
      <polygon points={`${P},${H-P} ${path(psa10)} ${W-P},${H-P}`} fill="url(#pc-mint)"/>
      <polyline points={path(psa10)} fill="none" stroke="var(--mint)" strokeWidth="2" strokeLinecap="round"/>
      <polyline points={path(psa9)} fill="none" stroke="var(--violet)" strokeWidth="1.6" strokeLinecap="round"/>
      <polyline points={path(raw)} fill="none" stroke="var(--text-4)" strokeWidth="1.4" strokeDasharray="3 3" strokeLinecap="round"/>
      <circle cx={W-P} cy={H-P-(psa10[months-1]/max)*(H-2*P)} r="4" fill="var(--mint)" style={{filter:"drop-shadow(0 0 6px var(--mint))"}}/>
    </svg>
  );
}

function PopBars({ data }) {
  return (
    <div className="col" style={{gap:10, marginTop:8}}>
      {data.map((d, i) => (
        <div key={i} className="row" style={{gap:14}}>
          <span className="mono" style={{width:80, fontSize:11, color:"var(--text-2)", letterSpacing:"0.08em"}}>{d.g}</span>
          <div style={{flex:1, height:8, background:"var(--surf-3)", borderRadius:4, overflow:"hidden"}}>
            <div style={{height:"100%", width: (d.v/d.max)*100 + "%", background: d.c, borderRadius:4, transformOrigin:"left", animation:"barFill 1s cubic-bezier(.2,.8,.2,1) both"}}></div>
          </div>
          <span className="mono tnum" style={{width:80, fontSize:12, textAlign:"right", color:"var(--text)"}}>{d.v.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

window.ScreenResult = ScreenResult;
window.ScreenCollection = ScreenCollection;
window.ScreenCard = ScreenCard;
