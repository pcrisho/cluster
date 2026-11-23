---
title: Páginas y edición en tiempo real
description: Crea, organiza, publica y coedita páginas de KNOW en tiempo real, o importa y exporta en Markdown.
section: know
order: 2
---

## Árbol de páginas y borradores

- Cada espacio tiene un árbol jerárquico de páginas en la barra lateral izquierda. Puedes anidar subpáginas, mover páginas a otro padre y reordenarlas.
- Las páginas nuevas comienzan como **Borrador** (visibles para **Editores** y **Gestores**). Publica la página para que los **Lectores** puedan verla.
- Abre **Detalles** en una página para consultar metadatos, etiquetas y la tabla de contenidos.

![Página de KNOW en el editor con el árbol de páginas del espacio a la izquierda](/screenshots/know-page-editor-es-light.png "KNOW → Página")

## Editor colaborativo en tiempo real

Varias personas pueden editar la misma página (o la descripción de un espacio) al mismo tiempo:

- Los cambios se sincronizan automáticamente por WebSockets mediante el servicio `collab`.
- Incluye formato enriquecido, títulos, listas, tablas, avisos, imágenes y tarjetas de archivo.
- Si el servidor de colaboración no está disponible temporalmente, el editor muestra estado sin conexión y las páginas siguen siendo legibles y editables mediante acciones estándar.

## Importar y exportar Markdown

- **Importar Markdown**: desde un espacio, importa un archivo `.md` para crear una página en borrador (un título `#` de primer nivel se convierte en el título). El HTML sin procesar se omite al importar.
- **Exportar**: exporta cualquier página a un archivo `.md` desde las acciones de la página.
