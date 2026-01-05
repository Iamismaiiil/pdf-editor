import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API = "http://localhost:8000";

const TOOL = {
  COVER_TEXT: "cover_text",
  TEXTBOX: "textbox",
  LINE: "line",
  RECTANGLE: "rectangle",
  CIRCLE: "circle",
  SIGNATURE: "signature",
};

const TOOLS = [
  { id: "textbox", label: "Text", icon: "📝", desc: "Textfeld hinzufügen" },
  { id: "cover_text", label: "Abdeckung", icon: "✨", desc: "Text überlagern" },
  { id: "line", label: "Linie", icon: "📏", desc: "Linie zeichnen" },
  { id: "rectangle", label: "Rechteck", icon: "◻️", desc: "Rechteck zeichnen" },
  { id: "circle", label: "Kreis", icon: "⭕", desc: "Kreis zeichnen" },
  { id: "signature", label: "Unterschrift", icon: "✍️", desc: "Unterschrift hinzufügen" },
];

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  { label: "Roboto", value: "Roboto, Inter, system-ui, -apple-system, Segoe UI, Arial" },
  { label: "Poppins", value: "Poppins, Inter, system-ui, -apple-system, Segoe UI, Arial" },
  { label: "Montserrat", value: "Montserrat, Inter, system-ui, -apple-system, Segoe UI, Arial" },
  { label: "Open Sans", value: "Open Sans, Arial, sans-serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Times", value: "Times New Roman, Times, serif" },
  { label: "Courier", value: "Courier New, Courier, monospace" },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function uuid() {
  return (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()).toString();
}

function focusEditableById(id) {
  // next tick
  setTimeout(() => {
    const el = document.querySelector(`[data-editable-id="${CSS.escape(id)}"]`);
    if (el) {
      el.focus();
      // Cursor ans Ende setzen
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, 0);
}

export default function App() {
  const [fileId, setFileId] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);

  const [tool, setTool] = useState(TOOL.TEXTBOX);
  const [zoom, setZoom] = useState(2.0);

  const [edits, setEdits] = useState({ version: 1, pages: {} });

  const [selectedId, setSelectedId] = useState(null);

  // action: { mode:"drag"|"resize", id, startX,startY, orig, handle?, moved:boolean }
  const [action, setAction] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");

  const imgRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const draggedItemRef = useRef(null); // Tracke welches Item gerade gedragged wird
  const canvasRef = useRef(null);
  const drawingRef = useRef(null); // { startX, startY, type }
  const canvasCtxRef = useRef(null);


  const canPrev = useMemo(() => pageIndex > 0, [pageIndex]);
  const canNext = useMemo(() => pageIndex < pageCount - 1, [pageIndex, pageCount]);

  const pageKey = String(pageIndex);
  const pageEdits = edits.pages?.[pageKey] ?? [];

  const selectedItem = useMemo(
    () => pageEdits.find((it) => it.id === selectedId) ?? null,
    [pageEdits, selectedId]
  );

  async function loadEdits(fid) {
    const res = await fetch(`${API}/files/${encodeURIComponent(fid)}/edits`);
    const data = await res.json();
    setEdits(data);
    setSelectedId(null);
  }

  async function saveEdits(nextEdits) {
    setEdits(nextEdits);
    if (!fileId) return;

    await fetch(`${API}/files/${encodeURIComponent(fileId)}/edits`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextEdits),
    });
  }

  async function uploadFile(file) {
    setIsUploading(true);
    setStatus("Lade PDF…");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${API}/files`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setFileId(data.file_id);
      setPageCount(data.page_count);
      setPageIndex(0);
      setZoom(2.0);

      await loadEdits(data.file_id);
      setStatus("PDF geladen ✅");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("Upload fehlgeschlagen ❌");
      alert("Upload fehlgeschlagen: " + (e?.message ?? String(e)));
    } finally {
      setIsUploading(false);
    }
  }

  function updateItem(id, patch) {
    const updated = pageEdits.map((it) => (it.id === id ? { ...it, ...patch } : it));
    const next = { ...edits, pages: { ...edits.pages, [pageKey]: updated } };
    saveEdits(next);
  }

  function deleteItem(id) {
    const updated = pageEdits.filter((it) => it.id !== id);
    const next = { ...edits, pages: { ...edits.pages, [pageKey]: updated } };
    saveEdits(next);
    if (selectedId === id) setSelectedId(null);
  }

  function addItem(item, focus = false) {
    const next = {
      ...edits,
      pages: {
        ...edits.pages,
        [pageKey]: [...pageEdits, item],
      },
    };
    saveEdits(next);
    setSelectedId(item.id);
    if (focus) focusEditableById(item.id);
  }

  function getRelPosFromClient(clientX, clientY) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onCanvasClick(e) {
    if (!fileId) return;

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (action) return;

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    // Default: "Word-style" Textfeld: KEIN Rand, KEINE Schattierung
    const base = {
      id: uuid(),
      x: p.x,
      y: p.y,
      w: 320,
      h: 60,
      text: "",
      fontSize: 16,
      fontFamily: FONT_OPTIONS[0].value,
      color: "#111111",
      bold: false,
      italic: false,
      align: "left",

      // Appearance options (neu)
      background: "transparent", // oder "#ffffff"
      backgroundOpacity: 1.0,
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 8,
      padding: 8,
    };

    if (tool === TOOL.COVER_TEXT) {
      // “Text ersetzen”: abdecken (weiß), aber kein Rand
      addItem(
        {
          ...base,
          type: "cover_text",
          background: "#ffffff",
          backgroundOpacity: 0.95,
        },
        true
      );
    } else {
      // Textbox: komplett clean
      addItem({ ...base, type: "textbox" }, true);
    }
  }

  function onItemPointerDown(e, it) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    setSelectedId(it.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    setAction({
      mode: "drag",
      id: it.id,
      startX: p.x,
      startY: p.y,
      orig: { x: it.x, y: it.y },
      moved: false,
    });
  }

  function onHandlePointerDown(e, it, handle) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    setSelectedId(it.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    setAction({
      mode: "resize",
      id: it.id,
      handle,
      startX: p.x,
      startY: p.y,
      orig: { x: it.x, y: it.y, w: it.w, h: it.h },
      moved: false,
    });
  }

  function onViewerPointerMove(e) {
    if (!action) return;

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    const dx = p.x - action.startX;
    const dy = p.y - action.startY;

    const movedNow = action.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (!action.moved && movedNow) {
      setAction((a) => (a ? { ...a, moved: true } : a));
      suppressNextClickRef.current = true;
    }

    if (action.mode === "drag") {
      updateItem(action.id, { x: action.orig.x + dx, y: action.orig.y + dy });
      return;
    }

    if (action.mode === "resize") {
      const { handle, orig } = action;
      let x = orig.x;
      let y = orig.y;
      let w = orig.w;
      let h = orig.h;

      if (handle.includes("e")) w = orig.w + dx;
      if (handle.includes("s")) h = orig.h + dy;
      if (handle.includes("w")) {
        w = orig.w - dx;
        x = orig.x + dx;
      }
      if (handle.includes("n")) {
        h = orig.h - dy;
        y = orig.y + dy;
      }

      w = clamp(w, 90, 2000);
      h = clamp(h, 34, 2000);

      updateItem(action.id, { x, y, w, h });
    }
  }

  function stopAction() {
    if (!action) return;
    // Wenn während der Aktion bewegt/resize wurde, soll der folgende Click nicht ein neues Feld erzeugen
    if (action.moved) {
      suppressNextClickRef.current = true;
      draggedItemRef.current = action.id; // Speichere welches Item gedragged wurde
    }
    setAction(null);
  }

  function onTextInput(it, e) {
    const text = e.currentTarget.innerText;
    updateItem(it.id, { text });
  }

  function setProp(patch) {
    if (!selectedItem) return;
    updateItem(selectedItem.id, patch);
  }

  function textStyleOf(it) {
    return {
      fontSize: it.fontSize ?? 16,
      fontFamily: it.fontFamily ?? FONT_OPTIONS[0].value,
      color: it.color ?? "#111111",
      fontWeight: it.bold ? 700 : 400,
      fontStyle: it.italic ? "italic" : "normal",
      textAlign: it.align ?? "left",
    };
  }

  function boxStyleOf(it) {
    const bg = it.background ?? "transparent";
    const bgOpacity = it.backgroundOpacity ?? 1.0;

    return {
      padding: (it.padding ?? 8) + "px",
      borderRadius: (it.borderRadius ?? 8) + "px",
      borderColor: it.borderColor ?? "transparent",
      borderWidth: (it.borderWidth ?? 0) + "px",
      background: bg,
      opacity: 1,
      // Background-Opacity ohne Text-Opacity:
      // Trick: background via pseudo? -> wir machen via inset layer in CSS (siehe .bgLayer)
      // hier nur für fallback:
      backgroundColor: bg,
      // actual opacity applied with bgLayer below
    };
  }

  function safeNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <div className="brandTitle">PDF Studio</div>
            <div className="brandSub">Modern • Clean • Professional</div>
          </div>
        </div>

        <div className="toolbar">
          <label className="filePick">
            <input
              type="file"
              accept="application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await uploadFile(f);
              }}
            />
            <span>{isUploading ? "⏳ Lade…" : "📄 PDF öffnen"}</span>
          </label>

          {fileId && (
            <>
              <div className="sep" />
              <div className="segmented">
                {TOOLS.map(t => (
                  <button 
                    key={t.id}
                    className={`seg ${tool === t.id ? "active" : ""}`} 
                    onClick={() => setTool(t.id)}
                    title={t.desc}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              <div className="sep" />

              <button className="btn ghost" onClick={() => setZoom((z) => clamp(Number((z - 0.25).toFixed(2)), 0.75, 4.0))} disabled={!fileId}>
                −
              </button>
              <div className="chip">{zoom.toFixed(2)}×</div>
              <button className="btn ghost" onClick={() => setZoom((z) => clamp(Number((z + 0.25).toFixed(2)), 0.75, 4.0))} disabled={!fileId}>
                +
              </button>

              <div className="sep" />

              <div className="pager">
                <button className="btn ghost" disabled={!canPrev} onClick={() => setPageIndex((p) => clamp(p - 1, 0, pageCount - 1))}>
                  ◀
                </button>
                <div className="chip">{pageCount ? `${pageIndex + 1} / ${pageCount}` : "—"}</div>
                <button className="btn ghost" disabled={!canNext} onClick={() => setPageIndex((p) => clamp(p + 1, 0, pageCount - 1))}>
                  ▶
                </button>
              </div>
            </>
          )}
        </div>

        <div className="meta">
          {fileId && (
            <button className="btn primary" onClick={async () => {
              setStatus("📥 PDF wird exportiert…");
              try {
                const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/export`);
                if (!res.ok) throw new Error("Export fehlgeschlagen");
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `edited-${fileId}.pdf`;
                a.click();
                window.URL.revokeObjectURL(url);
                setStatus("✅ PDF heruntergeladen!");
                setTimeout(() => setStatus(""), 2000);
              } catch (e) {
                setStatus("❌ Export fehlgeschlagen");
              }
            }}>
              💾 PDF herunterladen
            </button>
          )}
          {status ? <span className="status">{status}</span> : null}
          <span className={`metaText ${fileId ? "" : "muted"}`}>
            {fileId ? `${fileId.slice(0, 24)}${fileId.length > 24 ? "…" : ""}` : "Keine PDF geladen"}
          </span>
        </div>
      </header>

      <main className="layout">
        <aside className="side left">
          <div className="panel">
            <div className="panelTitle">✨ Guide</div>
            <div className="tip">
              <b>Erstellen:</b> Klick in die PDF-Seite<br />
              <b>Bearbeiten:</b> Text direkt tippen<br />
              <b>Verschieben:</b> Drag & Drop (smooth wie Word)<br />
              <b>Styling:</b> Rechts im Eigenschaften-Panel
            </div>
          </div>

          <div className="panel">
            <div className="panelTitle">📋 Elemente auf Seite</div>
            {pageEdits.length === 0 ? (
              <div className="muted">Noch keine Elemente. Klick in die Seite zum Erstellen.</div>
            ) : (
              <div className="list">
                {pageEdits.map((it) => (
                  <button
                    key={it.id}
                    className={`listItem ${it.id === selectedId ? "active" : ""}`}
                    onClick={() => {
                      setSelectedId(it.id);
                      focusEditableById(it.id);
                    }}
                  >
                    <span className="tag">{it.type === "cover_text" ? "Abdeckung" : "Text"}</span>
                    <span className="liText">{(it.text ?? "").slice(0, 28) || "(leer)"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="viewer">
          {!fileId ? (
            <div className="drop">
              <div className="dropTitle">📄 PDF auswählen</div>
              <div className="muted">Einfach eine PDF-Datei hochladen oder per Drag & Drop hinziehen</div>
            </div>
          ) : (
            <div
              className="pageWrap"
              onPointerMove={onViewerPointerMove}
              onPointerUp={stopAction}
              onPointerCancel={stopAction}
              onPointerLeave={stopAction}
            >
              <div className="page" onClick={onCanvasClick}>
                <img
                  ref={imgRef}
                  className="pageImg"
                  alt="Rendered page"
                  draggable={false}
                  src={`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}/render?scale=${zoom}`}
                />

                <div className="overlay">
                  {pageEdits.map((it) => {
                    const isSelected = it.id === selectedId;
                    const bgOpacity = safeNumber(it.backgroundOpacity, 1.0);

                    return (
                      <div
                        key={it.id}
                        className={`item wordy ${isSelected ? "selected" : ""}`}
                        style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
                        onPointerDown={(e) => {
                          if (e.button !== undefined && e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();

                          const p = getRelPosFromClient(e.clientX, e.clientY);
                          if (!p) return;

                          setSelectedId(it.id);
                          e.currentTarget.setPointerCapture?.(e.pointerId);

                          setAction({
                            mode: "drag",
                            id: it.id,
                            startX: p.x,
                            startY: p.y,
                            orig: { x: it.x, y: it.y },
                            moved: false,
                          });
                        }}
                        onPointerMove={(e) => onViewerPointerMove(e)}
                        onPointerUp={stopAction}
                        onPointerCancel={stopAction}
                        onClick={(e) => {
                          // Nach Drag/Resize auf diesem Item: Click nicht zählen
                          if (draggedItemRef.current === it.id) {
                            draggedItemRef.current = null;
                            e.stopPropagation();
                            return;
                          }
                          e.stopPropagation();
                          setSelectedId(it.id);
                        }}
                      >
                        {/* Background layer (opacity ohne Text zu beeinflussen) */}
                        <div
                          className="bgLayer"
                          style={{
                            background: it.background ?? "transparent",
                            opacity: bgOpacity,
                            borderRadius: (it.borderRadius ?? 8) + "px",
                          }}
                        />

                        {/* CoverText: weißes Abdecken (wie iLovePDF) */}
                        {it.type === "cover_text" && (
                          <div className="coverLayer" style={{ borderRadius: (it.borderRadius ?? 8) + "px" }} />
                        )}

                        {/* Border nur wenn eingestellt; zusätzlich Auswahlrahmen via .selected */}
                        <div
                          className="borderLayer"
                          style={{
                            borderRadius: (it.borderRadius ?? 8) + "px",
                            borderStyle: (it.borderWidth ?? 0) > 0 ? "solid" : "solid",
                            borderWidth: (it.borderWidth ?? 0) + "px",
                            borderColor: it.borderColor ?? "transparent",
                          }}
                        />

                        <div
                          className="editable"
                          data-editable-id={it.id}
                          style={{
                            ...textStyleOf(it),
                            padding: (it.padding ?? 8) + "px",
                            height: "100%",
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(e) => onTextInput(it, e)}
                          onPointerDown={(e) => e.stopPropagation()} // Tippen -> kein Drag
                        >
                          {it.text}
                        </div>

                        <button
                          className="delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteItem(it.id);
                          }}
                          title="Löschen"
                        >
                          ✕
                        </button>

                        {isSelected && (
                          <>
                            <div className="handle nw" onPointerDown={(e) => onHandlePointerDown(e, it, "nw")} />
                            <div className="handle ne" onPointerDown={(e) => onHandlePointerDown(e, it, "ne")} />
                            <div className="handle sw" onPointerDown={(e) => onHandlePointerDown(e, it, "sw")} />
                            <div className="handle se" onPointerDown={(e) => onHandlePointerDown(e, it, "se")} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="side right">
          <div className="panel">
            <div className="panelTitle">⚙️ Eigenschaften</div>

            {!selectedItem ? (
              <div className="muted">Element auswählen zum Bearbeiten</div>
            ) : (
              <div className="props">
                <div className="row">
                  <span className="label">Schriftart</span>
                  <select
                    className="select"
                    value={selectedItem.fontFamily ?? FONT_OPTIONS[0].value}
                    onChange={(e) => setProp({ fontFamily: e.target.value })}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.label} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="row">
                  <span className="label">Größe</span>
                  <input
                    className="input"
                    type="number"
                    value={selectedItem.fontSize ?? 16}
                    min={10}
                    max={72}
                    onChange={(e) => setProp({ fontSize: Number(e.target.value) })}
                  />
                </div>

                <div className="row">
                  <span className="label">Farbe</span>
                  <input
                    className="color"
                    type="color"
                    value={selectedItem.color ?? "#111111"}
                    onChange={(e) => setProp({ color: e.target.value })}
                  />
                </div>

                <div className="row">
                  <span className="label">Style</span>
                  <div className="btnRow">
                    <button className={`mini ${selectedItem.bold ? "on" : ""}`} onClick={() => setProp({ bold: !selectedItem.bold })}>
                      B
                    </button>
                    <button className={`mini ${selectedItem.italic ? "on" : ""}`} onClick={() => setProp({ italic: !selectedItem.italic })}>
                      I
                    </button>
                  </div>
                </div>

                <div className="row">
                  <span className="label">Background</span>
                  <input
                    className="input"
                    type="text"
                    value={selectedItem.background ?? "transparent"}
                    onChange={(e) => setProp({ background: e.target.value })}
                    placeholder="transparent oder #ffffff"
                  />
                </div>

                <div className="row">
                  <span className="label">BG Opacity</span>
                  <input
                    className="input"
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={selectedItem.backgroundOpacity ?? 1.0}
                    onChange={(e) => setProp({ backgroundOpacity: Number(e.target.value) })}
                  />
                </div>

                <div className="row">
                  <span className="label">Rand</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="10"
                    value={selectedItem.borderWidth ?? 0}
                    onChange={(e) => setProp({ borderWidth: Number(e.target.value) })}
                  />
                </div>

                <div className="row">
                  <span className="label">Randfarbe</span>
                  <input
                    className="color"
                    type="color"
                    value={selectedItem.borderColor && selectedItem.borderColor !== "transparent" ? selectedItem.borderColor : "#000000"}
                    onChange={(e) => setProp({ borderColor: e.target.value, borderWidth: Math.max(1, selectedItem.borderWidth ?? 0) })}
                  />
                </div>

                <div className="row">
                  <span className="label">Padding</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="40"
                    value={selectedItem.padding ?? 8}
                    onChange={(e) => setProp({ padding: Number(e.target.value) })}
                  />
                </div>

                <button className="btn danger" onClick={() => deleteItem(selectedItem.id)}>
                  🗑️ Element löschen
                </button>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelTitle">💡 Tipps</div>
            <div className="tip">
              Textfelder sind standardmäßig <b>clean</b> ohne Rahmen & Hintergrund. Nutze die Eigenschaften oben um Styling zu bearbeiten. Wie in Word!
            </div>
          </div>
        </aside>
      </main>
    </div>
  );

  // resize helper (needs access to setAction/updateItem)
  function onHandlePointerDown(e, it, handle) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    setSelectedId(it.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    setAction({
      mode: "resize",
      id: it.id,
      handle,
      startX: p.x,
      startY: p.y,
      orig: { x: it.x, y: it.y, w: it.w, h: it.h },
      moved: false,
    });
  }
}
