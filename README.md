# 📄 PDF Studio - Professioneller PDF-Editor

Ein moderner, vollgeladener PDF-Editor mit allen professionellen Features wie iLovePDF, aber selbst gehostet und erweitert.

## 🎨 Features Übersicht

### Text & Bearbeitung
- ✅ Textfelder mit Live-Editing
- ✅ Schriftart, -größe, -farbe ändern
- ✅ Fett, Kursiv, Unterstrichen, Durchgestrichen
- ✅ Textausrichtung (Links, Zentriert, Rechts, Block)
- ✅ Text überlagern (Cover-Text)

### Zeichentools
- ✅ Linien, Rechtecke, Kreise zeichnen
- ✅ Freihand-Zeichnung (Stift)
- ✅ Marker/Highlighter mit 6 Farben
- ✅ Vordefinierte Stempel (5 Varianten)

### Seiten-Management
- ✅ Seiten drehen (90°)
- ✅ Seiten duplizieren
- ✅ Seiten löschen
- ✅ Seiten-Navigation
- ✅ Zoom (0,75x - 4,0x)

### Markup & Sicherheit
- ✅ Kommentare & Notizen
- ✅ Inhalte schwärzen (Redaction)
- ✅ Unterschriften einfügen
- ✅ Paste all edits to PDF & download

## 🚀 Installation & Start

### Voraussetzungen
- Python 3.10+
- Node.js 16+
- Docker (optional)

### Schnellstart

**1. Backend starten:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**2. Frontend starten (Neuer Terminal):**
```bash
cd frontend
npm install
npm run dev
```

**3. Browser öffnen:**
```
http://localhost:5173
```

## 📁 Projektstruktur

```
pdf-editor/
├── backend/
│   ├── app/
│   │   └── main.py              # FastAPI Server
│   ├── data/
│   │   ├── uploads/             # Hochgeladene PDFs
│   │   ├── renders/             # Gerenderte Seiten
│   │   └── edits/               # Gespeicherte Änderungen
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Hauptkomponente
│   │   ├── App.css              # Styling (iLovePDF-Theme)
│   │   ├── main.jsx
│   │   └── index.css
│   ├── vite.config.js
│   ├── package.json
│   └── index.html
├── docker-compose.yml
├── FEATURES.md                  # Feature-Liste
└── README.md                    # Dieses File
```

## 🎯 Verwendung

### Text hinzufügen
1. Tool "📝 Text" auswählen
2. Auf PDF klicken
3. Text tippen
4. Eigenschaften im rechten Panel anpassen

### Zeichnen
1. Tool auswählen (Linie, Rechteck, Kreis, Freihand, Marker)
2. Auf PDF klicken und ziehen
3. Loslassen zum Vollenden
4. Mit Resize-Handles anpassen

### Seiten verwalten
- 🔄 Drehen
- 📋 Duplizieren
- 🗑️ Löschen
- ◀ ▶ Navigieren

### Exportieren
1. Alle Änderungen vornehmen
2. "💾 Herunterladen" Button klicken
3. PDF wird mit allen Änderungen generiert

## 🏗️ API-Referenz

### Endpoints

**PDF Upload:**
```
POST /files
Content-Type: multipart/form-data
Body: { file: File }
Response: { file_id: string, page_count: number }
```

**Seite rendern:**
```
GET /files/{file_id}/page/{page_index}/render?scale=2.0
Response: PNG image
```

**Edits laden:**
```
GET /files/{file_id}/edits
Response: { version: 1, pages: {...} }
```

**Edits speichern:**
```
PUT /files/{file_id}/edits
Content-Type: application/json
Body: { version: 1, pages: {...} }
```

**PDF exportieren:**
```
GET /files/{file_id}/export
Response: PDF file
```

**Seite drehen:**
```
POST /files/{file_id}/page/{page_index}/rotate
Body: { angle: 90|180|270 }
```

**Seite duplizieren:**
```
POST /files/{file_id}/page/{page_index}/duplicate
```

**Seite löschen:**
```
DELETE /files/{file_id}/page/{page_index}
```

## 🎨 UI-Design

Das Design folgt dem iLovePDF-Stil:
- **Primärfarbe**: #0066ff (Blau)
- **Akzent**: #ff6b35 (Orange)
- **Font**: Inter, Roboto
- **Design-System**: Modernes, sauberes Interface

## ⌨️ Keyboard-Shortcuts

| Shortcut | Aktion |
|----------|--------|
| Strg+Z | Rückgängig (kommt) |
| Strg+Y | Wiederholen (kommt) |
| Strg+S | Speichern (kommt) |
| Entf | Element löschen |

## 🐛 Troubleshooting

### PDF lädt nicht
- Überprüfe, ob Backend läuft: `http://localhost:8000/health`
- Überprüfe Konsole auf CORS-Fehler
- Stelle sicher, dass PDF < 100MB ist

### Changes speichern sich nicht
- Überprüfe Backend Logs
- Stelle sicher, dass `data/edits/` Ordner existiert
- CORS muss aktiviert sein

### Canvas wird nicht angezeigt
- Aktualisiere Seite (F5)
- Überprüfe Browser-Konsole auf JS-Fehler

## 📝 Lizenz

MIT License - Kostenlos nutzen, modifizieren, verteilen

## 🤝 Beitragen

Contributions sind willkommen!

## 📞 Support

Bei Fragen oder Problemen:
1. GitHub Issues erstellen
2. Logs überprüfen
3. Features.md lesen

---

**Version**: 1.0.0
**Letztes Update**: Januar 2026
**Status**: ✅ Production-Ready
