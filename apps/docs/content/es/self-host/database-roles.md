---
title: Roles de base de datos
description: Cómo separa Cluster al dueño de la base, el rol de solicitudes y el rol de sistema en PostgreSQL.
section: self-host
order: 4
---

Cluster utiliza tres roles en PostgreSQL para que la API en ejecución nunca tenga privilegios de dueño del esquema.

## Los tres roles

| Rol | Propósito | Privilegios |
|---|---|---|
| **Dueño de la base (`POSTGRES_USER`)** | Ejecuta migraciones y respaldos. | Dueño del esquema; lo usan solo el servicio `migrate` y los scripts de respaldo, nunca `api`. |
| **Rol de aplicación** | Atiende todas las solicitudes autenticadas de usuarios. | Sujeto a Row-Level Security (políticas `tenant`); no puede omitir RLS. |
| **Rol de sistema** | Atiende autenticación, tareas internas y consultas de superadministrador. | Solo manipulación de datos (sin DDL, no es dueño de nada); autorizado a leer entre organizaciones cuando corresponde. |

## Cómo se crean los roles

- El servicio `migrate` ejecuta `db:roles` automáticamente en `docker compose up -d`. Crea o actualiza los roles de aplicación y sistema con `CLUSTER_APP_PASSWORD` y `CLUSTER_SYSTEM_PASSWORD`.
- `DATABASE_URL` apunta al rol de aplicación, `DATABASE_SYSTEM_URL` al rol de sistema y `DATABASE_OWNER_URL` a `POSTGRES_USER`.

:::note
Si usas un servicio administrado de PostgreSQL con privilegios restringidos, ejecuta `db:roles` una vez con la cuenta de administrador de tu proveedor antes del primer `docker compose up -d`. Tanto `CLUSTER_APP_PASSWORD` como `CLUSTER_SYSTEM_PASSWORD` deben estar definidos en `.env` o Docker Compose no arrancará.
:::
