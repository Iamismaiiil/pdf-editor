import React, { useEffect, useMemo, useRef, useState } from "react";
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
  { id: TOOL.TEXTBOX, label: "Text", icon: "📝", desc: "Textfeld einfügen/bearbeiten", category: "text" },
  { id: TOOL.COVER_TEXT, label: "Abdecken", icon: "✨", desc: "Bereich überdecken", category: "text" },
  { id: TOOL.FREEHAND, label: "Stift", icon: "✏️", desc: "Freihand zeichnen", category: "drawing" },
  { id: TOOL.HIGHLIGHT, label: "Marker", icon: "🖍️", desc: "Bereich markieren", category: "drawing" },
  { id: TOOL.LINE, label: "Linie", icon: "📏", desc: "Linie ziehen", category: "drawing" },
  { id: TOOL.RECTANGLE, label: "Rechteck", icon: "◻️", desc: "Rechteck zeichnen", category: "drawing" },
  { id: TOOL.CIRCLE, label: "Kreis", icon: "⭕", desc: "Kreis zeichnen", category: "drawing" },
  { id: TOOL.COMMENT, label: "Notiz", icon: "💬", desc: "Kommentar-Notiz", category: "markup" },
  { id: TOOL.STAMP, label: "Stempel", icon: "🔖", desc: "Stempel platzieren", category: "markup" },
  { id: TOOL.REDACT, label: "Schwärzen", icon: "⬛", desc: "Schwärzungs-Box", category: "security" },
  { id: TOOL.SIGNATURE, label: "Signatur", icon: "✍️", desc: "Unterschrift platzieren", category: "security" },
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

const HIGHLIGHT_COLORS = [
  "#ffff00",
  "#ffcc00",
  "#ffd166",
  "#ff6600",
  "#00ff00",
  "#22c55e",
  "#10b981",
  "#00ffff",
  "#4fd1c5",
  "#1d4ed8",
  "#a855f7",
  "#ff00ff",
  "#ff4d6d",
  "#111111",
  "#ffffff",
];

const DEFAULT_SIGNATURE_PATH = "M8 72 Q 34 18 76 42 T 140 54 Q 168 92 210 30 Q 228 24 248 62";

const TEXT_BASE = {
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0].value,
  color: "#111111",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: "left",
  padding: 10,
  borderRadius: 10,
  borderColor: "rgba(0,0,0,0.08)",
  borderWidth: 0,
  background: "transparent",
  shadow: "none",
  lineHeight: 1.35,
  letterSpacing: 0,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function uuid() {
  return (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()).toString();
}

function hexToRgba(hex, alpha = 0.25) {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(255,255,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function tryFetch(urls, options) {
  let last = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, options);
      if (res.ok) return res;
      const t = await res.text().catch(() => "");
      last = new Error(`${res.status} ${res.statusText} :: ${u} :: ${t}`);
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error("Request failed");
}

function ToolButton({ active, icon, label, desc, onClick, compact = false }) {
  return (
    <button
      className={`toolBtn ${active ? "active" : ""} ${compact ? "compact" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={desc}
      type="button"
    >
      <span className="toolIcon" aria-hidden="true">
        {icon}
      </span>
      <span className="toolLabel">{label}</span>
    </button>
  );
}

export default function App() {
  const [fileId, setFileId] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState(TOOL.TEXTBOX);
  const [zoom, setZoom] = useState(2.0);
  const [edits, setEdits] = useState({ version: 1, pages: {} });
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [action, setAction] = useState(null);

  const actionPreviewRef = useRef({ dx: 0, dy: 0 });
  const rafRef = useRef(null);
  const [, setTick] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");

  const [selectedStamp, setSelectedStamp] = useState("approved");
  const [highlightColor, setHighlightColor] = useState("#ffff00");
  const [penColor, setPenColor] = useState("#0066ff");
  const [textDefaults, setTextDefaults] = useState(TEXT_BASE);

  const fileInputRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const drawingRef = useRef(null);
  const freehandRef = useRef(null);

  const saveTimerRef = useRef(null);
  const restoredPageRef = useRef(new Set());
  const suppressNextClickRef = useRef(false);

  // Text input lag fix: draft text lives here while editing; commit on blur
  const textDraftRef = useRef(new Map()); // id -> string

  function bumpPreview() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTick((t) => t + 1);
    });
  }

  const pageKey = String(pageIndex);
  const pageEdits = edits.pages?.[pageKey] ?? [];

  const selectedItem = useMemo(
    () => pageEdits.find((it) => it.id === selectedId) ?? null,
    [pageEdits, selectedId]
  );

  const isTextSelection =
    selectedItem && (selectedItem.type === TOOL.TEXTBOX || selectedItem.type === TOOL.COVER_TEXT);

  const textModel = useMemo(
    () => ({ ...TEXT_BASE, ...textDefaults, ...(isTextSelection ? selectedItem : {}) }),
    [isTextSelection, selectedItem, textDefaults]
  );

  const backgroundValue =
    textModel.background && textModel.background.startsWith("#") ? textModel.background : "#ffffff";
  const borderColorValue =
    textModel.borderColor && textModel.borderColor.startsWith("#") ? textModel.borderColor : "#e3e9f3";

  function updateTextSetting(key, value) {
    if (isTextSelection) updateItem(selectedItem.id, { [key]: value });
    setTextDefaults((prev) => ({ ...prev, [key]: value }));
  }

  function isDrawingTool(t) {
    return (
      t === TOOL.FREEHAND ||
      t === TOOL.HIGHLIGHT ||
      t === TOOL.LINE ||
      t === TOOL.RECTANGLE ||
      t === TOOL.CIRCLE
    );
  }

  function canvasCursor() {
    if (isDrawingTool(tool)) return "crosshair";
    if (tool === TOOL.TEXTBOX || tool === TOOL.COVER_TEXT) return "text";
    if (
      tool === TOOL.STAMP ||
      tool === TOOL.COMMENT ||
      tool === TOOL.REDACT ||
      tool === TOOL.SIGNATURE
    )
      return "copy";
    return "default";
  }

  function textStyleOf(it) {
    const base = { ...TEXT_BASE, ...textDefaults, ...it };
    const shadow =
      base.shadow === "strong"
        ? "0 14px 32px rgba(0,0,0,0.18)"
        : base.shadow === "soft"
        ? "0 8px 22px rgba(0,0,0,0.12)"
        : "none";

    return {
      fontSize: base.fontSize,
      fontFamily: base.fontFamily,
      color: base.color,
      fontWeight: base.bold ? 700 : 400,
      fontStyle: base.italic ? "italic" : "normal",
      textDecoration: (base.underline ? "underline " : "") + (base.strikethrough ? "line-through" : ""),
      textAlign: base.align ?? "left",
      lineHeight: base.lineHeight ?? 1.35,
      letterSpacing: (base.letterSpacing ?? 0) + "px",
      border: (base.borderWidth ?? 0)
        ? `${base.borderWidth}px solid ${base.borderColor ?? "rgba(0,0,0,0.08)"}`
        : "none",
      boxShadow: shadow,
      background:
        base.background && base.background !== "transparent"
          ? base.background
          : it.type === TOOL.COVER_TEXT
          ? "rgba(255,255,255,0.98)"
          : "transparent",
      borderRadius: (base.borderRadius ?? 10) + "px",
      padding: (base.padding ?? 10) + "px",
      direction: "ltr",
      unicodeBidi: "plaintext",
    };
  }

  async function loadEdits(fid) {
    const res = await fetch(`${API}/files/${encodeURIComponent(fid)}/edits`);
    const data = await res.json();
    setEdits(data);
    setSelectedId(null);
    setEditingId(null);
  }

  function schedulePersist(nextEdits) {
    if (!fileId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${API}/files/${encodeURIComponent(fileId)}/edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextEdits),
      }).catch((e) => console.error("Persist edits failed:", e));
      saveTimerRef.current = null;
    }, 300);
  }

  function saveEdits(nextEdits) {
    setEdits(nextEdits);
    schedulePersist(nextEdits);
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

      const savedIdx = Number(localStorage.getItem(`pdfPage:${data.file_id}`));
      const targetIdx = clamp(isNaN(savedIdx) ? 0 : savedIdx, 0, Math.max(0, (data.page_count ?? 1) - 1));
      setPageIndex(targetIdx);

      restoredPageRef.current.add(data.file_id);
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
    textDraftRef.current.delete(id);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
  }

  function addItem(item, focus = false) {
    const next = { ...edits, pages: { ...edits.pages, [pageKey]: [...pageEdits, item] } };
    saveEdits(next);
    setSelectedId(item.id);
    if (focus) setEditingId(item.id);
    else setEditingId(null);
  }

  function getRelPosFromClient(clientX, clientY) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // ========= Drawing =========
  function onCanvasPointerDown(e) {
    if (!fileId) return;
    if (!isDrawingTool(tool)) return;
    e.preventDefault();
    e.stopPropagation();
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    setEditingId(null);
    setSelectedId(null);
    if (tool === TOOL.FREEHAND) {
      freehandRef.current = { points: [[p.x, p.y]] };
    } else {
      drawingRef.current = { startX: p.x, startY: p.y, type: tool };
    }
  }

  function onCanvasPointerMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!drawingRef.current && !freehandRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (freehandRef.current) {
      freehandRef.current.points.push([p.x, p.y]);
      ctx.strokeStyle = penColor || "#0066ff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = freehandRef.current.points;
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      return;
    }

    const { startX, startY, type } = drawingRef.current;
    const dx = p.x - startX;
    const dy = p.y - startY;

    if (type === TOOL.LINE) {
      ctx.strokeStyle = penColor || "#0066ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }

    if (type === TOOL.RECTANGLE) {
      ctx.strokeStyle = penColor || "#0066ff";
      ctx.fillStyle = "rgba(0,102,255,0.10)";
      ctx.lineWidth = 2;
      ctx.fillRect(startX, startY, dx, dy);
      ctx.strokeRect(startX, startY, dx, dy);
      return;
    }

    if (type === TOOL.HIGHLIGHT) {
      ctx.strokeStyle = highlightColor;
      ctx.fillStyle = hexToRgba(highlightColor, 0.25);
      ctx.lineWidth = 2;
      ctx.fillRect(startX, startY, dx, dy);
      ctx.strokeRect(startX, startY, dx, dy);
      return;
    }

    if (type === TOOL.CIRCLE) {
      ctx.strokeStyle = penColor || "#0066ff";
      ctx.fillStyle = "rgba(0,102,255,0.10)";
      ctx.lineWidth = 2;
      const radius = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      return;
    }
  }

  function onCanvasPointerUp(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!drawingRef.current && !freehandRef.current) return;
    const ctx = canvas.getContext("2d");
    const clear = () => ctx?.clearRect(0, 0, canvas.width, canvas.height);

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) {
      drawingRef.current = null;
      freehandRef.current = null;
      clear();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (freehandRef.current) {
      const pts = freehandRef.current.points;
      if (pts.length > 3) {
        addItem({
          id: uuid(),
          type: TOOL.FREEHAND,
          points: pts,
          strokeColor: penColor || "#0066ff",
          strokeWidth: 2,
        });
      }
      freehandRef.current = null;
      clear();
      return;
    }

    const { startX, startY, type } = drawingRef.current;
    const dx = p.x - startX;
    const dy = p.y - startY;

    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      drawingRef.current = null;
      clear();
      return;
    }

    const item = {
      id: uuid(),
      type,
      x1: startX,
      y1: startY,
      x2: p.x,
      y2: p.y,
      strokeColor: type === TOOL.HIGHLIGHT ? highlightColor : penColor || "#0066ff",
      strokeWidth: 2,
      fillColor: type === TOOL.HIGHLIGHT ? hexToRgba(highlightColor, 0.25) : "rgba(0,102,255,0.10)",
    };

    if (type === TOOL.RECTANGLE || type === TOOL.HIGHLIGHT) {
      item.x = Math.min(startX, p.x);
      item.y = Math.min(startY, p.y);
      item.w = Math.abs(dx);
      item.h = Math.abs(dy);
    } else if (type === TOOL.CIRCLE) {
      const radius = Math.sqrt(dx * dx + dy * dy);
      item.x = startX - radius;
      item.y = startY - radius;
      item.radius = radius;
    }

    addItem(item);
    drawingRef.current = null;
    clear();
  }

  // ========= Click to insert =========
  function onPageClick(e) {
    if (!fileId) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (action) return;
    if (isDrawingTool(tool)) return;

    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;

    const hadSelection = Boolean(selectedId);
    setEditingId(null);
    setSelectedId(null);

    if (tool === TOOL.TEXTBOX || tool === TOOL.COVER_TEXT) {
      if (hadSelection) return;
      const baseText = { ...TEXT_BASE, ...textDefaults };
      addItem(
        {
          id: uuid(),
          type: tool,
          x: p.x,
          y: p.y,
          w: 320,
          h: 70,
          text: "",
          fontSize: baseText.fontSize,
          fontFamily: baseText.fontFamily,
          color: baseText.color,
          bold: baseText.bold,
          italic: baseText.italic,
          underline: baseText.underline,
          strikethrough: baseText.strikethrough,
          align: baseText.align,
          padding: baseText.padding,
          borderRadius: baseText.borderRadius,
          borderColor: baseText.borderColor,
          borderWidth: baseText.borderWidth,
          background:
            tool === TOOL.COVER_TEXT
              ? baseText.background && baseText.background !== "transparent"
                ? baseText.background
                : "rgba(255,255,255,0.98)"
              : baseText.background,
          shadow: baseText.shadow,
          lineHeight: baseText.lineHeight,
          letterSpacing: baseText.letterSpacing,
        },
        true
      );
      return;
    }

    if (tool === TOOL.STAMP) {
      if (hadSelection) return;
      const stamp = STAMPS.find((s) => s.id === selectedStamp) || STAMPS[0];
      addItem({
        id: uuid(),
        type: TOOL.STAMP,
        x: p.x,
        y: p.y,
        w: 160,
        h: 72,
        label: stamp.label,
        color: stamp.color,
      });
      return;
    }

    if (tool === TOOL.SIGNATURE) {
      if (hadSelection) return;
      addItem({
        id: uuid(),
        type: TOOL.SIGNATURE,
        x: p.x,
        y: p.y,
        w: 240,
        h: 90,
        path: DEFAULT_SIGNATURE_PATH,
        strokeColor: "#0f172a",
        strokeWidth: 2.4,
      });
      return;
    }

    if (tool === TOOL.COMMENT) {
      addItem({
        id: uuid(),
        type: TOOL.COMMENT,
        x: p.x,
        y: p.y,
        w: 240,
        h: 130,
        text: "Notiz…",
        author: "User",
        timestamp: new Date().toLocaleString(),
      });
      return;
    }

    if (tool === TOOL.REDACT) {
      addItem({ id: uuid(), type: TOOL.REDACT, x: p.x, y: p.y, w: 160, h: 48, color: "#000000" });
      return;
    }
  }

  // ========= Drag / Resize =========
  function beginDrag(e, it) {
    if (e.button !== undefined && e.button !== 0) return;
    if (editingId === it.id) return;
    e.preventDefault();
    e.stopPropagation();
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelectedId(it.id);
    setEditingId(null);
    actionPreviewRef.current = { dx: 0, dy: 0 };
    setAction({ mode: "drag", id: it.id, startX: p.x, startY: p.y, orig: { x: it.x, y: it.y }, moved: false });
  }

  function beginResize(e, it, handle) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = getRelPosFromClient(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelectedId(it.id);
    setEditingId(null);
    actionPreviewRef.current = { dx: 0, dy: 0 };
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

  useEffect(() => {
    if (!action) return;

    const onMove = (e) => {
      const p = getRelPosFromClient(e.clientX, e.clientY);
      if (!p) return;
      const dx = p.x - action.startX;
      const dy = p.y - action.startY;
      actionPreviewRef.current = { dx, dy };
      if (!action.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        setAction((a) => (a ? { ...a, moved: true } : a));
        suppressNextClickRef.current = true;
      }
      bumpPreview();
    };

    const onUp = () => {
      const { dx, dy } = actionPreviewRef.current;

      if (action.mode === "drag") {
        updateItem(action.id, { x: action.orig.x + dx, y: action.orig.y + dy });
      } else if (action.mode === "resize") {
        const { handle, orig } = action;
        let x = orig.x,
          y = orig.y,
          w = orig.w,
          h = orig.h;
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
        w = clamp(w, 90, 2400);
        h = clamp(h, 34, 2400);
        updateItem(action.id, { x, y, w, h });
      }

      actionPreviewRef.current = { dx: 0, dy: 0 };
      if (action.moved) suppressNextClickRef.current = true;
      setAction(null);
      bumpPreview();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // ========= Canvas size sync =========
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const sync = () => {
      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(img);
    return () => ro.disconnect();
  }, [fileId, pageIndex, zoom]);

  // persist page index per file so refresh keeps current page
  useEffect(() => {
    if (!fileId || pageCount < 1) return;
    const key = `pdfPage:${fileId}`;
    localStorage.setItem(key, String(clamp(pageIndex, 0, pageCount - 1)));
    localStorage.setItem("pdfLastFile", fileId);
  }, [fileId, pageIndex, pageCount]);

  useEffect(() => {
    if (!fileId || pageCount < 1) return;
    if (restoredPageRef.current.has(fileId)) return;
    const key = `pdfPage:${fileId}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const idx = clamp(Number(saved) || 0, 0, pageCount - 1);
      setPageIndex(idx);
      restoredPageRef.current.add(fileId);
    }
  }, [fileId, pageCount]);

  // when entering edit mode, seed draft and focus element, but DON'T rerender text each keystroke
  useEffect(() => {
    if (!editingId) return;
    const it = pageEdits.find((x) => x.id === editingId);
    if (!it) return;

    textDraftRef.current.set(editingId, it.text ?? "");

    setTimeout(() => {
      const el = document.querySelector(`[data-editable-id="${CSS.escape(editingId)}"]`);
      if (!el) return;
      if (el.innerText !== (it.text ?? "")) el.innerText = it.text ?? "";
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
  }, [editingId, pageEdits]);

  // ========= Rotate / Delete / Export =========
  async function rotateCurrentPage(angle) {
    if (!fileId) return;
    setStatus("Drehe Seite…");
    try {
      const fid = encodeURIComponent(fileId);
      const urls = [
        `${API}/files/${fid}/page/${pageIndex}/rotate`,
        `${API}/files/${fid}/pages/${pageIndex}/rotate`,
        `${API}/files/${fid}/page/rotate?page=${pageIndex}&angle=${angle}`,
        `${API}/files/${fid}/rotate?page=${pageIndex}&angle=${angle}`,
        `${API}/rotate?file_id=${fid}&page=${pageIndex}&angle=${angle}`,
      ];
      const res = await tryFetch(urls, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle, page_index: pageIndex, page: pageIndex }),
      });
      const txt = await res.text().catch(() => "");
      console.log("rotate ok:", txt);
      setStatus("✅ Gedreht");
      setTimeout(() => setStatus(""), 900);
      setZoom((z) => z);
    } catch (e) {
      console.error("rotate failed:", e);
      setStatus("❌ Drehen geht nicht");
      alert(
        "Drehen-Request fehlgeschlagen.\n\n" +
          "Öffne DevTools -> Network und schau ob 404/500.\n\n" +
          "Fehler:\n" +
          String(e?.message ?? e)
      );
    }
  }

  async function deleteCurrentPage() {
    if (!fileId || pageCount <= 1) return;
    if (!confirm("Seite wirklich löschen?")) return;
    setStatus("Lösche Seite…");
    try {
      const fid = encodeURIComponent(fileId);
      const urls = [
        `${API}/files/${fid}/page/${pageIndex}`,
        `${API}/files/${fid}/pages/${pageIndex}`,
        `${API}/files/${fid}/delete_page?page=${pageIndex}`,
        `${API}/delete_page?file_id=${fid}&page=${pageIndex}`,
      ];
      await tryFetch(urls, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_index: pageIndex, page: pageIndex }),
      });
      const data = await fetch(`${API}/files/${encodeURIComponent(fileId)}/meta`).then((r) => r.json()).catch(() => ({}));
      const newCount = typeof data?.page_count === "number" ? data.page_count : Math.max(1, pageCount - 1);
      setPageCount(newCount);
      setPageIndex((p) => clamp(Math.min(p, newCount - 1), 0, newCount - 1));
      setStatus("✅ Seite gelöscht");
      setTimeout(() => setStatus(""), 900);
    } catch (e) {
      console.error("delete page failed:", e);
      setStatus("❌ Seite löschen geht nicht");
      alert("Seite löschen fehlgeschlagen:\n" + String(e?.message ?? e));
    }
  }

  async function downloadPDF() {
    if (!fileId) return;
    setStatus("📥 Export…");
    try {
      const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/export`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edited-${fileId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      setStatus("✅ Export fertig");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      setStatus("❌ Export fehlgeschlagen");
      alert("Export fehlgeschlagen:\n" + String(e?.message ?? e));
    }
  }

  // ========= UI groups =========
  const toolsByCat = useMemo(() => {
    const map = new Map();
    for (const t of TOOLS) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category).push(t);
    }
    return map;
  }, []);

  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div className="brandText">
            <div className="brandTitle">PDF Studio</div>
            <div className="brandSub">Modern • Smooth • Mobile</div>
          </div>
        </div>

        <div className="toolbar">
          <label className="filePick">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await uploadFile(f);
              }}
            />
            <span>{isUploading ? "⏳ Lade…" : "📄 PDF öffnen"}</span>
            <span className="filePickLabel">{isUploading ? "Lade..." : "PDF öffnen"}</span>
          </label>

          {fileId && (
            <>
              <div className="toolDropdown">
                <div className="toolGroupLabel">Tool-Auswahl</div>
                <select className="toolSelectInput" value={tool} onChange={(e) => setTool(e.target.value)}>
                  {TOOLS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sep" />

              <div className="toolGroup desktopOnly">
                <div className="toolGroupLabel">Tools</div>
                <div className="toolRow">
                  {TOOLS.map((t) => (
                    <ToolButton
                      key={t.id}
                      active={tool === t.id}
                      icon={t.icon}
                      label={t.label}
                      desc={t.desc}
                      onClick={() => setTool(t.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="meta">
          {fileId && (
            <button
              className="btn primary"
              onClick={(e) => {
                e.stopPropagation();
                downloadPDF();
              }}
              type="button"
            >
              💾 Export
            </button>
          )}
          {status ? <span className="status">{status}</span> : null}
        </div>
      </header>

      <main className="layout">
        <section className="viewer">
          {!fileId ? (
            <div className="landing">
              <div className="hero">
                <div className="heroCopy">
                  <div className="eyebrow">PDF Studio</div>
                  <h1>PDF fix & schnell bearbeiten</h1>
                  <p className="muted">
                    Hochladen, markieren, unterschreiben, exportieren. Kompakte Tool-Gruppen, klare UI.
                  </p>
                  <div className="ctaRow">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      PDF hochladen
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTool(TOOL.TEXTBOX);
                      }}
                    >
                      Textfeld testen
                    </button>
                  </div>
                  <div className="heroBadges">
                    <span className="pill">Rahmen + Schatten + Linien</span>
                    <span className="pill">Farben, Schriften, Größen</span>
                    <span className="pill">Dropdown Tool-Auswahl</span>
                  </div>
                </div>

                <div className="heroPreview">
                  <div className="previewCard">
                    <div className="previewHeader">
                      <span className="dot red" />
                      <span className="dot yellow" />
                      <span className="dot green" />
                      <span className="previewTitle">Live-Vorschau</span>
                    </div>
                    <div className="previewBody">
                      <div className="previewText">
                        <div className="previewLine bold">Fett • Rahmen 2px • Schatten</div>
                        <div className="previewLine muted">Linienhöhe 1.4 • Letterspacing 0.3px</div>
                        <div className="previewTag">Größe 18px</div>
                      </div>
                      <div className="previewControls">
                        <div className="previewControl">
                          <span>Schriftgröße</span>
                          <div className="bar">
                            <div style={{ width: "68%" }} />
                          </div>
                        </div>
                        <div className="previewControl">
                          <span>Rand + Schatten</span>
                          <div className="bar dark">
                            <div style={{ width: "54%" }} />
                          </div>
                        </div>
                        <div className="previewControl">
                          <span>Linienhöhe</span>
                          <div className="bar soft">
                            <div style={{ width: "42%" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="landingGrid">
                <div className="landingCard">
                  <div className="cardTitle">Text & Layout</div>
                  <ul>
                    <li>Schriftart, Größe, Farbe, Ausrichtung</li>
                    <li>Randfarbe, Linienbreite, Schatten-Stärke</li>
                    <li>Padding, Radius, Zeilenhöhe, Buchstabenabstand</li>
                  </ul>
                </div>
                <div className="landingCard">
                  <div className="cardTitle">Zeichen & Tools</div>
                  <ul>
                    <li>Marker-Farben, Linien, Formen, Stempel</li>
                    <li>Dropdown-Auswahl für enge Screens</li>
                    <li>Mobile Dock bleibt clean</li>
                  </ul>
                </div>
                <div className="landingCard">
                  <div className="cardTitle">Export bereit</div>
                  <ul>
                    <li>Seiten drehen/löschen, Zoom fein steuerbar</li>
                    <li>Upload bleibt oben erreichbar</li>
                    <li>Export-Button immer sichtbar</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="pageWrap">
              <div className="pageTopActions">
                <div className="pager">
                  <button
                    className="btn ghost"
                    disabled={!canPrev}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageIndex((p) => clamp(p - 1, 0, pageCount - 1));
                    }}
                    type="button"
                  >
                    ◀
                  </button>
                  <div className="chip">{pageCount ? `${pageIndex + 1} / ${pageCount}` : "—"}</div>
                  <button
                    className="btn ghost"
                    disabled={!canNext}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageIndex((p) => clamp(p + 1, 0, pageCount - 1));
                    }}
                    type="button"
                  >
                    ▶
                  </button>
                </div>

                <div className="zoomRow">
                  <button
                    className="btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoom((z) => clamp(Number((z - 0.25).toFixed(2)), 0.75, 4.0));
                    }}
                    type="button"
                  >
                    −
                  </button>
                  <div className="chip">{zoom.toFixed(2)}×</div>
                  <button
                    className="btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoom((z) => clamp(Number((z + 0.25).toFixed(2)), 0.75, 4.0));
                    }}
                    type="button"
                  >
                    +
                  </button>
                </div>

                <div className="pageOps">
                  <button
                    className="btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      rotateCurrentPage(90);
                    }}
                    type="button"
                  >
                    🔄 Drehen
                  </button>
                  <button
                    className="btn ghost danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCurrentPage();
                    }}
                    type="button"
                  >
                    🗑️ Seite löschen
                  </button>
                </div>

                {(tool === TOOL.TEXTBOX || tool === TOOL.COVER_TEXT || isTextSelection) && (
                  <div className="inspectorCard">
                    <div className="inspectorHeader">
                      <div>
                        <div className="eyebrow">Textfeld</div>
                        <div className="inspectorTitle">
                          {isTextSelection ? "Ausgewähltes Feld" : "Defaults für neue Felder"}
                        </div>
                      </div>
                      <div className="inspectorHint">Rand, Schatten, Linie, Schriftart & Größe</div>
                    </div>

                    <div className="inspectorGrid">
                      <div className="control">
                        <div className="controlLabel">Schrift</div>
                        <div className="controlRow">
                          <select value={textModel.fontFamily} onChange={(e) => updateTextSetting("fontFamily", e.target.value)}>
                            {FONT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>

                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="10"
                              max="64"
                              step="1"
                              value={textModel.fontSize ?? 16}
                              onChange={(e) => updateTextSetting("fontSize", clamp(Number(e.target.value) || 16, 8, 120))}
                            />
                            <span className="chip small">{textModel.fontSize ?? 16}px</span>
                          </div>
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Ausrichtung</div>
                        <div className="buttonGroup">
                          {["left", "center", "right"].map((a) => (
                            <button
                              key={a}
                              className={`btn ghost ${textModel.align === a ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTextSetting("align", a);
                              }}
                              type="button"
                            >
                              {a === "left" ? "Links" : a === "center" ? "Zentriert" : "Rechts"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Stil</div>
                        <div className="buttonGroup">
                          <button
                            className={`btn ghost ${textModel.bold ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTextSetting("bold", !textModel.bold);
                            }}
                            type="button"
                          >
                            Fett
                          </button>
                          <button
                            className={`btn ghost ${textModel.italic ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTextSetting("italic", !textModel.italic);
                            }}
                            type="button"
                          >
                            Kursiv
                          </button>
                          <button
                            className={`btn ghost ${textModel.underline ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTextSetting("underline", !textModel.underline);
                            }}
                            type="button"
                          >
                            Unterstr.
                          </button>
                          <button
                            className={`btn ghost ${textModel.strikethrough ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTextSetting("strikethrough", !textModel.strikethrough);
                            }}
                            type="button"
                          >
                            Durchstr.
                          </button>
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Farben</div>
                        <div className="colorRow">
                          <label>Text</label>
                          <input type="color" value={textModel.color ?? "#111111"} onChange={(e) => updateTextSetting("color", e.target.value)} />
                          <label>Hintergrund</label>
                          <input type="color" value={backgroundValue} onChange={(e) => updateTextSetting("background", e.target.value)} />
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Rand & Schatten</div>
                        <div className="controlRow">
                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="0"
                              max="8"
                              step="1"
                              value={textModel.borderWidth ?? 0}
                              onChange={(e) => updateTextSetting("borderWidth", clamp(Number(e.target.value) || 0, 0, 12))}
                            />
                            <span className="chip small">{textModel.borderWidth ?? 0}px Rand</span>
                          </div>
                          <input type="color" value={borderColorValue} onChange={(e) => updateTextSetting("borderColor", e.target.value)} />
                          <select value={textModel.shadow ?? "none"} onChange={(e) => updateTextSetting("shadow", e.target.value)}>
                            <option value="none">Kein Schatten</option>
                            <option value="soft">Weich</option>
                            <option value="strong">Kräftig</option>
                          </select>
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Abstände</div>
                        <div className="controlRow">
                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="4"
                              max="60"
                              step="1"
                              value={textModel.padding ?? 10}
                              onChange={(e) => updateTextSetting("padding", clamp(Number(e.target.value) || 10, 4, 120))}
                            />
                            <span className="chip small">Padding {textModel.padding ?? 10}px</span>
                          </div>
                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="0"
                              max="40"
                              step="1"
                              value={textModel.borderRadius ?? 10}
                              onChange={(e) => updateTextSetting("borderRadius", clamp(Number(e.target.value) || 0, 0, 80))}
                            />
                            <span className="chip small">Radius {textModel.borderRadius ?? 10}px</span>
                          </div>
                        </div>
                      </div>

                      <div className="control">
                        <div className="controlLabel">Linien</div>
                        <div className="controlRow">
                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="1"
                              max="2"
                              step="0.05"
                              value={textModel.lineHeight ?? 1.35}
                              onChange={(e) => updateTextSetting("lineHeight", clamp(Number(e.target.value) || 1.35, 1, 2))}
                            />
                            <span className="chip small">Zeilenhöhe {textModel.lineHeight ?? 1.35}</span>
                          </div>
                          <div className="rangeWrap">
                            <input
                              type="range"
                              min="-1"
                              max="4"
                              step="0.1"
                              value={textModel.letterSpacing ?? 0}
                              onChange={(e) => updateTextSetting("letterSpacing", Number(e.target.value) || 0)}
                            />
                            <span className="chip small">Spacing {textModel.letterSpacing ?? 0}px</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* ✅ FIX: close pageTopActions before the page canvas */}
              <div className="page" onClick={onPageClick}>
                <img
                  ref={imgRef}
                  className="pageImg"
                  alt="PDF page"
                  draggable={false}
                  src={`${API}/files/${encodeURIComponent(fileId)}/page/${pageIndex}/render?scale=${zoom}&t=${Date.now()}`}
                />

                <canvas
                  ref={canvasRef}
                  className="drawingCanvas"
                  style={{ cursor: canvasCursor() }}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerCancel={onCanvasPointerUp}
                  onPointerLeave={onCanvasPointerUp}
                />

                <div className="overlay" style={{ pointerEvents: isDrawingTool(tool) ? "none" : "auto" }}>
                  {pageEdits.map((it) => {
                    const isSelected = it.id === selectedId;
                    const isEditing = it.id === editingId;
                    const previewActive = action?.id === it.id;
                    const dx = previewActive ? actionPreviewRef.current.dx : 0;
                    const dy = previewActive ? actionPreviewRef.current.dy : 0;

                    if (it.type === TOOL.TEXTBOX || it.type === TOOL.COVER_TEXT) {
                      let liveX = it.x,
                        liveY = it.y,
                        liveW = it.w,
                        liveH = it.h;

                      if (previewActive && action?.mode === "drag") {
                        liveX = action.orig.x + dx;
                        liveY = action.orig.y + dy;
                      } else if (previewActive && action?.mode === "resize") {
                        const { handle, orig } = action;
                        let x = orig.x,
                          y = orig.y,
                          w = orig.w,
                          h = orig.h;
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
                        liveX = x;
                        liveY = y;
                        liveW = clamp(w, 90, 2400);
                        liveH = clamp(h, 34, 2400);
                      }

                      return (
                        <div
                          key={it.id}
                          className={`pdfBox ${isSelected ? "selected" : ""}`}
                          style={{ left: liveX, top: liveY, width: liveW, height: liveH }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                          }}
                        >
                          <div className="pdfBoxFrame" onPointerDown={(e) => beginDrag(e, it)} title="Ziehen" />

                          {isSelected && (
                            <div
                              className="floatBar"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                suppressNextClickRef.current = true;
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                suppressNextClickRef.current = true;
                              }}
                            >
                              <button
                                className="floatBtn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  suppressNextClickRef.current = true;
                                  setEditingId(it.id);
                                }}
                                type="button"
                              >
                                ✎ Bearbeiten
                              </button>

                              <button
                                className="floatBtn danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  suppressNextClickRef.current = true;
                                  deleteItem(it.id);
                                }}
                                type="button"
                              >
                                🗑 Löschen
                              </button>
                            </div>
                          )}

                          <div
                            className={`pdfText ${isEditing ? "editing" : ""}`}
                            data-editable-id={it.id}
                            style={{ ...textStyleOf(it) }}
                            dir="ltr"
                            contentEditable={isEditing}
                            suppressContentEditableWarning
                            onPointerDown={(e) => e.stopPropagation()}
                            onInput={(e) => {
                              textDraftRef.current.set(it.id, e.currentTarget.innerText);
                            }}
                            onBlur={() => {
                              const draft = textDraftRef.current.get(it.id);
                              if (typeof draft === "string" && draft !== (it.text ?? "")) {
                                updateItem(it.id, { text: draft });
                              }
                              setEditingId(null);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              suppressNextClickRef.current = true;
                              setSelectedId(it.id);
                              setEditingId(it.id);
                            }}
                          >
                            {!isEditing ? it.text ?? "" : null}
                          </div>

                          {isSelected && (
                            <>
                              <div className="h nw" onPointerDown={(e) => beginResize(e, it, "nw")} />
                              <div className="h ne" onPointerDown={(e) => beginResize(e, it, "ne")} />
                              <div className="h sw" onPointerDown={(e) => beginResize(e, it, "sw")} />
                              <div className="h se" onPointerDown={(e) => beginResize(e, it, "se")} />
                            </>
                          )}
                        </div>
                      );
                    }

                    if (it.type === TOOL.STAMP) {
                      return (
                        <div
                          key={it.id}
                          className={`pdfBox ${isSelected ? "selected" : ""}`}
                          style={{
                            left: it.x,
                            top: it.y,
                            width: it.w,
                            height: it.h,
                            background: it.color + "16",
                            borderRadius: 12,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                            setEditingId(null);
                          }}
                        >
                          <div className="pdfBoxFrame" onPointerDown={(e) => beginDrag(e, it)} />
                          <div className="stampInner" style={{ color: it.color }}>
                            {it.label}
                          </div>

                          {isSelected && (
                            <div
                              className="floatBar"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                suppressNextClickRef.current = true;
                              }}
                            >
                              <button
                                className="floatBtn danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  suppressNextClickRef.current = true;
                                  deleteItem(it.id);
                                }}
                                type="button"
                              >
                                🗑 Löschen
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (it.type === TOOL.SIGNATURE) {
                      return (
                        <div
                          key={it.id}
                          className={`pdfBox ${isSelected ? "selected" : ""}`}
                          style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                            setEditingId(null);
                          }}
                        >
                          <div className="pdfBoxFrame" onPointerDown={(e) => beginDrag(e, it)} />
                          <div className="signaturePad">
                            <svg viewBox="0 0 260 100" preserveAspectRatio="xMidYMid meet">
                              <path
                                d={it.path || DEFAULT_SIGNATURE_PATH}
                                stroke={it.strokeColor || "#0f172a"}
                                strokeWidth={it.strokeWidth || 2.4}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div className="sigLabel">Signatur</div>
                          </div>

                          {isSelected && (
                            <div
                              className="floatBar"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                suppressNextClickRef.current = true;
                              }}
                            >
                              <button
                                className="floatBtn danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  suppressNextClickRef.current = true;
                                  deleteItem(it.id);
                                }}
                                type="button"
                              >
                                🗑 Löschen
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (it.type === TOOL.COMMENT) {
                      return (
                        <div
                          key={it.id}
                          className={`pdfBox ${isSelected ? "selected" : ""}`}
                          style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: "rgba(255,255,255,0.92)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                            setEditingId(null);
                          }}
                        >
                          <div className="pdfBoxFrame" onPointerDown={(e) => beginDrag(e, it)} />
                          <div className="commentInner">
                            <div className="commentHeader">{it.author}</div>
                            <div className="commentBody">{it.text}</div>
                            <div className="commentTime">{it.timestamp}</div>
                          </div>
                        </div>
                      );
                    }

                    if (it.type === TOOL.REDACT) {
                      return (
                        <div
                          key={it.id}
                          className={`pdfBox ${isSelected ? "selected" : ""}`}
                          style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: "#000" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                            setEditingId(null);
                          }}
                        >
                          <div className="pdfBoxFrame" onPointerDown={(e) => beginDrag(e, it)} />
                        </div>
                      );
                    }

                    if (
                      it.type === TOOL.LINE ||
                      it.type === TOOL.RECTANGLE ||
                      it.type === TOOL.CIRCLE ||
                      it.type === TOOL.FREEHAND ||
                      it.type === TOOL.HIGHLIGHT
                    ) {
                      return (
                        <svg
                          key={it.id}
                          className="drawingItem"
                          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(it.id);
                            setEditingId(null);
                          }}
                        >
                          {it.type === TOOL.LINE && (
                            <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.strokeColor} strokeWidth={it.strokeWidth} />
                          )}
                          {(it.type === TOOL.RECTANGLE || it.type === TOOL.HIGHLIGHT) && (
                            <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fillColor} stroke={it.strokeColor} strokeWidth={it.strokeWidth} />
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
                              points={it.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
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
      </main>

      {/* Mobile Dock */}
      {fileId && (
        <div className="mobileDock mobileOnly">
          <div className="mobileDockInner">
            {Array.from(toolsByCat.entries()).map(([cat, list]) => (
              <div className="dockGroup" key={cat}>
                {list.map((t) => (
                  <ToolButton
                    key={t.id}
                    active={tool === t.id}
                    icon={t.icon}
                    label={t.label}
                    desc={t.desc}
                    onClick={() => setTool(t.id)}
                    compact
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Marker colors */}
      {fileId && tool === TOOL.HIGHLIGHT && (
        <div className="floatingColors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className={`colorDot ${highlightColor === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={(e) => {
                e.stopPropagation();
                setHighlightColor(c);
              }}
              type="button"
              title="Marker-Farbe"
            />
          ))}
          <label className="colorPicker">
            <span>+</span>
            <input
              type="color"
              value={highlightColor}
              onChange={(e) => {
                e.stopPropagation();
                setHighlightColor(e.target.value);
              }}
              title="Eigene Farbe"
            />
          </label>
        </div>
      )}

      {/* Pen colors */}
      {fileId && tool === TOOL.FREEHAND && (
        <div className="floatingColors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className={`colorDot ${penColor === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={(e) => {
                e.stopPropagation();
                setPenColor(c);
              }}
              type="button"
              title="Stift-Farbe"
            />
          ))}
          <label className="colorPicker">
            <span>+</span>
            <input
              type="color"
              value={penColor}
              onChange={(e) => {
                e.stopPropagation();
                setPenColor(e.target.value);
              }}
              title="Eigene Stiftfarbe"
            />
          </label>
        </div>
      )}

      {/* Stamps */}
      {fileId && tool === TOOL.STAMP && (
        <div className="floatingStamps">
          {STAMPS.map((s) => (
            <button
              key={s.id}
              className={`stampPill ${selectedStamp === s.id ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStamp(s.id);
              }}
              type="button"
              title="Stempel"
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
