---
title: Arquitectura y servicios
description: Cómo se integran la aplicación web, la API, el servidor de colaboración, la base de datos y el almacenamiento de Cluster.
section: overview
order: 2
---

Una instancia de Cluster en ejecución se compone de un conjunto reducido de servicios estándar orquestados con Docker Compose.

## Qué corre en cada servicio

| Servicio | Función |
|---|---|
| **Web (`web`)** | Aplicación Next.js que sirve la interfaz de KNOW, GROW, CONNECT, Cuenta y Configuración. |
| **API (`api`)** | Backend NestJS que gestiona autenticación, estructura organizacional, permisos, cursos, archivos y reportes. |
| **Collab (`collab`)** | Servidor en tiempo real Hocuspocus para edición simultánea en espacios y páginas de KNOW. |
| **PostgreSQL (`postgres`)** | Base de datos principal con organizaciones, usuarios, páginas, cursos y registro de actividad protegidos por Row-Level Security. |
| **SeaweedFS (`seaweedfs`)** | Almacenamiento de objetos compatible con S3 para imágenes, documentos, videos y logotipos. |
| **Correo (`mailpit` en desarrollo / SMTP en producción)** | Envío de invitaciones a miembros, enlaces de contraseña y notificaciones de seguridad. |

## Núcleo frente a módulos de producto

- El **núcleo** incluye autenticación (`auth`), gestión de la organización (`org`), administración de la instancia (`instance`) y almacenamiento (`storage`). El núcleo nunca depende de los módulos de producto.
- Un administrador puede activar o desactivar los **módulos de producto** (`KNOW`, `GROW`, `CONNECT`, `LIFE`) por organización. Al desactivar un módulo, desaparece de la navegación y sus rutas de API quedan bloqueadas para esa organización.

## Aplicaciones estáticas

Junto a la plataforma principal, el monorepo incluye dos sitios estáticos independientes:

- **Sitio público**: página informativa y de demostración.
- **Documentación pública**: este sitio de documentación, exportado como HTML estático con búsqueda en el navegador.
