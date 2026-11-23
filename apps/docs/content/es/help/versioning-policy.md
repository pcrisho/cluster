---
title: Política de versionado
description: Cómo versiona Cluster sus lanzamientos usando Versionado Semántico durante la etapa previa a 1.0.
section: help
order: 3
---

Cluster sigue **Versionado Semántico** (`MAYOR.MENOR.PARCHE`).

## Estado previo a 1.0

Cluster se encuentra actualmente antes de `1.0` (`0.x.y`) y aún no ha iniciado despliegues generales en producción. Durante la etapa `0.x`:

- Las versiones menores (`0.x.0`) pueden incluir cambios incompatibles en configuración, esquema de base de datos o API al simplificar o endurecer la plataforma.
- Cada etiqueta de lanzamiento se documenta en el [Registro de cambios](/es/changelog/0-1-0/) con notas de actualización y pasos de migración necesarios.
- Una vez publicada la `1.0.0`, los cambios incompatibles se reservarán para versiones mayores (`X.0.0`).
