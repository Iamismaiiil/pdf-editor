from __future__ import annotations

import io
import os
import json
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR.parent / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RENDER_DIR = DATA_DIR / "renders"
EDITS_DIR = DATA_DIR / "edits"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RENDER_DIR.mkdir(parents=True, exist_ok=True)
EDITS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PDF Editor API (Complete)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/files")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Bitte ein PDF hochladen.")

    safe_name = os.path.basename(file.filename or "upload.pdf")
    if not safe_name.lower().endswith(".pdf"):
        safe_name += ".pdf"

    dest = UPLOAD_DIR / safe_name
    if dest.exists():
        base, ext = dest.stem, dest.suffix
        i = 1
        while (UPLOAD_DIR / f"{base}_{i}{ext}").exists():
            i += 1
        dest = UPLOAD_DIR / f"{base}_{i}{ext}"

    content = await file.read()
    dest.write_bytes(content)

    with fitz.open(dest) as doc:
        page_count = doc.page_count

    return {"file_id": dest.name, "page_count": page_count}

@app.get("/files/{file_id}")
def get_file_meta(file_id: str):
    path = UPLOAD_DIR / os.path.basename(file_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    with fitz.open(path) as doc:
        return {"file_id": path.name, "page_count": doc.page_count}

@app.get("/files/{file_id}/page/{page_index}/render")
def render_page(file_id: str, page_index: int, scale: float = 2.0):
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    out_path = RENDER_DIR / f"{pdf_path.stem}_p{page_index}_s{scale}.png"
    if out_path.exists():
        return FileResponse(out_path)

    with fitz.open(pdf_path) as doc:
        if page_index < 0 or page_index >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page index")
        page = doc.load_page(page_index)
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        img.save(out_path, format="PNG")

    return FileResponse(out_path)

def edits_path(file_id: str) -> Path:
    base = Path(os.path.basename(file_id)).stem
    return EDITS_DIR / f"{base}.json"

@app.get("/files/{file_id}/edits")
def load_edits(file_id: str):
    p = edits_path(file_id)
    if not p.exists():
        return JSONResponse({"version": 1, "pages": {}}, status_code=200)
    return JSONResponse(json.loads(p.read_text(encoding="utf-8")), status_code=200)

@app.put("/files/{file_id}/edits")
async def save_edits(file_id: str, payload: dict):
    p = edits_path(file_id)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}

@app.post("/files/{file_id}/page/{page_index}/rotate")
async def rotate_page(file_id: str, page_index: int, angle: int = 90):
    """Rotate a page by angle (90, 180, 270)"""
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    
    with fitz.open(pdf_path) as doc:
        if page_index >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page index")
        page = doc[page_index]
        page.set_rotation(angle)
        doc.save(pdf_path)
    
    # Clear rendered cache
    import glob
    for f in glob.glob(str(RENDER_DIR / f"{Path(pdf_path).stem}_p{page_index}_*")):
        try:
            os.remove(f)
        except:
            pass
    
    return {"ok": True}

@app.post("/files/{file_id}/page/{page_index}/duplicate")
async def duplicate_page(file_id: str, page_index: int):
    """Duplicate a page"""
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    
    with fitz.open(pdf_path) as doc:
        if page_index >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page index")
        
        source_page = doc[page_index]
        # Insert new page at position + 1
        new_page = doc.new_page(page_index + 1)
        # Copy content from source
        new_page.show_pdf_page(new_page.rect, doc, page_index)
        doc.save(pdf_path)
    
    return {"ok": True, "page_count": doc.page_count}

@app.delete("/files/{file_id}/page/{page_index}")
async def delete_page(file_id: str, page_index: int):
    """Delete a page"""
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    
    with fitz.open(pdf_path) as doc:
        if page_index >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page index")
        doc.delete_page(page_index)
        doc.save(pdf_path)
    
    return {"ok": True, "page_count": doc.page_count}

@app.post("/files/{file_id}/pages/reorder")
async def reorder_pages(file_id: str, order: list):
    """Reorder pages. order = [2, 0, 1] means: page at index 2 goes first, etc."""
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    
    with fitz.open(pdf_path) as doc:
        if len(order) != doc.page_count or max(order) >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page order")
        
        # Reorder by moving pages
        new_order = []
        for idx in order:
            new_order.append(doc[idx])
        
        # Rebuild document
        new_doc = fitz.open()
        for page in new_order:
            new_page = new_doc.new_page()
            new_page.show_pdf_page(new_page.rect, doc, page.number)
        
        new_doc.save(pdf_path)
    
    return {"ok": True}

@app.get("/files/{file_id}/export")
def export_pdf(file_id: str):
    """Export PDF with all edits applied"""
    pdf_path = UPLOAD_DIR / os.path.basename(file_id)
    
    # Debug: Check if path exists
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found at {pdf_path}")
    
    edits_p = edits_path(file_id)
    
    # If no edits, return original
    if not edits_p.exists():
        return FileResponse(str(pdf_path), filename=f"edited_{pdf_path.name}")
    
    try:
        edits_data = json.loads(edits_p.read_text(encoding="utf-8"))
    except:
        return FileResponse(str(pdf_path), filename=f"edited_{pdf_path.name}")
    
    # Create temporary output file
    out_path = UPLOAD_DIR / f"temp_export_{pdf_path.stem}.pdf"
    
    try:
        with fitz.open(str(pdf_path)) as doc:
            for page_num, page_edits in edits_data.get("pages", {}).items():
                page_index = int(page_num)
                if page_index >= doc.page_count:
                    continue
                
                page = doc[page_index]
                
                for item in page_edits:
                    if item["type"] == "textbox":
                        try:
                            rect = fitz.Rect(item["x"], item["y"], item["x"] + item["w"], item["y"] + item["h"])
                            color = item.get("color", "#111111")
                            rgb = fitz.utils.hex_to_rgb(color) if isinstance(color, str) else (0, 0, 0)
                            font_size = item.get("fontSize", 12)
                            page.insert_textbox(rect, item["text"], fontsize=font_size, color=rgb)
                        except Exception as e:
                            print(f"Error rendering textbox: {e}")
                    
                    elif item["type"] == "cover_text":
                        try:
                            rect = fitz.Rect(item["x"], item["y"], item["x"] + item["w"], item["y"] + item["h"])
                            page.draw_rect(rect, color=None, fill=(1, 1, 1))
                        except Exception as e:
                            print(f"Error rendering cover_text: {e}")
                    
                    elif item["type"] == "line":
                        try:
                            p1 = fitz.Point(item["x1"], item["y1"])
                            p2 = fitz.Point(item["x2"], item["y2"])
                            color = item.get("strokeColor", "#0066ff")
                            rgb = fitz.utils.hex_to_rgb(color) if isinstance(color, str) else (0, 0.4, 1)
                            width = item.get("strokeWidth", 2)
                            page.draw_line(p1, p2, color=rgb, width=width)
                        except Exception as e:
                            print(f"Error rendering line: {e}")
                    
                    elif item["type"] == "rectangle":
                        try:
                            rect = fitz.Rect(item["x"], item["y"], item["x"] + item["w"], item["y"] + item["h"])
                            stroke_color = item.get("strokeColor", "#0066ff")
                            rgb_stroke = fitz.utils.hex_to_rgb(stroke_color) if isinstance(stroke_color, str) else (0, 0.4, 1)
                            width = item.get("strokeWidth", 2)
                            page.draw_rect(rect, color=rgb_stroke, fill=None, width=width)
                        except Exception as e:
                            print(f"Error rendering rectangle: {e}")
                    
                    elif item["type"] == "circle":
                        try:
                            radius = item.get("radius", 50)
                            center_x = item["x"] + radius
                            center_y = item["y"] + radius
                            center = fitz.Point(center_x, center_y)
                            stroke_color = item.get("strokeColor", "#0066ff")
                            rgb_stroke = fitz.utils.hex_to_rgb(stroke_color) if isinstance(stroke_color, str) else (0, 0.4, 1)
                            width = item.get("strokeWidth", 2)
                            page.draw_circle(center, radius, color=rgb_stroke, fill=None, width=width)
                        except Exception as e:
                            print(f"Error rendering circle: {e}")
                    
                    elif item["type"] == "freehand":
                        try:
                            # Render freehand drawing from points
                            if "points" in item:
                                color = item.get("strokeColor", "#0066ff")
                                rgb = fitz.utils.hex_to_rgb(color) if isinstance(color, str) else (0, 0.4, 1)
                                width = item.get("strokeWidth", 2)
                                
                                points = [fitz.Point(p[0], p[1]) for p in item["points"]]
                                for i in range(len(points) - 1):
                                    page.draw_line(points[i], points[i+1], color=rgb, width=width)
                        except Exception as e:
                            print(f"Error rendering freehand: {e}")
                    
                    elif item["type"] == "highlight":
                        try:
                            # Render highlight with transparency
                            rect = fitz.Rect(item["x"], item["y"], item["x"] + item["w"], item["y"] + item["h"])
                            color = item.get("color", "#ffff00")
                            rgb = fitz.utils.hex_to_rgb(color) if isinstance(color, str) else (1, 1, 0)
                            page.draw_rect(rect, color=rgb, fill=rgb, width=0)
                        except Exception as e:
                            print(f"Error rendering highlight: {e}")
            
            doc.save(str(out_path))
        
        return FileResponse(str(out_path), filename=f"edited_{pdf_path.name}", media_type="application/pdf")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
