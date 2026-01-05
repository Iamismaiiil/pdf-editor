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
  FREEHAND: "freehand",
  HIGHLIGHT: "highlight",
  STAMP: "stamp",
  COMMENT: "comment",
  REDACT: "redact",
};

const TOOLS = [
  { id: "textbox", label: "Text", icon: "📝", desc: "Textfeld", category: "text" },
  { id: "cover_text", label: "Abdeckung", icon: "✨", desc: "Überlagern", category: "text" },
  { id: "line", label: "Linie", icon: "📏", desc: "Linie", category: "drawing" },
  { id: "rectangle", label: "Rechteck", icon: "◻️", desc: "Rechteck", category: "drawing" },
  { id: "circle", label: "Kreis", icon: "⭕", desc: "Kreis", category: "drawing" },
  { id: "freehand", label: "Freihand", icon: "✏️", desc: "Zeichnen", category: "drawing" },
  { id: "highlight", label: "Marker", icon: "🖍️", desc: "Hervorheben", category: "markup" },
  { id: "stamp", label: "Stempel", icon: "🔖", desc: "Stempel", category: "markup" },
  { id: "comment", label: "Notiz", icon: "📌", desc: "Kommentar", category: "markup" },
  { id: "redact", label: "Schwärzen", icon: "⬛", desc: "Schwärzen", category: "security" },
  { id: "signature", label: "Unterschrift", icon: "✍️", desc: "Signatur", category: "security" },
];

const STAMPS = [
  { id: "approved", label: "Genehmigt", icon: "✅", color: "#28a745" },
  { id: "rejected", label: "Abgelehnt", icon: "❌", color: "#dc3545" },
  { id: "draft", label: "Entwurf", icon: "📋", color: "#ffc107" },
  { id: "confidential", label: "Vertraulich", icon: "🔒", color: "#6f42c1" },
  { id: "urgent", label: "Dringend", icon: "⚠️", color: "#fd7e14" },
];

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  { label: "Roboto", value: "Roboto, Inter, system-ui, -apple-system, Segoe UI, Arial" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times", value: "Times New Roman, Times, serif" },
  { label: "Courier", value: "Courier New, Courier, monospace" },
];

const HIGHLIGHT_COLORS = ["#ffff00", "#00ff00", "#ff00ff", "#00ffff", "#ffcc00", "#ff6600"];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function uuid() {
  return (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()).toString();
}

function focusEditableById(id) {
  setTimeout(() => {
    const el = document.querySelector(`[data-editable-id="${CSS.escape(id)}"]`);
    if (el) {
      el.focus();
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
  const [action, setAction] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedStamp, setSelectedStamp] = useState("approved");
  const [highlightColor, setHighlightColor] = useState("#ffff00");

  // UI States
  const [showTextProps, setShowTextProps] = useState(false);
  const [showDrawingProps, setShowDrawingProps] = useState(false);

  const imgRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const draggedItemRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const freehandRef = useRef(null);

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

  // ===== DRAWING TOOLS =====
  function onCanvasPointerDown(e) {
    if (!fileId || tool === TOOL.TEXTBOX || tool === TOOL.COVER_TEXT || tool === TOOL.SIGNATURE || tool === TOOL.STAMP || tool === TOOL.COMMENT) return;
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    if (tool === TOOL.FREEHAND) {
      freehandRef.current = { points: [[p.x, p.y]], type: tool };
    } else if (tool === TOOL.HIGHLIGHT) {
      drawingRef.current = { startX: p.x, startY: p.y, type: tool };
    } else {
      drawingRef.current = { startX: p.x, startY: p.y, type: tool };
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onCanvasPointerMove(e) {
    if (!drawingRef.current && !freehandRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    // Freehand drawing
    if (freehandRef.current) {
      freehandRef.current.points.push([p.x, p.y]);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#0066ff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const points = freehandRef.current.points;
      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.stroke();
      }
      return;
    }

    // Regular shapes
    const { startX, startY, type } = drawingRef.current;
    const dx = p.x - startX;
    const dy = p.y - startY;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0066ff";
    ctx.fillStyle = "rgba(0, 102, 255, 0.1)";
    ctx.lineWidth = 2;

    if (type === TOOL.LINE) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (type === TOOL.RECTANGLE) {
      ctx.fillRect(startX, startY, dx, dy);
      ctx.strokeRect(startX, startY, dx, dy);
    } else if (type === TOOL.CIRCLE) {
      const radius = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    } else if (type === TOOL.HIGHLIGHT) {
      ctx.fillStyle = highlightColor + "40";
      ctx.fillRect(startX, startY, dx, dy);
      ctx.strokeStyle = highlightColor;
      ctx.strokeRect(startX, startY, dx, dy);
    }
  }

  function onCanvasPointerUp(e) {
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    // Freehand
    if (freehandRef.current) {
      const { points } = freehandRef.current;
      if (points.length > 3) {
        addItem({
          id: uuid(),
          type: TOOL.FREEHAND,
          points: points,
          strokeColor: "#0066ff",
          strokeWidth: 2,
        });
      }
      freehandRef.current = null;
      if (canvasRef.current) canvasRef.current.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }

    if (!drawingRef.current) return;

    const { startX, startY, type } = drawingRef.current;
    const dx = p.x - startX;
    const dy = p.y - startY;

    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      drawingRef.current = null;
      canvasRef.current.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }

    const item = {
      id: uuid(),
      type: type,
      x: Math.min(startX, p.x),
      y: Math.min(startY, p.y),
      x1: startX,
      y1: startY,
      x2: p.x,
      y2: p.y,
      strokeColor: type === TOOL.HIGHLIGHT ? highlightColor : "#0066ff",
      strokeWidth: 2,
      fillColor: type === TOOL.HIGHLIGHT ? highlightColor + "40" : "rgba(0, 102, 255, 0.1)",
    };

    if (type === TOOL.RECTANGLE) {
      item.w = Math.abs(dx);
      item.h = Math.abs(dy);
    } else if (type === TOOL.CIRCLE) {
      const radius = Math.sqrt(dx * dx + dy * dy);
      item.x = startX - radius;
      item.y = startY - radius;
      item.radius = radius;
    } else if (type === TOOL.HIGHLIGHT) {
      item.w = Math.abs(dx);
      item.h = Math.abs(dy);
    }

    addItem(item);
    drawingRef.current = null;
    canvasRef.current.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }

  // ===== TEXT & COMMENT TOOLS =====
  function onCanvasClick(e) {
    if (!fileId) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (action) return;

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    if (tool === TOOL.TEXTBOX || tool === TOOL.COVER_TEXT) {
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
        underline: false,
        strikethrough: false,
        align: "left",
        background: "transparent",
        backgroundOpacity: 1.0,
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 8,
        padding: 8,
      };

      if (tool === TOOL.COVER_TEXT) {
        addItem({
          ...base,
          type: "cover_text",
          background: "#ffffff",
          backgroundOpacity: 0.95,
        }, true);
      } else {
        addItem({ ...base, type: "textbox" }, true);
      }
    } else if (tool === TOOL.STAMP) {
      const stamp = STAMPS.find(s => s.id === selectedStamp) || STAMPS[0];
      addItem({
        id: uuid(),
        type: "stamp",
        x: p.x,
        y: p.y,
        w: 120,
        h: 60,
        stampId: selectedStamp,
        label: stamp.label,
        color: stamp.color,
      });
    } else if (tool === TOOL.COMMENT) {
      addItem({
        id: uuid(),
        type: "comment",
        x: p.x,
        y: p.y,
        text: "",
        author: "User",
        timestamp: new Date().toLocaleString(),
      });
    } else if (tool === TOOL.REDACT) {
      addItem({
        id: uuid(),
        type: "redact",
        x: p.x,
        y: p.y,
        w: 100,
        h: 40,
        color: "#000000",
      });
    }
  }

  // ===== ITEM INTERACTIONS =====
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
    if (action.moved) {
      suppressNextClickRef.current = true;
      draggedItemRef.current = action.id;
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
      textDecoration: (it.underline ? "underline " : "") + (it.strikethrough ? "line-through" : ""),
      textAlign: it.align ?? "left",
    };
  }

  // ===== PAGE MANAGEMENT =====
  async function rotateCurrentPage(angle) {
    if (!fileId) return;
    setStatus("Drehe Seite…");
    try {
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle }),
      });
      if (!res.ok) throw new Error("Rotation fehlgeschlagen");
      // Reload render
      window.location.reload();
    } catch (e) {
      setStatus("❌ Rotation fehlgeschlagen");
    }
  }

  async function duplicateCurrentPage() {
    if (!fileId) return;
    setStatus("Dupliziere Seite…");
    try {
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Duplikation fehlgeschlagen");
      const data = await res.json();
      setPageCount(data.page_count);
      setStatus("✅ Seite dupliziert");
    } catch (e) {
      setStatus("❌ Duplikation fehlgeschlagen");
    }
  }

  async function deleteCurrentPage() {
    if (!fileId || pageCount <= 1) return;
    if (!confirm("Seite wirklich löschen?")) return;
    setStatus("Lösche Seite…");
    try {
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Löschung fehlgeschlagen");
      const data = await res.json();
      setPageCount(data.page_count);
      setPageIndex(Math.min(pageIndex, data.page_count - 1));
      setStatus("✅ Seite gelöscht");
    } catch (e) {
      setStatus("❌ Löschung fehlgeschlagen");
    }
  }

  async function downloadPDF() {
    if (!fileId) return;
    setStatus("📥 PDF wird exportiert…");
    try {
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/export`);
      if (!res.ok) throw new Error("Export fehlgeschlagen");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited-${fileId}`;
      a.click();
      window.URL.revokeObjectURL(url);
      setStatus("✅ PDF heruntergeladen!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus("❌ Export fehlgeschlagen: " + e.message);
    }
  }

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
  }, [fileId, pageIndex, zoom]);

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
            <div className="brandSub">Alle Features • Professional • Vollständig</div>
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
                    {t.icon}
                  </button>
                ))}
              </div>

              <div className="sep" />

              <button className="btn ghost" onClick={() => setZoom((z) => clamp(Number((z - 0.25).toFixed(2)), 0.75, 4.0))}>
                −
              </button>
              <div className="chip">{zoom.toFixed(2)}×</div>
              <button className="btn ghost" onClick={() => setZoom((z) => clamp(Number((z + 0.25).toFixed(2)), 0.75, 4.0))}>
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

              <div className="sep" />

              <button className="btn ghost" onClick={() => rotateCurrentPage(90)} title="Drehen">
                🔄
              </button>
              <button className="btn ghost" onClick={duplicateCurrentPage} title="Duplizieren">
                📋
              </button>
              <button className="btn ghost danger" onClick={deleteCurrentPage} title="Löschen">
                🗑️
              </button>
            </>
          )}
        </div>

        <div className="meta">
          {fileId && (
            <button className="btn primary" onClick={downloadPDF}>
              💾 Herunterladen
            </button>
          )}
          {status ? <span className="status">{status}</span> : null}
          <span className={`metaText ${fileId ? "" : "muted"}`}>
            {fileId ? `${fileId.slice(0, 20)}…` : "Keine PDF geladen"}
          </span>
        </div>
      </header>

      <main className="layout">
        <aside className="side left">
          <div className="panel">
            <div className="panelTitle">📋 Elemente auf Seite</div>
            {pageEdits.length === 0 ? (
              <div className="muted">Noch keine Elemente</div>
            ) : (
              <div className="list">
                {pageEdits.map((it) => (
                  <button
                    key={it.id}
                    className={`listItem ${it.id === selectedId ? "active" : ""}`}
                    onClick={() => setSelectedId(it.id)}
                  >
                    <span className="tag">{it.type === "cover_text" ? "Abdeckung" : it.type === "line" ? "Linie" : it.type === "rectangle" ? "Rechteck" : it.type === "circle" ? "Kreis" : it.type === "freehand" ? "Freihand" : it.type === "highlight" ? "Marker" : it.type === "stamp" ? "Stempel" : it.type === "comment" ? "Notiz" : it.type === "redact" ? "Schwärzung" : "Text"}</span>
                    <span className="liText">{(it.text ?? "").slice(0, 20) || "(leer)"}</span>
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
              <div className="muted">PDF hochladen zum Bearbeiten</div>
            </div>
          ) : (
            <div
              className="pageWrap"
              onPointerMove={(e) => {
                onCanvasPointerMove(e);
                onViewerPointerMove(e);
              }}
              onPointerUp={(e) => {
                onCanvasPointerUp(e);
                stopAction();
              }}
              onPointerCancel={(e) => {
                onCanvasPointerUp(e);
                stopAction();
              }}
              onPointerLeave={(e) => {
                onCanvasPointerUp(e);
                stopAction();
              }}
            >
              <div className="page" onClick={onCanvasClick} onPointerDown={onCanvasPointerDown}>
                <img
                  ref={imgRef}
                  className="pageImg"
                  alt="PDF page"
                  draggable={false}
                  src={`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}/render?scale=${zoom}`}
                />

                <canvas
                  ref={canvasRef}
                  className="drawingCanvas"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    cursor: (tool === TOOL.FREEHAND || tool === TOOL.HIGHLIGHT || tool === TOOL.LINE || tool === TOOL.RECTANGLE || tool === TOOL.CIRCLE) ? "crosshair" : "auto",
                  }}
                />

                <div className="overlay">
                  {pageEdits.map((it) => {
                    const isSelected = it.id === selectedId;

                    // Text und interaktive Boxen
                    if (it.type === "textbox" || it.type === "cover_text" || it.type === "stamp" || it.type === "comment" || it.type === "redact" || it.type === "highlight") {
                      return (
                        <div
                          key={it.id}
                          className={`item ${isSelected ? "selected" : ""}`}
                          style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: it.type === "stamp" ? it.color + "20" : it.type === "redact" ? "#000000" : it.type === "highlight" ? (it.strokeColor + "40") : "transparent" }}
                          onPointerDown={(e) => onItemPointerDown(e, it)}
                          onPointerMove={(e) => onViewerPointerMove(e)}
                          onPointerUp={stopAction}
                          onPointerCancel={stopAction}
                          onClick={(e) => {
                            if (draggedItemRef.current === it.id) {
                              draggedItemRef.current = null;
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            setSelectedId(it.id);
                          }}
                        >
                          {it.type === "stamp" && (
                            <div style={{ fontSize: "12px", fontWeight: "bold", textAlign: "center", lineHeight: "1.4", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: it.color, transform: "rotate(-15deg)" }}>
                              {it.label}
                            </div>
                          )}
                          
                          {it.type === "comment" && (
                            <div style={{ fontSize: "12px", padding: "8px", overflow: "auto", height: "100%" }}>
                              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{it.author}</div>
                              <div>{it.text}</div>
                              <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.6 }}>{it.timestamp}</div>
                            </div>
                          )}

                          {(it.type === "textbox" || it.type === "cover_text") && (
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
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              {it.text}
                            </div>
                          )}

                          <button
                            className="delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteItem(it.id);
                            }}
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
                    }

                    // Zeichnungen (Linien, Rechtecke, Kreise, Freihand)
                    if (it.type === TOOL.LINE || it.type === TOOL.RECTANGLE || it.type === TOOL.CIRCLE || it.type === TOOL.FREEHAND) {
                      return (
                        <svg
                          key={it.id}
                          className={`drawingItem ${isSelected ? "selected" : ""}`}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: isSelected ? "auto" : "none",
                            cursor: isSelected ? "pointer" : "default",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                          }}
                        >
                          {it.type === TOOL.LINE && (
                            <line
                              x1={it.x1}
                              y1={it.y1}
                              x2={it.x2}
                              y2={it.y2}
                              stroke={it.strokeColor}
                              strokeWidth={it.strokeWidth}
                            />
                          )}
                          {it.type === TOOL.RECTANGLE && (
                            <rect
                              x={it.x}
                              y={it.y}
                              width={it.w}
                              height={it.h}
                              fill={it.fillColor}
                              stroke={it.strokeColor}
                              strokeWidth={it.strokeWidth}
                            />
                          )}
                          {it.type === TOOL.CIRCLE && (
                            <circle
                              cx={it.x + it.radius}
                              cy={it.y + it.radius}
                              r={it.radius}
                              fill={it.fillColor}
                              stroke={it.strokeColor}
                              strokeWidth={it.strokeWidth}
                            />
                          )}
                          {it.type === TOOL.FREEHAND && it.points && (
                            <polyline
                              points={it.points.map(p => `${p[0]},${p[1]}`).join(" ")}
                              fill="none"
                              stroke={it.strokeColor}
                              strokeWidth={it.strokeWidth}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      );
                    }

                    return null;
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
              <div className="muted">Element auswählen</div>
            ) : (selectedItem.type === "textbox" || selectedItem.type === "cover_text") ? (
              <div className="props">
                <div className="row">
                  <span className="label">Schriftart</span>
                  <select
                    className="select"
                    value={selectedItem.fontFamily ?? FONT_OPTIONS[0].value}
                    onChange={(e) => setProp({ fontFamily: e.target.value })}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.label} value={f.value}>{f.label}</option>
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
                  <span className="label">Stil</span>
                  <div className="btnRow">
                    <button className={`mini ${selectedItem.bold ? "on" : ""}`} onClick={() => setProp({ bold: !selectedItem.bold })}>B</button>
                    <button className={`mini ${selectedItem.italic ? "on" : ""}`} onClick={() => setProp({ italic: !selectedItem.italic })}>I</button>
                    <button className={`mini ${selectedItem.underline ? "on" : ""}`} onClick={() => setProp({ underline: !selectedItem.underline })}>U</button>
                    <button className={`mini ${selectedItem.strikethrough ? "on" : ""}`} onClick={() => setProp({ strikethrough: !selectedItem.strikethrough })}>S</button>
                  </div>
                </div>

                <div className="row">
                  <span className="label">Ausrichtung</span>
                  <div className="btnRow">
                    <button className={`mini ${selectedItem.align === "left" ? "on" : ""}`} onClick={() => setProp({ align: "left" })}>←</button>
                    <button className={`mini ${selectedItem.align === "center" ? "on" : ""}`} onClick={() => setProp({ align: "center" })}>•</button>
                    <button className={`mini ${selectedItem.align === "right" ? "on" : ""}`} onClick={() => setProp({ align: "right" })}>→</button>
                  </div>
                </div>

                <div className="row">
                  <span className="label">Background</span>
                  <input
                    className="input"
                    type="text"
                    value={selectedItem.background ?? "transparent"}
                    onChange={(e) => setProp({ background: e.target.value })}
                  />
                </div>

                <button className="btn danger" onClick={() => deleteItem(selectedItem.id)}>
                  🗑️ Löschen
                </button>
              </div>
            ) : (selectedItem.type === TOOL.LINE || selectedItem.type === TOOL.RECTANGLE || selectedItem.type === TOOL.CIRCLE || selectedItem.type === TOOL.FREEHAND) ? (
              <div className="props">
                <div className="row">
                  <span className="label">Strichfarbe</span>
                  <input
                    className="color"
                    type="color"
                    value={selectedItem.strokeColor ?? "#0066ff"}
                    onChange={(e) => setProp({ strokeColor: e.target.value })}
                  />
                </div>

                <div className="row">
                  <span className="label">Strichbreite</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="10"
                    value={selectedItem.strokeWidth ?? 2}
                    onChange={(e) => setProp({ strokeWidth: Number(e.target.value) })}
                  />
                </div>

                <button className="btn danger" onClick={() => deleteItem(selectedItem.id)}>
                  🗑️ Löschen
                </button>
              </div>
            ) : selectedItem.type === TOOL.STAMP ? (
              <div className="props">
                <div className="row">
                  <span className="label">Stempel</span>
                  <div className="stampGrid">
                    {STAMPS.map(s => (
                      <div key={s.id} className={`stampOption ${s.id === selectedItem.stampId ? "selected" : ""}`} onClick={() => setProp({ stampId: s.id, label: s.label, color: s.color })}>
                        {s.icon}
                        <br/>
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>

                <button className="btn danger" onClick={() => deleteItem(selectedItem.id)}>
                  🗑️ Löschen
                </button>
              </div>
            ) : (
              <div className="props">
                <button className="btn danger" onClick={() => deleteItem(selectedItem.id)}>
                  🗑️ Löschen
                </button>
              </div>
            )}
          </div>

          {tool === TOOL.HIGHLIGHT && (
            <div className="panel">
              <div className="panelTitle">🖍️ Marker-Farbe</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {HIGHLIGHT_COLORS.map(color => (
                  <button
                    key={color}
                    className={`btn ${highlightColor === color ? "primary" : ""}`}
                    style={{ background: color, height: "36px" }}
                    onClick={() => setHighlightColor(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {tool === TOOL.STAMP && (
            <div className="panel">
              <div className="panelTitle">🔖 Stempel auswählen</div>
              <div className="stampGrid">
                {STAMPS.map(s => (
                  <div
                    key={s.id}
                    className={`stampOption ${s.id === selectedStamp ? "selected" : ""}`}
                    onClick={() => setSelectedStamp(s.id)}
                  >
                    {s.icon}
                    <br/>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
