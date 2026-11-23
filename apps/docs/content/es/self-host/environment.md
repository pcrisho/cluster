---
title: Variables de entorno
description: Referencia de las variables de entorno en .env.example para configurar una instancia autoalojada de Cluster.
section: self-host
order: 6
---

Cluster lee su configuración de ejecución y compilación desde `.env` en la raíz del repositorio (basado en `.env.example`).

## Base de datos y roles

| Variable | Propósito |
|---|---|
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Conexión a PostgreSQL y credenciales del dueño del esquema. |
| `CLUSTER_APP_PASSWORD`, `CLUSTER_SYSTEM_PASSWORD` | Contraseñas de los roles de aplicación y sistema creados por `migrate`. |
| `DATABASE_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_OWNER_URL` | Cadenas de conexión para el cliente de solicitudes, cliente de sistema y migraciones. |

## Secretos y autenticación

| Variable | Propósito |
|---|---|
| `JWT_SECRET` | Firma los tokens de acceso; en producción debe ser aleatorio y de al menos 32 caracteres (`openssl rand -hex 32`). |
| `JWT_SECRET_PREVIOUS` | Secreto anterior opcional para rotar claves sin cerrar sesiones. |
| `AUTH_SECRET_KEY` | Cifra los secretos de 2FA (debe ser distinto de `JWT_SECRET`). |
| `AUTH_EVENTS_RETENTION_DAYS` | Días de retención de `auth_events` limpiados por `sweep-auth` (por defecto `365`). |
| `COLLAB_INTERNAL_SECRET` | Secreto compartido entre `api` y `collab` (`openssl rand -hex 32`). |

## URLs públicas y proxy

| Variable | Propósito |
|---|---|
| `WEB_URL` | URL pública de la web usada en enlaces de correo y cookies `Secure`. |
| `WS_CORS_ORIGIN` | Origen permitido en el navegador para CORS y WebSockets de la API. |
| `COLLAB_ALLOWED_ORIGINS` | Orígenes separados por comas autorizados para conectar a `collab`. |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_COLLAB_URL` | URLs públicas compiladas en la imagen `web` (`https://` y `wss://` en producción). |
| `TRUST_PROXY` | Número de proxies inversos delante de `api` (usa `1` detrás de Caddy o nginx). |

## Almacenamiento, subidas y Redis

| Variable | Propósito |
|---|---|
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL` | Conexión a Redis para contadores de límite de tasa. |
| `STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_MASTER_PORT`, `STORAGE_USE_SSL` | Endpoint interno S3 de SeaweedFS usado por `api`. |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | Nombre del bucket y credenciales (en producción se exigen claves no predeterminadas). |
| `UPLOAD_TMP_DIR` | Carpeta temporal para subidas de video en curso (hasta 3 × 1 GB simultáneos). |
| `API_MEMORY_LIMIT` | Límite de memoria del contenedor `api` (por defecto `1g`). |
| `COLLAB_URL`, `COLLAB_API_URL`, `COLLAB_PORT`, `COLLAB_MAX_DOC_BYTES` | URLs internas, puerto y tamaño máximo de documento para `collab`. |

## Correo y superadministrador inicial

| Variable | Propósito |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Configuración SMTP saliente; deja `SMTP_HOST` vacío para desactivar el envío de correos. |
| `MAIL_INVITES_PER_MINUTE` | Ritmo de envío para invitaciones en cola (`0` pausa la cola). |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_ORG_NAME` | Superadministrador y organización iniciales creados en el primer arranque si no existen. |
