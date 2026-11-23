---
title: Preguntas frecuentes
description: Respuestas a preguntas comunes sobre autoalojamiento, módulos, idiomas y aislamiento de datos en Cluster.
section: help
order: 1
---

## ¿Podemos activar solo KNOW y GROW?

Sí. El superadministrador define qué módulos están disponibles en la instancia, y los administradores de cada organización pueden activar o desactivar **KNOW**, **GROW**, **CONNECT** y **LIFE** de forma independiente.

## ¿Cuál es el estado de LIFE?

**LIFE** está actualmente en preparación y todavía no cuenta con guía de uso.

## ¿Admite Cluster múltiples organizaciones en un mismo servidor?

Sí. Los datos de cada organización están aislados en la base de datos mediante Row-Level Security en PostgreSQL, en la API mediante el alcance de sesión y en el almacenamiento mediante rutas con verificación de acceso.

## ¿Podemos ejecutar Cluster sin servidor SMTP?

Sí. Si `SMTP_HOST` queda vacío, Cluster omite el envío de correos. Los administradores pueden generar enlaces de acceso únicos o contraseñas iniciales desde **Configuración → Miembros** (o con el comando `access-link`).

## ¿Cómo cambiamos entre inglés y español?

Cada persona puede elegir su idioma en **Configuración → Mi cuenta** o desde el menú de usuario. Si no se define, hereda el idioma de la organización y luego el predeterminado de la instancia.
