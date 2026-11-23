---
title: Funciones por módulo
description: Resumen de las capacidades construidas hoy en KNOW, GROW, CONNECT y la plataforma base.
section: evaluate
order: 1
---

Esta página resume lo que está construido y verificado en Cluster hoy.

## Plataforma base

- **Autenticación y sesiones**: inicio de sesión con correo y contraseña, sesiones en PostgreSQL detrás de cookies `httpOnly`, lista de sesiones activas por usuario con revocación, políticas de contraseña y bloqueo progresivo ante intentos fallidos.
- **Verificación en dos pasos (2FA)**: aplicaciones TOTP con códigos de recuperación de un solo uso. Obligatoria para el superadministrador y configurable por organización para administradores.
- **Estructura organizacional**: árbol jerárquico de áreas (`OrgNode`) con responsables designados, puestos, asignaciones de miembros e importación masiva desde hojas de cálculo `.xlsx`.
- **Marca e idiomas**: temas de instancia y organización (colores, tipografía, radio y logotipo) con verificación de contraste, además de inglés y español en toda la interfaz, correos, PDF y CSV.
- **Registro de actividad**: bitácora de auditoría con cambios de configuración, miembros, roles y tema.

## KNOW (base de conocimiento)

- **Espacios y control de acceso**: organiza páginas en espacios con listas de acceso (`viewer`, `editor`, `manager`) asignadas a personas, áreas o puestos.
- **Editor colaborativo**: editor de texto enriquecido en tiempo real con comandos `/`, tablas, avisos, imágenes y archivos adjuntos.
- **Historial de versiones**: guarda instantáneas con nombre o automáticas, compara cambios y restaura versiones anteriores incluso mientras otras personas editan.
- **Markdown**: importa archivos `.md` a un espacio y exporta cualquier página a Markdown.
- **Archivos y vistas previas**: visor integrado para imágenes comunes y PDF, más descarga de adjuntos.
- **Búsqueda**: búsqueda de texto completo en los espacios y páginas accesibles.

## GROW (gestión del aprendizaje)

- **Creación de cursos**: construye cursos con secciones y lecciones de texto enriquecido, enlace de video, archivo descargable y video MP4/WebM subido.
- **Cuestionarios y revisiones**: cuestionarios de opción múltiple con nota mínima de aprobación, límite de intentos y revisión manual opcional.
- **Asignaciones obligatorias**: asigna cursos a personas, áreas o puestos con fecha límite opcional.
- **Experiencia de aprendizaje**: Mi aprendizaje, catálogo, bloqueo secuencial de pasos y reconciliación automática del progreso al editar el esquema del curso.
- **Certificados y verificación**: certificados PDF generados con código y enlace público de verificación.
- **Reportes de cumplimiento**: tarjetas de resumen, tablas filtrables por estado y fecha límite, alcance para responsables de área y exportación CSV.

## CONNECT (directorio y publicaciones)

- **Directorio**: directorio de miembros con vistas en tabla y tarjetas, filtros por área y puesto, y estado persistido en la URL.
- **Organigrama**: árbol interactivo con líneas de reporte, responsables y conteo por subárbol.
- **Publicaciones y celebraciones**: muro de publicaciones de la empresa y celebraciones de hitos.
