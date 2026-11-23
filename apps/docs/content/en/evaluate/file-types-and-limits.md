---
title: File types and limits
description: Supported upload formats, content verification, inline preview rules, and size limits across Cluster.
section: evaluate
order: 3
---

Cluster validates every uploaded file by both its declared MIME type and its binary signature (magic bytes) before storing it.

## Size limits by kind

| Kind | Where used | Max size |
|---|---|---|
| **Images** | Inline in KNOW pages and space descriptions | 20 MB |
| **Documents** | Attached files in KNOW and lesson files in GROW | 50 MB |
| **Videos** | Uploaded video lessons in GROW | 1 GB |
| **Spreadsheets** | Bulk member import in Organization settings | 5 MB (10 MB uncompressed, 2 000 rows) |

## Supported formats

### Images

- **Shown inline and in the in-app viewer**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`), GIF (`.gif`), BMP (`.bmp`), AVIF (`.avif`).
- **Download only**: HEIC/HEIF (`.heic`, `.heif`) and SVG (`.svg`). SVG files are never rendered inline to prevent embedded scripts from executing.

### Documents

All image types above are also accepted as attachments, along with:

- **Previewed in the in-app viewer**: PDF (`.pdf`).
- **Download only**: Word (`.doc`, `.docx`), Excel (`.xls`, `.xlsx`), PowerPoint (`.ppt`, `.pptx`), Power BI (`.pbix`, `.pbit`), CSV (`.csv`), plain text (`.txt`), and ZIP archives (`.zip`).

### Videos (GROW)

- **MP4** (`.mp4`) and **WebM** (`.webm`). Videos are streamed directly to the browser using HTTP byte ranges with no server-side transcoding.

### Spreadsheets (Bulk import)

- **Excel Workbook** (`.xlsx`) only. Legacy `.xls` files are not accepted for bulk import.
