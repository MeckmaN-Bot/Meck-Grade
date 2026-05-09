// MeckGrade Holo — Screens C: Submission, Watchlist, Crack & Resub, Population, Stub

// ──────────────────────────── SUBMISSION ────────────────────────────
function ScreenSubmission({ go, appState }) {
  const submissionIds = appState?.submission || [];
  const history = appState?.history || [];
  const cards = submissionIds
    .map(sid => history.find(h => h.id === sid))
    .filter(Boolean)
    .map(h => ({
      id: h.id,
      name: h.card_name || "Unbenannte Karte",
      set: h.card_set || "—",
      img: h.thumbnail_b64 ? `data:image/jpeg;base64,${h.thumbnail_b64}` : "",
      grade: (h.psa_grade || 0),
      raw: 0,
      graded10: 0, graded9: 0,
    }));

  const subId = `MGB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${cards.length.toString().padStart(2, "0")}`;
  const totalRaw = cards.reduce((s, c) => s + c.raw, 0);
  const totalGraded = cards.reduce((s, c) => s + c.graded10 * 0.6 + c.graded9 * 0.3 + c.raw * 0.1, 0);
  const fee = cards.length * 28;
  const ship = 22;
  const ev = totalGraded - totalRaw - fee - ship;
  const removeCard = (sid) => window.HoloAPI.removeFromSubmission(sid);

  const _esc = (s) => (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const printLabels = () => {
    if (cards.length === 0) {
      return window.HoloAPI.toast("Leere Submission", "Erst Karten hinzufügen.", "warn");
    }
    const labelHtml = cards.map((c, i) => `
      <div class="lbl">
        <div class="lbl-thumb">${c.img ? `<img src="${c.img}"/>` : ""}</div>
        <div class="lbl-body">
          <div class="lbl-id">${subId} · #${String(i+1).padStart(2, "0")}</div>
          <div class="lbl-name">${_esc(c.name)}</div>
          <div class="lbl-set">${_esc(c.set)}</div>
          <div class="lbl-meta">PSA target ${c.grade || "—"} · ${c.id.slice(0, 8)}</div>
          <div class="lbl-bar">${
            c.id.slice(0, 12).split("").map(ch => {
              const w = (ch.charCodeAt(0) % 4) + 1;
              return `<span style="width:${w}px"></span>`;
            }).join("")
          }</div>
        </div>
      </div>
    `).join("");

    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) {
      window.HoloAPI.toast("Popup blockiert", "Bitte Popup-Blocker für meckgrade deaktivieren.", "error");
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${subId} · Labels</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, system-ui, sans-serif; color: #111; background: #fff; padding: 8mm; }
        h1 { font-size: 14pt; margin: 0 0 4mm; letter-spacing: -0.02em; }
        .meta { font-size: 9pt; color: #666; margin-bottom: 6mm; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5mm; }
        .lbl { display: flex; gap: 4mm; padding: 4mm; border: 1px solid #000; border-radius: 2mm; page-break-inside: avoid; }
        .lbl-thumb { width: 22mm; aspect-ratio: 63/88; background: #eee; flex-shrink: 0; overflow: hidden; border-radius: 1mm; }
        .lbl-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .lbl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
        .lbl-id { font-family: ui-monospace, Menlo, monospace; font-size: 7pt; letter-spacing: 0.05em; color: #555; text-transform: uppercase; }
        .lbl-name { font-size: 11pt; font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; }
        .lbl-set { font-size: 8.5pt; color: #444; }
        .lbl-meta { font-family: ui-monospace, Menlo, monospace; font-size: 7pt; color: #666; margin-top: auto; }
        .lbl-bar { display: flex; gap: 1px; height: 6mm; align-items: stretch; margin-top: 1mm; }
        .lbl-bar span { background: #000; display: inline-block; height: 100%; }
        .foot { margin-top: 8mm; font-size: 8pt; color: #666; text-align: center; padding-top: 3mm; border-top: 1px solid #ccc; }
        @media print { .no-print { display: none; } }
        .topbar { position: sticky; top: 0; background: #fff; padding: 4mm 0; border-bottom: 1px solid #ccc; margin-bottom: 4mm; display: flex; justify-content: space-between; align-items: center; }
        .topbar button { padding: 6px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 10pt; }
        .topbar button.ghost { background: #fff; color: #000; }
      </style>
    </head><body>
      <div class="topbar no-print">
        <div>
          <h1 style="margin:0">${subId} · ${cards.length} Karte${cards.length===1?"":"n"}</h1>
          <div class="meta" style="margin:2mm 0 0">Drucken oder als PDF speichern (⌘P / Ctrl+P)</div>
        </div>
        <div>
          <button class="ghost" onclick="window.close()">Schließen</button>
          <button onclick="window.print()">Drucken / Als PDF</button>
        </div>
      </div>
      <h1>MeckGrade Submission · ${subId}</h1>
      <div class="meta">${new Date().toLocaleString("de-DE")} · PSA Express · ${cards.length} Karten · Insured to €50,000</div>
      <div class="grid">${labelHtml}</div>
      <div class="foot">${subId} · MeckGrade · meckgrade.app</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); } catch {} }, 200);
  };

  const lockSubmission = async () => {
    if (cards.length === 0) {
      return window.HoloAPI.toast("Leere Submission", "Erst Karten hinzufügen.", "warn");
    }
    if (!confirm(
      `Submission ${subId} mit ${cards.length} Karte${cards.length===1?"":"n"} lock & ship?\n\n` +
      `Karten werden mit "submitted" getaggt und aus der Builder-Liste entfernt.\n` +
      `ETA: ~10 Werktage. Versicherung: €50.000.`
    )) return;

    try {
      // Tag every card with the submission ID. Tags are comma-separated; we
      // try to preserve any pre-existing tags by reading them off the row.
      await Promise.all(cards.map(c => {
        const row = history.find(h => h.id === c.id);
        const existing = (row?.tags || "").split(",").map(s => s.trim()).filter(Boolean);
        const next = Array.from(new Set([...existing, "submitted", subId])).join(",");
        return window.HoloAPI.patchHistoryTags(c.id, next);
      }));
      // Clear the builder cart.
      cards.forEach(c => window.HoloAPI.removeFromSubmission(c.id));
      await window.HoloAPI.refreshHistory();

      const eta = new Date(); eta.setDate(eta.getDate() + 14);
      window.HoloAPI.toast(
        `Locked · ${subId}`,
        `${cards.length} Karten versendet. ETA ${eta.toLocaleDateString("de-DE", {day:"2-digit", month:"short"})}`,
        "ok",
        4500
      );
      go("collection");
    } catch (e) {
      window.HoloAPI.toast("Fehler", e.message || "Lock fehlgeschlagen.", "error");
    }
  };

  return (
    <div>
      <PageHead
        eyebrow="04 · Submission · Builder"
        title='<em>Bundle</em> the batch.'
        sub="Group cards into one PSA submission. We project blended payout, grading fees and the net value above raw — live."
        actions={<>
          <button className="btn btn-ghost" onClick={printLabels} disabled={cards.length === 0}>
            <Ic k="upload" s={14}/> Print labels
          </button>
          <button className="btn btn-glow" onClick={lockSubmission} disabled={cards.length === 0}>
            <Ic k="check" s={13}/> Lock & ship
          </button>
        </>}
      />

      <div className="row" style={{gap:14, marginBottom:24, padding:"14px 18px", border:"1px solid var(--line)", borderRadius:12, background:"var(--surf)"}}>
        <span className="mono" style={{fontSize:11, color:"var(--text-3)", letterSpacing:"0.16em"}}>SUBMISSION ID</span>
        <span className="mono" style={{fontSize:13, color:"var(--text)"}}>{subId}</span>
        <span style={{color:"var(--text-5)"}}>·</span>
        <span className="chip mint"><span className="dot"></span>READY · {cards.length} CARDS</span>
        <span style={{color:"var(--text-5)"}}>·</span>
        <span className="muted">Tier: PSA Express · 10 business day · Insured to €50,000</span>
        <div style={{flex:1}}></div>
        <button className="btn btn-ghost" onClick={() => go("collection")}><Ic k="plus" s={13}/> Add from vault</button>
      </div>

      <div className="grid-2" style={{gridTemplateColumns:"1.4fr 1fr", alignItems:"start"}}>
        <div>
          <div className="row-between" style={{marginBottom:14, padding:"0 4px"}}>
            <div className="panel-num">· Items · {cards.length}</div>
            <div className="panel-num">· Drag to reorder</div>
          </div>
          <div>
            {cards.length === 0 && (
              <div className="muted" style={{padding:"24px 0", textAlign:"center", fontSize:13}}>
                Keine Karten in dieser Submission. Aus der Sammlung hinzufügen.
              </div>
            )}
            {cards.map((c, i) => (
              <div key={c.id} className="sub-row fade-up" style={{animationDelay:(i*0.05)+"s"}}>
                <span className="mono" style={{fontSize:11, color:"var(--text-4)", letterSpacing:"0.14em"}}>{String(i+1).padStart(2,"0")}</span>
                <div className="thumb">{c.img && <img src={c.img}/>}</div>
                <div>
                  <div style={{fontWeight:600}}>{c.name}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--text-3)", letterSpacing:"0.04em"}}>{c.set} · {c.id.slice(0, 8)}</div>
                </div>
                <div>
                  <div className="panel-num">· Predicted</div>
                  <div className="mono" style={{fontSize:14, color:"var(--text)", marginTop:3, fontWeight:500}}>PSA {c.grade}</div>
                </div>
                <div>
                  <div className="panel-num">· Centering</div>
                  <div className="mono" style={{fontSize:14, color:"var(--text-2)", marginTop:3}}>{(history.find(h => h.id === c.id)?.centering || 0).toFixed(0)}/100</div>
                </div>
                <div>
                  <div className="panel-num">· Status</div>
                  <div className="mono" style={{fontSize:14, color: c.grade >= 9 ? "var(--mint)" : "var(--amber)", marginTop:3, fontWeight:500}}>{c.grade >= 9 ? "READY" : "REVIEW"}</div>
                </div>
                <button className="topbar-btn" style={{width:28, height:28}} onClick={() => removeCard(c.id)} title="Entfernen"><span style={{fontSize:18, lineHeight:1}}>×</span></button>
              </div>
            ))}
          </div>

          <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:6, padding:14, borderStyle:"dashed"}} onClick={() => go("collection")}>
            <Ic k="plus" s={14}/> Karte aus Sammlung hinzufügen
          </button>
        </div>

        {/* Sticky summary */}
        <div className="panel panel-holo" style={{position:"sticky", top:96}}>
          <div className="panel-num" style={{marginBottom:18}}>· Submission summary · live</div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:0}}>
            <div style={{padding:"6px 0"}}>
              <div className="panel-num" style={{marginBottom:6}}>· Cards</div>
              <div className="kpi-big" style={{fontSize:32}}>{cards.length}</div>
            </div>
            <div style={{padding:"6px 0", borderLeft:"1px solid var(--line)", paddingLeft:18}}>
              <div className="panel-num" style={{marginBottom:6}}>· Avg. predicted</div>
              <div className="kpi-big" style={{fontSize:32}}>{(cards.reduce((s, c) => s + c.grade, 0) / cards.length).toFixed(1)}</div>
            </div>
          </div>

          <div style={{margin:"24px 0", paddingTop:18, borderTop:"1px solid var(--line)"}}>
            {[
              ["Total raw value",     "€" + totalRaw.toLocaleString(),       "var(--text-2)"],
              ["Predicted graded",    "€" + Math.round(totalGraded).toLocaleString(),  "var(--text)"],
              ["PSA grading fee",     "−€" + fee.toLocaleString(),           "var(--text-3)"],
              ["Insured shipping",    "−€" + ship.toLocaleString(),          "var(--text-3)"]
            ].map(([k, v, c], i) => (
              <div key={i} className="row-between" style={{padding:"10px 0", borderBottom:"1px solid var(--line)"}}>
                <span className="muted" style={{fontSize:13}}>{k}</span>
                <span className="mono" style={{fontSize:13, color:c}}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{padding:"18px 0"}}>
            <div className="panel-num" style={{marginBottom:8}}>· Net Expected Value</div>
            <div className="kpi-big holo">{cards.length === 0 ? "—" : (ev > 0 ? "+" : "") + "€" + Math.round(ev).toLocaleString()}</div>
            <div className="muted" style={{fontSize:12, marginTop:8}}>
              {cards.length === 0
                ? "Sobald Karten + Marktpreise vorliegen, wird hier der erwartete Net-EV berechnet."
                : "Berechnet aus Cardmarket-Preisen + PSA-Multipliern (heuristisch)."}
            </div>
          </div>

          <button className="btn btn-glow" style={{width:"100%", justifyContent:"center", marginTop:8}}
                  onClick={lockSubmission} disabled={cards.length === 0}>
            <Ic k="check" s={13}/> Lock &amp; ship to PSA
          </button>
          <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:8}}
                  onClick={printLabels} disabled={cards.length === 0}>
            <Ic k="upload" s={13}/> Print labels (PDF)
          </button>
          <div className="muted mono" style={{fontSize:10.5, textAlign:"center", marginTop:12, letterSpacing:"0.12em", textTransform:"uppercase"}}>
            ETA · 22 May · 10 business days
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── WATCHLIST ────────────────────────────
function ScreenWatchlist({ go, appState }) {
  const w = appState?.watchlist || [];
  return (
    <div>
      <PageHead
        eyebrow="05 · Submission · Watchlist"
        title='<em>Triggers</em> on the prowl.'
        sub="Beobachte Karten mit Markt-Triggern — ROI-Schwelle, Population, Set-Jubiläum. Trigger werden lokal gespeichert; Live-Alerts kommen in einem späteren Build."
        actions={<button className="btn btn-glow" onClick={() => go("collection")}><Ic k="plus" s={13}/> Karte aus Vault watchen</button>}
      />

      <div className="panel" style={{padding:0}}>
        {w.length === 0 ? (
          <div className="muted" style={{padding:48, textAlign:"center", fontSize:13}}>
            Keine Karten beobachtet. Im Karten-Detail "Watch this" klicken.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Card</th>
                <th>Session</th>
                <th>State</th>
                <th style={{textAlign:"right"}}>Added</th>
              </tr>
            </thead>
            <tbody>
              {w.map((row, i) => (
                <tr key={i}>
                  <td className="name">{row.card || "—"}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--text-3)"}}>{(row.sessionId || "").slice(0, 12)}</td>
                  <td>
                    <span className="chip violet"><span className="dot"></span>armed</span>
                  </td>
                  <td className="num" style={{textAlign:"right", color:"var(--text-3)"}}>{row.ts ? new Date(row.ts).toLocaleString("de-DE") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trigger archetypes */}
      <div className="section">
        <div className="section-hd">
          <div className="section-title">Trigger archetypes</div>
          <div className="panel-meta">Templates · drop on any card</div>
        </div>
        <div className="grid-3">
          {[
            { ic:"chart",  t:"ROI threshold", s:"Notify when projected net EV crosses your floor.", n:"01" },
            { ic:"pop",    t:"Population shift", s:"Trip when PSA population grows past a multiple.", n:"02" },
            { ic:"flag",   t:"Set anniversary", s:"Auto-arm two weeks before set milestones.", n:"03" }
          ].map((a, i) => (
            <div key={i} className="panel" style={{padding:22}}>
              <div className="row-between">
                <span className="panel-num">· {a.n}</span>
                <span style={{color:"var(--text-3)"}}><Ic k={a.ic}/></span>
              </div>
              <div style={{fontFamily:"var(--display)", fontWeight:600, fontSize:20, letterSpacing:"-0.02em", marginTop:14}}>{a.t}</div>
              <div className="muted" style={{fontSize:13, marginTop:6}}>{a.s}</div>
              <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:18}}
                onClick={() => {
                  const sid = appState?.activeSession;
                  const card = (appState?.history || []).find(h => h.id === sid);
                  window.HoloAPI.addToWatchlist({
                    card: card ? (card.card_name || "Unbenannte") : `Template · ${a.t}`,
                    sessionId: sid || null,
                    trigger: a.t,
                  });
                  window.HoloAPI.toast("Watchlist", `Trigger "${a.t}" hinzugefügt.`);
                }}>Use template</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── CRACK & RESUB ────────────────────────────
function _computeResubSim(grade, centering) {
  const cf = Math.max(0, Math.min(1, (centering || 50) / 100));
  if (grade >= 9.5) return { p10: 45, p95: 35, p9: 15, plow: 5 };
  if (grade >= 9) {
    const p10  = Math.round(18 + cf * 14);
    const p95  = Math.round(38 + cf * 12);
    const p9   = Math.round(32 - cf * 8);
    return { p10, p95, p9, plow: Math.max(0, 100 - p10 - p95 - p9) };
  }
  if (grade >= 8.5) return { p10: 12, p95: 34, p9: 38, plow: 16 };
  if (grade >= 8)   return { p10:  6, p95: 20, p9: 40, plow: 34 };
  return { p10: 2, p95: 10, p9: 30, plow: 58 };
}

function ScreenResub({ go, appState }) {
  const [simResult, setSimResult] = uS(null);

  // Real card if user has an active session + history; fallback to mock for empty state.
  const sid = appState?.activeSession;
  const histRow = appState?.history?.find(h => h.id === sid);
  const cdnImg = appState?.cardImages?.[sid];
  const c = histRow ? {
    id: histRow.id,
    name: histRow.card_name || "Unbenannte Karte",
    set: histRow.card_set || "—",
    img: cdnImg || (histRow.thumbnail_b64 ? `data:image/jpeg;base64,${histRow.thumbnail_b64}` : ""),
    grade: histRow.psa_grade || 0,
    centering: histRow.centering || 50,
  } : { ...HData.cards[0], centering: 50 };

  const projGrade = c.grade >= 9.5 ? "10" : c.grade >= 9 ? "9.5" : "9";
  const prob = simResult || { p10: 22, p95: 41, p9: 28, plow: 9 };
  const blendedPayout = simResult
    ? Math.round(2200 * (simResult.p10 / 100) + 1400 * (simResult.p95 / 100) +
                 800  * (simResult.p9  / 100) +  480  * (simResult.plow / 100))
    : 0;
  const netEv = blendedPayout > 0 ? blendedPayout - 8 - 95 - 22 : 0;

  const runSim = () => {
    const result = _computeResubSim(c.grade, c.centering);
    setSimResult(result);
    window.HoloAPI.toast("Simulation fertig", "Re-Grade-Wahrscheinlichkeit berechnet — Model v3.1");
  };

  return (
    <div>
      <PageHead
        eyebrow="06 · Submission · Crack &amp; Resub"
        title='<em>Crack</em> the slab?'
        sub="The model simulates a re-grade with adjusted variance based on slab tolerance, market shifts and your rolling success rate. Use with care."
        actions={<button className="btn btn-glow" onClick={runSim}>Run simulation</button>}
      />

      <div className="grid-2" style={{gridTemplateColumns:"1.1fr 1fr", alignItems:"start"}}>
        <div className="panel" style={{padding:30}}>
          <div className="panel-num">· Subject</div>
          <h3 style={{fontFamily:"var(--display)", fontWeight:700, fontSize:32, letterSpacing:"-0.02em", margin:"6px 0 22px"}}>{c.name} · current slab</h3>

          <div className="row" style={{gap:30, alignItems:"flex-start"}}>
            {/* Before */}
            <div style={{flex:1}}>
              <div className="panel-num" style={{marginBottom:10}}>· Current</div>
              <div style={{position:"relative", borderRadius:12, overflow:"hidden", border:"1px solid var(--line-2)"}}>
                <img src={c.img} style={{width:"100%", display:"block", filter:"saturate(0.7) brightness(0.6)"}}/>
                <div style={{position:"absolute", top:10, right:10, padding:"4px 10px", borderRadius:5, background:"var(--bg)", fontFamily:"var(--display)", fontWeight:700, fontSize:14, color:"var(--text)", border:"1px solid var(--line-2)"}}>
                  PSA {c.grade > 0 ? c.grade : "—"}
                </div>
              </div>
              <div className="row-between" style={{marginTop:14, padding:"12px 14px", border:"1px solid var(--line)", borderRadius:8}}>
                <span className="muted">Predicted grade</span>
                <span className="mono" style={{color:"var(--text)", fontWeight:500}}>PSA {c.grade || "—"}</span>
              </div>
            </div>

            <div style={{display:"flex", alignItems:"center", justifyContent:"center", paddingTop:60, color:"var(--text-3)"}}>
              <div style={{position:"relative"}}>
                <Ic k="arrow" s={32}/>
                <div className="mono" style={{fontSize:9, color:"var(--text-4)", letterSpacing:"0.18em", textAlign:"center", marginTop:6}}>RESUB</div>
              </div>
            </div>

            {/* After */}
            <div style={{flex:1}}>
              <div className="panel-num" style={{marginBottom:10}}>· Projected</div>
              <div style={{position:"relative", borderRadius:12, overflow:"hidden", border:"1px solid rgba(184,245,176,0.3)", boxShadow:"0 0 50px -10px rgba(184,245,176,0.3)"}}>
                <img src={c.img} style={{width:"100%", display:"block"}}/>
                <div className="card-holo" style={{position:"absolute", inset:0, background:"transparent"}}></div>
                <div className="coll-grade holo" style={{position:"absolute", top:10, right:10}}>
                  <span>PSA {projGrade}</span>
                </div>
              </div>
              <div className="row-between" style={{marginTop:14, padding:"12px 14px", border:"1px solid rgba(184,245,176,0.25)", borderRadius:8, background:"rgba(184,245,176,0.04)"}}>
                <span className="muted">Projected grade</span>
                <span className="mono" style={{color:"var(--mint)", fontWeight:600}}>PSA {projGrade}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col gap-24">
          <div className="panel">
            <div className="panel-hd">
              <div className="panel-title">Re-grade probability</div>
              <div className="panel-meta">Model v3.1</div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginTop:8}}>
              {[
                { g: "10",    p: prob.p10,  c: "violet" },
                { g: "9.5",   p: prob.p95,  c: "mint" },
                { g: "9",     p: prob.p9,   c: "amber" },
                { g: `≤ ${c.grade > 0 ? c.grade : "8.5"}`, p: prob.plow, c: "rose" }
              ].map((x, i) => (
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{height:90, position:"relative", display:"flex", alignItems:"flex-end", justifyContent:"center"}}>
                    <div style={{width:36, background: `var(--${x.c})`, height: x.p + "%", borderRadius:"4px 4px 0 0", boxShadow: x.p > 30 ? `0 0 20px var(--${x.c})` : "none", transformOrigin:"bottom", animation:"barFill 1s cubic-bezier(.2,.8,.2,1) both"}}></div>
                  </div>
                  <div className="mono" style={{fontSize:11, color:"var(--text-3)", marginTop:8, letterSpacing:"0.06em"}}>PSA {x.g}</div>
                  <div className="mono" style={{fontSize:14, color:"var(--text)", fontWeight:600, marginTop:2}}>{x.p}%</div>
                </div>
              ))}
            </div>
            <div className="muted" style={{fontSize:12, marginTop:18, paddingTop:14, borderTop:"1px solid var(--line)"}}>
              {simResult
                ? `Berechnet für PSA ${c.grade || "?"} · Zentrierung ${c.centering || 50}% — Modell v3.1`
                : "Run simulation, um Wahrscheinlichkeiten zu berechnen."}
            </div>
          </div>

          <div className="panel">
            <div className="panel-hd">
              <div className="panel-title">Risk model · this slab</div>
              <div className="panel-meta">EV breakdown</div>
            </div>
            <div className="col" style={{gap:10}}>
              {[
                ["Cost · crack",             "−€8",  "var(--text-3)"],
                ["Cost · resubmission",      "−€95", "var(--text-3)"],
                ["Cost · insured ship",      "−€22", "var(--text-3)"],
                ["Downside floor (PSA 8)",   blendedPayout > 0 ? "€480" : "—", "var(--rose)"],
                ["Expected blended payout",
                  blendedPayout > 0 ? "€" + blendedPayout.toLocaleString() : "Simulation ausführen →",
                  blendedPayout > 0 ? "var(--text)" : "var(--text-3)"],
                ["Net EV vs. holding",
                  blendedPayout > 0 ? (netEv > 0 ? "+" : "") + "€" + netEv.toLocaleString() : "—",
                  netEv > 0 ? "var(--mint)" : "var(--rose)"]
              ].map(([k, v, col], i) => (
                <div key={i} className="row-between" style={{padding:"8px 0", borderBottom: i < 5 ? "1px solid var(--line)" : "none"}}>
                  <span className="muted" style={{fontSize:13}}>{k}</span>
                  <span className="mono tnum" style={{fontSize:13, color:col, fontWeight: i === 5 ? 600 : 400}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{borderColor:"rgba(255,143,143,0.2)", background:"rgba(255,143,143,0.03)"}}>
            <div className="row" style={{gap:14}}>
              <div style={{flexShrink:0, color:"var(--rose)"}}><Ic k="flame"/></div>
              <div>
                <div style={{fontWeight:600, fontSize:13.5}}>Caveat · do not use this lightly</div>
                <div className="muted" style={{fontSize:12, marginTop:4}}>
                  Resubs are non-reversible. The slab is broken before re-grading. Confirm twice. We'll require a typed passphrase before booking.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── POPULATION ────────────────────────────
function ScreenPopulation({ appState }) {
  const history = appState?.history || [];

  const byName = {};
  history.forEach(h => {
    const key = h.card_name || "Unbenannte Karte";
    if (!byName[key]) byName[key] = { card: key, total: 0, p10: 0, p9: 0, p8: 0 };
    byName[key].total++;
    const g = h.psa_grade || 0;
    if (g >= 10)     byName[key].p10++;
    else if (g >= 9) byName[key].p9++;
    else if (g >= 8) byName[key].p8++;
  });
  const rows = Object.values(byName).sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHead
        eyebrow="07 · Vault · Population"
        title='Your <em>population.</em>'
        sub="Grade distribution across your scanned cards, grouped by name. Scanne mehr Karten um hier mehr Daten zu sehen."
      />
      <div className="panel" style={{padding:0}}>
        {rows.length === 0 ? (
          <div className="muted" style={{padding:48, textAlign:"center", fontSize:13}}>
            Noch keine Karten analysiert — zuerst scannen, um hier Daten zu sehen.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Card</th>
                <th style={{textAlign:"right"}}>Total scanned</th>
                <th style={{textAlign:"right"}}>PSA 10</th>
                <th style={{textAlign:"right"}}>PSA 9</th>
                <th style={{textAlign:"right"}}>PSA 8</th>
                <th>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td className="name">{p.card}</td>
                  <td className="num" style={{textAlign:"right"}}>{p.total.toLocaleString()}</td>
                  <td className="num" style={{textAlign:"right", color:"var(--mint)"}}>{p.p10.toLocaleString()}</td>
                  <td className="num" style={{textAlign:"right", color:"var(--violet)"}}>{p.p9.toLocaleString()}</td>
                  <td className="num" style={{textAlign:"right", color:"var(--amber)"}}>{p.p8.toLocaleString()}</td>
                  <td style={{minWidth:200}}>
                    <div style={{height:8, display:"flex", borderRadius:4, overflow:"hidden", background:"var(--surf-3)"}}>
                      <div style={{width:(p.p10/p.total)*100+"%", background:"var(--mint)"}}></div>
                      <div style={{width:(p.p9/p.total)*100+"%", background:"var(--violet)"}}></div>
                      <div style={{width:(p.p8/p.total)*100+"%", background:"var(--amber)"}}></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

window.ScreenSubmission = ScreenSubmission;
window.ScreenWatchlist = ScreenWatchlist;
window.ScreenResub = ScreenResub;
window.ScreenPopulation = ScreenPopulation;
