# Meck-Grade

**Lokales TCG-Karten-Vorgrading-Tool** — Analysiert Pokémon-, MTG-, Yu-Gi-Oh!- und Digimon-Karten per Computer Vision und gibt dir einen vorläufigen PSA/BGS/CGC/TAG-Schätzwert, bevor du sie einschickst.

> Kein Account. Keine Cloud. Alles läuft lokal auf deinem Rechner.

---

## Inhalt

- [Features](#features)
- [Screenshots](#screenshots)
- [Systemvoraussetzungen](#systemvoraussetzungen)
- [Installation](#installation)
  - [Quick Start](#quick-start-alle-plattformen)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Docker](#docker)
- [Verwendung](#verwendung)
- [Wie es funktioniert](#wie-es-funktioniert)
- [Notensystem](#notensystem)
- [API-Referenz](#api-referenz)
- [Konfiguration](#konfiguration)
- [Projektstruktur](#projektstruktur)

---

## Features

### Analyse
| Feature | Details |
|---------|---------|
| **Card-Detection** | Automatische Kartenerkennung per Kontur-Analyse; Fallback auf Vollbild |
| **Zentrierung** | L/R- und T/B-Verhältnis in Pixel + Prozent, Vorder- und Rückseite |
| **Ecken** | 4 Ecken einzeln bewertet: Whitening-Ratio, Schärfe, Winkelabweichung |
| **Kanten** | 4 Kanten: Chip-Count, Fraying-Intensität, Ink-Wear |
| **Oberfläche** | CLAHE+Sobel (Kratzer), Laplacian (Dellen), FFT (Druckfehler), LBP (Holo-Schaden), SSIM |
| **Konfidenz-Band** | Zeigt Notenspanne (z. B. PSA 7–8, 72%) + limitierenden Faktor |

### Noten-Output
- **PSA** 1–10 mit Label (Gem Mint, Mint, NM-MT …)
- **BGS** 1–10 mit 4 Teilnoten + Black-Label-Erkennung
- **CGC** 1–10 mit Label
- **TAG** 1–10 (Precision-Score)

### Karten-Identifikation
- Automatische Namenserkennung per OCR (Tesseract)
- **Pokémon TCG API** (pokemontcg.io)
- **MTG / Scryfall API**
- **Yu-Gi-Oh! / YGOPRODeck API**
- **Digimon / digimoncard.io API**
- Manuelle Korrektur des erkannten Namens direkt im UI
- **PSA Population-Report** Link für jedes Spiel

### ROI-Rechner
Berechnet für PSA / BGS / CGC (Economy bis Super Express), ob sich das Einschicken bei dem erwarteten Gradingwert lohnt — auf Basis des aktuellen NM-Marktpreises.

### Sammlung / Library
- Vollständige Grading-Historie in SQLite
- Suche, Sortierung, PSA-Filter
- Bild-Vergleichsslider (annotiert vs. sauber)
- Notizen & Tags pro Karte
- **Bulk-Export** als CSV oder JSON

### Bildvorverarbeitung
Canvas-Modal vor dem Upload: Rotation (90°-Schritte + Fein-Slider ±45°), Helligkeit und Kontrast.

### Export
- Annotierte Scan-Bilder (JPEG)
- PDF-Grading-Report (benötigt `reportlab`)

---

## Screenshots

> *Folgen nach erstem öffentlichen Release.*

---

## Systemvoraussetzungen

| | Minimum |
|--|---------|
| **Python** | 3.9+ |
| **RAM** | 512 MB |
| **Speicher** | 500 MB (inkl. OpenCV) |
| **OS** | Windows 10+, macOS 11+, Linux |
| **Desktop-App** | WebView2 (Win10 1803+ vorinstalliert), WKWebView (macOS, systemseitig) |

> Die macOS- und Windows-Desktop-Apps öffnen **kein Browser-Fenster** — sie starten als eigenständige App mit Dock- bzw. Taskleisten-Eintrag.

**OCR** (optional, für Karten-Namenserkennung):
- [Tesseract OCR](https://tesseract-ocr.github.io/tessdoc/Installation.html) muss separat installiert sein und im `PATH` liegen.

---

## Installation

### Quick Start im Browser (Dev / Docker)

```bash
git clone https://github.com/meckman-bot/meck-grade.git
cd meck-grade
python run.py
```

`run.py` startet den Server und öffnet `http://localhost:8374` im Browser — geeignet für Entwicklung und Docker.

---

### Desktop-App lokal testen (ohne Build)

```bash
pip install -r requirements-desktop.txt
python desktop.py
```

Öffnet ein natives Fenster (kein Browser) — ideal zum Testen vor dem PyInstaller-Build.

---

### Desktop-App selbst bauen (für Entwickler)

```bash
# macOS
bash build-macos.sh     # → dist/Meck-Grade.app

# Windows
build-windows.bat       # → dist\Meck-Grade\Meck-Grade.exe
```

---

### macOS

```bash
git clone https://github.com/meckman-bot/meck-grade.git
cd meck-grade
bash install-macos.sh
```

Das Skript:
- prüft Python 3.9+ (installiert via Homebrew wenn nötig)
- installiert Tesseract OCR via Homebrew (optional)
- erstellt ein `.venv` mit allen Abhängigkeiten (inkl. pywebview + PyInstaller)
- baut **`Meck-Grade.app`** via PyInstaller (eigenständige Desktop-App)
- kopiert die App nach `/Applications/`
- erstellt einen Alias auf dem Desktop

Danach per Doppelklick starten — **kein Browser öffnet sich**, es erscheint ein natives App-Fenster im Dock.

> Beim ersten Start: Rechtsklick → Öffnen (macOS Gatekeeper, nur einmalig).

---

### Windows

```bat
git clone https://github.com/meckman-bot/meck-grade.git
cd meck-grade
install-windows.bat
```

Das Skript:
- erstellt ein `.venv` mit allen Abhängigkeiten (inkl. pywebview + PyInstaller)
- baut **`Meck-Grade.exe`** via PyInstaller (eigenständige Desktop-App, kein CMD-Fenster)
- erstellt eine Desktop-Verknüpfung auf `dist\Meck-Grade\Meck-Grade.exe`

Für OCR: [Tesseract für Windows](https://github.com/UB-Mannheim/tesseract/wiki) installieren und zum `PATH` hinzufügen.

Danach Desktop-Verknüpfung doppelklicken — **kein Browser öffnet sich**, die App erscheint direkt in der Taskleiste.

> WebView2 ist seit Windows 10 (Version 1803) vorinstalliert. Falls nicht vorhanden, zeigt pywebview beim ersten Start einen Download-Link.

---

### Docker

```bash
git clone https://github.com/meckman-bot/meck-grade.git
cd meck-grade
docker compose up --build -d
```

Öffne `http://localhost:8374`.

Die Volumes `./data` und `./uploads` werden automatisch angelegt und bleiben bei Neustarts erhalten.

Port anpassen:
```bash
MECKGRADE_PORT=9000 docker compose up -d
```

---

## Verwendung

### 1. Scan hochladen

- **Vorderseite** (Pflicht) + **Rückseite** (optional) per Drag & Drop oder Datei-Picker
- Empfohlene Scan-Auflösung: **300–600 DPI**
- Unterstützte Formate: JPEG, PNG, TIFF
- Optional: Bild im **Vorverarbeitungs-Modal** drehen, Helligkeit/Kontrast anpassen

### 2. Analyse starten

Klick auf **„Analysieren"** — der Fortschritt wird in Echtzeit per SSE gestreamt.

### 3. Ergebnis lesen

- **Notenbalken**: PSA / BGS / CGC / TAG mit Count-Up-Animation
- **Konfidenz-Band**: Bereich + Wahrscheinlichkeit + limitierender Faktor
- **Subscores**: Zentrierung, Ecken, Kanten, Oberfläche (0–100)
- **BGS Teilnoten**: alle 4 Kategorien + Composite
- **Karten-Info**: automatisch erkannter Name, Set, Preis, Links
- **ROI-Rechner**: lohnt sich das Einschicken? (aufklappbar)
- **Warnungen**: konkrete Hinweise auf gefundene Mängel
- **Accordion**: Detailtabellen für jede Analysekategorie

### 4. Sammlung verwalten

Über **„Sammlung"** (`/library.html`) lassen sich alle analysierten Karten durchsuchen, filtern, mit Notizen versehen und als CSV/JSON exportieren.

---

## Wie es funktioniert

```
Scan (JPEG/PNG/TIFF)
        │
        ▼
  Preprocessor                 OpenCV: Kontur-Erkennung, Perspektiv-Korrektur
        │
        ├─► Centering Analyzer  Rand-Pixel messen, L/R- und T/B-Ratio berechnen
        ├─► Corner Analyzer     4 Ecken: Whitening, Schärfe (Variance of Laplacian), Winkel
        ├─► Edge Analyzer       4 Kanten: Chip-Count (Closing+Contours), Fraying, Ink-Wear
        └─► Surface Analyzer    CLAHE+Sobel / Laplacian / FFT / LBP / SSIM
                │
                ▼
          Scorer               Gewichteter Composite-Score (Zentr. 25%, Ecken 30%, Kanten 25%, Oberfläche 20%)
                │
                ├─► PSA-Mapper   Schwellenwerte + Zentrierungsregel
                ├─► BGS-Mapper   4 Teilnoten + Composite
                ├─► CGC-Mapper
                └─► TAG-Mapper   Kontinuierlicher Wert
                        │
                        ▼
                  Confidence     Bandbreite + limitierender Faktor
                        │
                        ▼
                  Annotator      Bounding Boxes, Score-Labels auf Karten-Scan
```

**Karten-Identifikation** läuft nicht-blockierend nach der Analyse:

```
OCR (Tesseract) → Name
        │
        ├─► Pokémon TCG API   (pokemontcg.io)
        ├─► Scryfall API      (api.scryfall.com)
        ├─► YGOPRODeck API    (db.ygoprodeck.com)
        └─► Digimon API       (digimoncard.io)
                │
                ▼
        Preis-Schätzung (NM-Preis × Multiplikator je Grade)
        ROI-Berechnung  (Graded-Wert − NM − Einschick-Kosten)
```

---

## Notensystem

### PSA-Schwellenwerte (Composite-Score)

| PSA-Note | Label | Composite |
|----------|-------|-----------|
| 10 | Gem Mint | ≥ 95 |
| 9 | Mint | ≥ 85 |
| 8 | NM-MT | ≥ 75 |
| 7 | NM | ≥ 65 |
| 6 | EX-MT | ≥ 55 |
| 5 | EX | ≥ 45 |
| 4 | VG-EX | ≥ 35 |
| 3 | VG | ≥ 25 |
| 2 | Good | ≥ 15 |
| 1 | Poor | < 15 |

### Composite-Gewichtung

| Kategorie | Gewicht |
|-----------|---------|
| Ecken | 30 % |
| Zentrierung | 25 % |
| Kanten | 25 % |
| Oberfläche | 20 % |

> **Hinweis:** Meck-Grade ist ein *Vorgrading*-Tool. Die tatsächliche Note eines echten Grading-Unternehmens kann abweichen. Computer Vision erkennt keine feinen Druckfehler, Creases auf Hochglanzoberflächen oder Gerüche.

---

## API-Referenz

Alle Endpunkte unter `/api/`. Swagger-UI: `http://localhost:8374/api/docs`

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/health` | Statuscheck |
| `POST` | `/api/upload` | Scans hochladen (multipart) |
| `GET` | `/api/analyze/stream/{id}` | Analyse per SSE (Echtzeit-Fortschritt) |
| `POST` | `/api/analyze` | Analyse synchron (Fallback) |
| `GET` | `/api/result/{id}` | Gecachtes Ergebnis abrufen |
| `GET` | `/api/lookup/{id}` | Karten-Identifikation + Preise (`?name=` Override) |
| `GET` | `/api/roi/{id}` | Submission-ROI-Berechnung |
| `GET` | `/api/history` | Historie auflisten (Filter-/Sortier-Params) |
| `GET` | `/api/history/export` | Bulk-Export (`?format=csv\|json`) |
| `GET` | `/api/history/{id}` | Einzeleintrag abrufen |
| `DELETE` | `/api/history/{id}` | Eintrag löschen |
| `PATCH` | `/api/history/{id}` | Notizen aktualisieren |
| `PATCH` | `/api/history/{id}/tags` | Tags aktualisieren |
| `GET` | `/api/export/{id}/pdf` | PDF-Report |

---

## Konfiguration

Alle Konstanten in [`backend/config.py`](backend/config.py):

```python
WORKING_DPI      = 600    # Interne Analyse-Auflösung
MIN_DPI_WARNING  = 300    # Warnung unterhalb dieser DPI

WEIGHT_CENTERING = 0.25   # Composite-Gewichtung
WEIGHT_CORNERS   = 0.30
WEIGHT_EDGES     = 0.25
WEIGHT_SURFACE   = 0.20

MAX_UPLOAD_MB    = 80     # Max. Dateigröße pro Scan
```

Server-Port und Host über `.env` (Vorlage: [`.env.example`](.env.example)):

```env
MECKGRADE_HOST=127.0.0.1
MECKGRADE_PORT=8374
```

---

## Projektstruktur

```
meck-grade/
├── backend/
│   ├── analysis/           # Computer-Vision-Pipeline
│   │   ├── preprocessor.py # Kartenerkennung + Perspektiv-Korrektur
│   │   ├── centering.py    # Zentrierungsmessung
│   │   ├── corners.py      # Eckenanalyse
│   │   ├── edges.py        # Kantenanalyse
│   │   ├── surface.py      # Oberflächenanalyse
│   │   ├── annotator.py    # Annotierte Ausgabebilder
│   │   └── pipeline.py     # Orchestrierung + SSE-Stream
│   ├── api/                # FastAPI-Routen
│   │   ├── upload.py
│   │   ├── analyze.py
│   │   ├── history.py
│   │   ├── lookup.py
│   │   ├── roi.py
│   │   └── export.py
│   ├── card_lookup/        # Externe Karten-APIs
│   │   ├── pokemon_api.py
│   │   ├── scryfall_api.py
│   │   ├── yugioh_api.py
│   │   └── digimon_api.py
│   ├── grading/            # Note-Mapper
│   │   ├── scorer.py
│   │   ├── psa.py
│   │   ├── bgs.py
│   │   ├── cgc.py
│   │   ├── tag.py
│   │   └── confidence.py
│   ├── db/
│   │   └── history.py      # SQLite-Datenbank
│   ├── models/
│   │   └── response.py     # Pydantic-Modelle
│   └── config.py
├── frontend/
│   ├── index.html          # Analyse-Hauptseite
│   ├── library.html        # Kartensammlung
│   ├── js/
│   │   ├── app.js          # Haupt-Controller
│   │   ├── grades.js       # Note + Konfidenz + Card-Info + ROI
│   │   ├── uploader.js     # Upload-Zonen
│   │   ├── preprocessor.js # Bildvorverarbeitungs-Modal
│   │   ├── viewer.js       # Scan-Anzeige
│   │   ├── library.js      # Sammlungsseite
│   │   └── api.js          # API-Wrapper
│   └── css/
│       ├── main.css
│       ├── components.css
│       ├── library.css
│       └── preprocessor.css
├── Dockerfile
├── docker-compose.yml
├── install-macos.sh
├── install-windows.bat
├── run.py                  # Cross-Platform Launcher
├── run.sh                  # Linux/macOS Shell-Launcher
├── run.bat                 # Windows Batch-Launcher
└── requirements.txt
```

---

## Abhängigkeiten

```
fastapi          uvicorn          opencv-python
Pillow           numpy            scikit-image
scipy            pydantic         requests
reportlab        (optional: pytesseract + Tesseract binary)
```

---

*Meck-Grade ist ein privates Hilfswerkzeug und steht in keiner Verbindung zu PSA, Beckett, CGC oder TAG.*
