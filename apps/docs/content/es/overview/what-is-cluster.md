---
title: Qué es Cluster
description: Cluster es una plataforma de código abierto para el conocimiento y la capacitación de tu empresa en tu propio servidor.
section: overview
order: 1
---

Cluster es una plataforma de código abierto para la base de conocimiento y la capacitación del equipo, diseñada para ejecutarse en tu propia infraestructura con control total sobre tus datos, marca e idiomas.

## Cuatro módulos

Cluster se organiza en cuatro módulos sobre un núcleo compartido (identidad, estructura organizacional, permisos y almacenamiento de archivos).

| Módulo | Propósito | Estado |
|---|---|---|
| **KNOW** | Espacios, páginas colaborativas, historial de versiones, importación/exportación en Markdown, archivos y búsqueda. | Construido |
| **GROW** | Cursos, lecciones (texto, video, archivos), cuestionarios, asignaciones obligatorias, certificados y reportes de cumplimiento. | Construido |
| **CONNECT** | Directorio de la empresa, organigrama, publicaciones y celebraciones. | Construido |
| **LIFE** | Bienestar del equipo y flujos cotidianos. | En preparación |

:::note
LIFE se encuentra en preparación y todavía no tiene guía de uso. Cada instancia puede activar solo los módulos que necesite; por ejemplo, únicamente KNOW y GROW.
:::

## Código abierto y autoalojamiento

Cluster está pensado para autoalojarse con Docker Compose. Cada función documentada en estas guías forma parte del código abierto y está verificada de extremo a extremo.

- **Sin telemetría externa**: tu instancia no envía datos de uso a terceros.
- **Tu propio dominio y correo**: conecta tu proxy inverso para HTTPS y tu servidor SMTP para invitaciones, restablecimientos de contraseña y alertas de seguridad.

## Idiomas y marca

- **Bilingüe de fábrica**: todas las etiquetas de la interfaz, correos, certificados en PDF y exportaciones CSV están disponibles en **inglés** y **español** (latinoamericano neutro). Cada persona puede elegir su idioma o heredar el predeterminado de la organización o de la instancia.
- **Temas personalizados**: define colores primario y secundario, tipografía y radio de bordes a nivel de instancia, o permite que cada organización aplique su propio logotipo y tema.

## Siguientes pasos

- Revisa [Funciones por módulo](/es/evaluate/features-by-module/) para evaluar lo que está disponible hoy.
- Revisa los [Requisitos](/es/self-host/requirements/) y sigue [Primer inicio](/es/self-host/first-start/) para desplegar una instancia en tu servidor.
