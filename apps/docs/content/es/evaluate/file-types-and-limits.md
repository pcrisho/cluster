---
title: Tipos de archivo y límites
description: Formatos aceptados, verificación de contenido, reglas de vista previa y límites de tamaño en Cluster.
section: evaluate
order: 3
---

Cluster valida cada archivo subido tanto por su tipo MIME declarado como por su firma binaria (magic bytes) antes de almacenarlo.

## Límites de tamaño por tipo

| Tipo | Dónde se usa | Tamaño máximo |
|---|---|---|
| **Imágenes** | En línea en páginas de KNOW y descripciones de espacios | 20 MB |
| **Documentos** | Archivos adjuntos en KNOW y archivos de lecciones en GROW | 50 MB |
| **Videos** | Lecciones de video subidas en GROW | 1 GB |
| **Hojas de cálculo** | Importación masiva de miembros en Configuración de la organización | 5 MB (10 MB sin comprimir, 2 000 filas) |

## Formatos compatibles

### Imágenes

- **En línea y en el visor integrado**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`), GIF (`.gif`), BMP (`.bmp`), AVIF (`.avif`).
- **Solo descarga**: HEIC/HEIF (`.heic`, `.heif`) y SVG (`.svg`). Los archivos SVG nunca se muestran en línea para evitar la ejecución de scripts incrustados.

### Documentos

Todos los tipos de imagen anteriores también se aceptan como adjuntos, junto con:

- **Vista previa integrada**: PDF (`.pdf`).
- **Solo descarga**: Word (`.doc`, `.docx`), Excel (`.xls`, `.xlsx`), PowerPoint (`.ppt`, `.pptx`), Power BI (`.pbix`, `.pbit`), CSV (`.csv`), texto plano (`.txt`) y archivos ZIP (`.zip`).

### Videos (GROW)

- **MP4** (`.mp4`) y **WebM** (`.webm`). Los videos se transmiten directamente al navegador mediante rangos HTTP sin transcodificación en el servidor.

### Hojas de cálculo (importación masiva)

- Únicamente **Excel Workbook** (`.xlsx`). Los archivos `.xls` heredados no se aceptan para importación masiva.
