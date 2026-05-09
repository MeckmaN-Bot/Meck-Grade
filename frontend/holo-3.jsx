// MeckGrade Holo — Screens C: Submission, Watchlist, Crack & Resub, Population, Stub

// ──────────────────────────── SUBMISSION ────────────────────────────
const PROVIDERS = {
  PSA: { name:"PSA", tiers:["Economy","Express","WalkThrough","Super Express"],
         addr:"PSA, 1610 E Saint Andrew Pl, Santa Ana, CA 92705, USA",
         url:"https://www.psacard.com/orders/" },
  BGS: { name:"BGS", tiers:["Economy","Standard","Express","Premium"],
         addr:"Beckett Grading Services, 2700 Summit Ave, Plano TX 75074, USA",
         url:"https://www.beckett.com/grading" },
  CGC: { name:"CGC", tiers:["Economy","Standard","Express"],
         addr:"CGC, 3350 SW 148th Ave Suite 110, Miramar FL 33027, USA",
         url:"https://www.cgccards.com/submit/" },
  TAG: { name:"TAG", tiers:["Standard","Express"],
         addr:"TAG Grading — see tag-grading.com for current address",
         url:"https://www.tag-grading.com" },
};

function ScreenSubmission({ go, appState }) {
  const [provider, setProvider] = uS("PSA");
  const [tier, setTier]         = uS("Express");
  const [lockModal, setLockModal]   = uS(false);
  const [checklist, setChecklist]   = uS({sleeves:false, labels:false, account:false});
  const [subPickModal, setSubPickModal] = uS(false);

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

  const prov = PROVIDERS[provider] || PROVIDERS.PSA;
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
      <h1>Packing Slip · ${prov.name} · ${subId}</h1>
      <div class="meta">${new Date().toLocaleString("de-DE")} · ${tier} · ${cards.length} Karte${cards.length===1?"":"n"}</div>
      <div class="grid">${labelHtml}</div>
      <div class="slip-summary" style="margin-top:8mm;padding:4mm;border:1px solid #ccc;border-radius:2mm;font-size:9pt;">
        <strong>SEND TO:</strong><br/>${prov.addr}<br/>
        <span style="color:#666">Tier: ${tier} · Cards: ${cards.length} · Date: ${new Date().toISOString().slice(0,10)}</span>
      </div>
      <div class="foot">${subId} · MeckGrade Pre-Grading · Send to: ${prov.name}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); } catch {} }, 200);
  };

  const startLock = async () => {
    if (cards.length === 0) {
      return window.HoloAPI.toast("Leere Submission", "Erst Karten hinzufügen.", "warn");
    }
    try {
      await Promise.all(cards.map(c => {
        const row = history.find(h => h.id === c.id);
        const existing = (row?.tags || "").split(",").map(s => s.trim()).filter(Boolean);
        const next = Array.from(new Set([...existing, "submitted", subId])).join(",");
        return window.HoloAPI.patchHistoryTags(c.id, next);
      }));
      cards.forEach(c => window.HoloAPI.removeFromSubmission(c.id));
      await window.HoloAPI.refreshHistory();
      setChecklist({sleeves:false, labels:false, account:false});
      setLockModal(true);
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
            <Ic k="upload" s={14}/> Packing Slip
          </button>
          <button className="btn btn-glow" onClick={startLock} disabled={cards.length === 0}>
            <Ic k="check" s={13}/> Lock & Ship
          </button>
        </>}
      />

      <div className="row" style={{gap:14, marginBottom:24, padding:"14px 18px", border:"1px solid var(--line)", borderRadius:12, background:"var(--surf)", flexWrap:"wrap"}}>
        <span className="mono" style={{fontSize:11, color:"var(--text-3)", letterSpacing:"0.16em"}}>SUBMISSION ID</span>
        <span className="mono" style={{fontSize:13, color:"var(--text)"}}>{subId}</span>
        <span style={{color:"var(--text-5)"}}>·</span>
        <span className="chip mint"><span className="dot"></span>READY · {cards.length} CARDS</span>
        <span style={{color:"var(--text-5)"}}>·</span>
        <select className="input" style={{fontSize:12, padding:"4px 8px", width:"auto", height:"auto"}} value={provider}
                onChange={e => { setProvider(e.target.value); setTier(PROVIDERS[e.target.value]?.tiers[1] || "Express"); }}>
          {Object.keys(PROVIDERS).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className="input" style={{fontSize:12, padding:"4px 8px", width:"auto", height:"auto"}} value={tier}
                onChange={e => setTier(e.target.value)}>
          {prov.tiers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{flex:1}}></div>
        <button className="btn btn-ghost" onClick={() => setSubPickModal(true)}><Ic k="plus" s={13}/> Add from vault</button>
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

          <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:6, padding:14, borderStyle:"dashed"}} onClick={() => setSubPickModal(true)}>
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
                  onClick={startLock} disabled={cards.length === 0}>
            <Ic k="check" s={13}/> Lock &amp; Ship to {prov.name}
          </button>
          <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:8}}
                  onClick={printLabels} disabled={cards.length === 0}>
            <Ic k="upload" s={13}/> Packing Slip (PDF)
          </button>
          <div className="muted mono" style={{fontSize:10.5, textAlign:"center", marginTop:12, letterSpacing:"0.12em", textTransform:"uppercase"}}>
            {prov.name} · {tier}
          </div>
        </div>
      </div>

      {/* Lock & Ship checklist modal */}
      {lockModal && (
        <div className="holo-modal-back" onClick={() => { setLockModal(false); go("collection"); }}>
          <div className="holo-modal" style={{maxWidth:500}} onClick={e => e.stopPropagation()}>
            <div className="panel-hd">
              <div>
                <div className="panel-num">· Submission locked · {subId}</div>
                <div className="panel-title" style={{marginTop:4}}>Before you ship</div>
              </div>
            </div>
            <div className="col" style={{gap:12, marginTop:8}}>
              {[
                {k:"sleeves", label:"Karten in Schutzhüllen + Toploader verpacken"},
                {k:"labels",  label:"Packing Slip ausgedruckt und beigelegt"},
                {k:"account", label:prov.name + "-Konto erstellt und Bestellung angelegt"},
              ].map(item => (
                <label key={item.k} className="row" style={{gap:12, cursor:"pointer", padding:"8px 0", borderBottom:"1px solid var(--line)"}}>
                  <input type="checkbox" checked={checklist[item.k]}
                         onChange={e => setChecklist({...checklist, [item.k]: e.target.checked})}/>
                  <span style={{fontSize:13}}>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="row" style={{gap:10, marginTop:18}}>
              <button className="btn btn-ghost" style={{flex:1, justifyContent:"center"}}
                      onClick={printLabels}>
                <Ic k="upload" s={13}/> Packing Slip drucken
              </button>
              <button className="btn btn-glow" style={{flex:1, justifyContent:"center"}}
                      onClick={() => window.open(prov.url, "_blank")}>
                <Ic k="arrow" s={13}/> Zur {prov.name} Website →
              </button>
            </div>
            <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:8}}
                    onClick={() => { setLockModal(false); go("collection"); }}>
              Fertig · Zurück zur Sammlung
            </button>
            <div className="muted" style={{fontSize:11, textAlign:"center", marginTop:10, letterSpacing:"0.1em"}}>
              {subId} · {prov.name} {tier}
            </div>
          </div>
        </div>
      )}

      {/* Sub card-picker modal */}
      {subPickModal && (
        <div className="holo-modal-back" onClick={() => setSubPickModal(false)}>
          <div className="holo-modal" style={{maxWidth:480}} onClick={e => e.stopPropagation()}>
            <div className="panel-hd">
              <div>
                <div className="panel-num">· Submission · Karte hinzufügen</div>
                <div className="panel-title" style={{marginTop:4}}>Karte aus Vault wählen</div>
              </div>
              <button className="topbar-btn" onClick={() => setSubPickModal(false)}>×</button>
            </div>
            <div className="muted" style={{fontSize:13, marginBottom:14}}>
              Wähle eine Karte aus deiner Sammlung für diese Submission.
            </div>
            {(appState?.history || []).length === 0 ? (
              <div className="muted" style={{padding:"18px 0", textAlign:"center", fontSize:13}}>
                Noch keine Karten in der Sammlung.
              </div>
            ) : (
              <div className="col" style={{gap:0, maxHeight:360, overflowY:"auto"}}>
                {(appState?.history || []).map(h => {
                  const alreadyIn = submissionIds.includes(h.id);
                  return (
                    <div key={h.id} className="row" style={{padding:"10px 0", borderBottom:"1px solid var(--line)", cursor: alreadyIn ? "default" : "pointer", opacity: alreadyIn ? 0.4 : 1}}
                         onClick={() => {
                           if (alreadyIn) return;
                           window.HoloAPI.addToSubmission(h.id);
                           window.HoloAPI.toast("Submission", `${h.card_name || "Karte"} hinzugefügt.`);
                           setSubPickModal(false);
                         }}>
                      <div style={{width:36, aspectRatio:"63/88", borderRadius:4, overflow:"hidden", background:"var(--surf-3)", flexShrink:0}}>
                        {h.thumbnail_b64 && <img src={`data:image/jpeg;base64,${h.thumbnail_b64}`} style={{width:"100%", height:"100%", objectFit:"cover"}}/>}
                      </div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:600, fontSize:13.5}}>{h.card_name || "Unbenannte"}</div>
                        <div className="muted" style={{fontSize:11.5}}>{h.card_set || "—"}{h.psa_grade ? " · PSA " + h.psa_grade : ""}</div>
                      </div>
                      {alreadyIn && <span className="chip mint" style={{fontSize:10}}>bereits drin</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:12}}
                    onClick={() => setSubPickModal(false)}>Schließen</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── WATCHLIST ────────────────────────────
const WATCHLIST_TEMPLATES = [
  {
    type:"roi", title:"ROI-Alarm", ic:"chart", badge:"ROI",
    desc:"Setze eine Preisschwelle. Wenn der berechnete ROI diese überschreitet, ist die Karte einschickbereit.",
    fields:[
      {k:"card",  label:"Welche Karte?",     ph:"z.B. Charizard Base Set"},
      {k:"floor", label:"Minimaler ROI (€)", ph:"z.B. 200", type:"number"},
    ],
  },
  {
    type:"pop", title:"Pop-Explosion", ic:"pop", badge:"POP",
    desc:"Beobachte wenn der PSA-Pop einer Note stark wächst — ideal vor/nach Set-Jubiläen.",
    fields:[
      {k:"card",      label:"Welche Karte?",      ph:"z.B. Pikachu Illustrator"},
      {k:"threshold", label:"Pop-Faktor (×fach)", ph:"z.B. 2", type:"number"},
    ],
  },
  {
    type:"ann", title:"Set-Jubiläum", ic:"flag", badge:"ANN",
    desc:"Arm 2 Wochen vor einem runden Set-Geburtstag — Preise steigen typisch in den Wochen davor.",
    fields:[
      {k:"set",  label:"Welches Set?",         ph:"z.B. Base Set"},
      {k:"year", label:"Geburtsjahr des Sets",  ph:"z.B. 1999", type:"number"},
    ],
  },
];

function ScreenWatchlist({ go, appState }) {
  const [tplModal, setTplModal] = uS(null);
  const [tplValues, setTplValues] = uS({});
  const [pickModal, setPickModal] = uS(false);
  const w = appState?.watchlist || [];
  return (
    <div>
      <PageHead
        eyebrow="05 · Submission · Watchlist"
        title='<em>Triggers</em> on the prowl.'
        sub="Beobachte Karten mit Markt-Triggern — ROI-Alarm, Pop-Explosion, Set-Jubiläum. Trigger werden lokal gespeichert; Live-Alerts kommen in einem späteren Build."
        actions={<button className="btn btn-glow" onClick={() => setPickModal(true)}><Ic k="plus" s={13}/> Karte watchen</button>}
      />

      <div className="panel" style={{padding:0}}>
        {w.length === 0 ? (
          <div className="muted" style={{padding:48, textAlign:"center", fontSize:13}}>
            Noch kein Trigger aktiv. Template auswählen oder "Watch" in der Karten-Ansicht klicken.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Card / Trigger</th>
                <th>Typ</th>
                <th>State</th>
                <th style={{textAlign:"right"}}>Added</th>
                <th style={{width:36}}></th>
              </tr>
            </thead>
            <tbody>
              {w.map((row, i) => (
                <tr key={i}>
                  <td className="name">{row.card || "—"}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--text-3)"}}>
                    {row.trigger === "roi" ? "ROI-Alarm"
                      : row.trigger === "pop" ? "Pop-Explosion"
                      : row.trigger === "ann" ? "Set-Jubiläum"
                      : row.trigger ? row.trigger
                      : "Vault"}
                  </td>
                  <td>
                    <span className={"chip " + (row.trigger==="roi"?"mint":row.trigger==="pop"?"violet":row.trigger==="ann"?"amber":"violet")}>
                      <span className="dot"></span>
                      {row.trigger ? row.trigger.toUpperCase() : "armed"}
                      {row.config?.floor      ? " ≥€" + row.config.floor      : ""}
                      {row.config?.threshold  ? " ×"  + row.config.threshold  : ""}
                    </span>
                  </td>
                  <td className="num" style={{textAlign:"right", color:"var(--text-3)"}}>{row.ts ? new Date(row.ts).toLocaleString("de-DE") : "—"}</td>
                  <td>
                    <button className="topbar-btn" style={{width:26, height:26, color:"var(--rose)"}}
                            title="Unwatch"
                            onClick={() => window.HoloAPI.removeFromWatchlist(row.sessionId)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trigger archetypes */}
      <div className="section">
        <div className="section-hd">
          <div className="section-title">Trigger-Vorlagen</div>
          <div className="panel-meta">Konfigurieren und aktivieren</div>
        </div>
        <div className="grid-3">
          {WATCHLIST_TEMPLATES.map((tpl, i) => (
            <div key={i} className="panel" style={{padding:22}}>
              <div className="row-between">
                <span className="panel-num">· {String(i+1).padStart(2,"0")}</span>
                <span className={"chip " + (i===0?"mint":i===1?"violet":"amber")} style={{fontSize:10}}>
                  <span className="dot"></span>{tpl.badge}
                </span>
              </div>
              <div style={{fontFamily:"var(--display)", fontWeight:600, fontSize:20, letterSpacing:"-0.02em", marginTop:14}}>{tpl.title}</div>
              <div className="muted" style={{fontSize:13, marginTop:6, lineHeight:1.5}}>{tpl.desc}</div>
              <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:18}}
                onClick={() => { setTplModal(tpl); setTplValues({}); }}>
                <Ic k="plus" s={12}/> {tpl.title} einrichten
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Template config modal */}
      {tplModal && (
        <div className="holo-modal-back" onClick={() => setTplModal(null)}>
          <div className="holo-modal" style={{maxWidth:420}} onClick={e => e.stopPropagation()}>
            <div className="panel-hd">
              <div>
                <div className="panel-num">· Trigger · {tplModal.title}</div>
                <div className="panel-title" style={{marginTop:4}}>Trigger konfigurieren</div>
              </div>
              <button className="topbar-btn" onClick={() => setTplModal(null)}>×</button>
            </div>
            <div className="muted" style={{fontSize:13, marginBottom:14}}>{tplModal.desc}</div>
            {tplModal.fields.map(f => (
              <div key={f.k} style={{marginBottom:12}}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type || "text"} placeholder={f.ph} value={tplValues[f.k] || ""}
                       onChange={e => setTplValues({...tplValues, [f.k]: e.target.value})}/>
              </div>
            ))}
            <button className="btn btn-glow" style={{width:"100%", justifyContent:"center", marginTop:14}}
                    onClick={() => {
                      const card = tplValues.card || tplValues.set || tplModal.title;
                      window.HoloAPI.addToWatchlist({
                        sessionId: "tpl-" + Date.now(),
                        card: card + " · " + tplModal.title,
                        trigger: tplModal.type,
                        config: tplValues,
                        ts: Date.now(),
                      });
                      window.HoloAPI.toast("Trigger gesetzt", tplModal.title + " für " + card + " aktiv.");
                      setTplModal(null);
                    }}>
              <Ic k="check" s={13}/> Trigger aktivieren
            </button>
          </div>
        </div>
      )}

      {/* Card-picker modal */}
      {pickModal && (
        <div className="holo-modal-back" onClick={() => setPickModal(false)}>
          <div className="holo-modal" style={{maxWidth:480}} onClick={e => e.stopPropagation()}>
            <div className="panel-hd">
              <div>
                <div className="panel-num">· Watchlist · Karte hinzufügen</div>
                <div className="panel-title" style={{marginTop:4}}>Karte aus Vault wählen</div>
              </div>
              <button className="topbar-btn" onClick={() => setPickModal(false)}>×</button>
            </div>
            <div className="muted" style={{fontSize:13, marginBottom:14}}>
              Wähle eine Karte aus deiner Sammlung. Sie wird zur Watchlist hinzugefügt.
            </div>
            {(appState?.history || []).length === 0 ? (
              <div className="muted" style={{padding:"18px 0", textAlign:"center", fontSize:13}}>
                Noch keine Karten in der Sammlung.
              </div>
            ) : (
              <div className="col" style={{gap:0, maxHeight:360, overflowY:"auto"}}>
                {(appState?.history || []).map(h => (
                  <div key={h.id} className="row" style={{padding:"10px 0", borderBottom:"1px solid var(--line)", cursor:"pointer"}}
                       onClick={() => {
                         window.HoloAPI.addToWatchlist({
                           sessionId: h.id,
                           card: h.card_name || "Unbenannte Karte",
                           ts: Date.now(),
                         });
                         window.HoloAPI.toast("Watchlist", `${h.card_name || "Karte"} wird beobachtet.`);
                         setPickModal(false);
                       }}>
                    <div style={{width:36, aspectRatio:"63/88", borderRadius:4, overflow:"hidden", background:"var(--surf-3)", flexShrink:0}}>
                      {h.thumbnail_b64 && <img src={`data:image/jpeg;base64,${h.thumbnail_b64}`} style={{width:"100%", height:"100%", objectFit:"cover"}}/>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:600, fontSize:13.5}}>{h.card_name || "Unbenannte"}</div>
                      <div className="muted" style={{fontSize:11.5}}>{h.card_set || "—"}{h.psa_grade ? " · PSA " + h.psa_grade : ""}</div>
                    </div>
                    <div className="mono" style={{fontSize:10, color:"var(--text-4)"}}>{h.id.slice(0,8)}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" style={{width:"100%", justifyContent:"center", marginTop:12}}
                    onClick={() => setPickModal(false)}>Schließen</button>
          </div>
        </div>
      )}
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
window.ScreenPopulation = ScreenPopulation;
