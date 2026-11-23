---
title: Aislamiento de datos
description: Cómo separa Cluster a cada organización en la base de datos, la API, los archivos y la colaboración en tiempo real.
section: evaluate
order: 2
---

Cluster admite múltiples organizaciones en una misma instancia manteniendo los datos de cada organización estrictamente aislados.

## Row-Level Security (RLS) en la base de datos

Todas las tablas con datos de organización en PostgreSQL aplican una política de Row-Level Security (`tenant`).

- **Rol de solicitudes**: cada solicitud HTTP de una persona autenticada se ejecuta bajo un rol restringido que no puede omitir Row-Level Security. El propio PostgreSQL rechaza lecturas o escrituras que no correspondan a la organización activa.
- **Rol de sistema**: las tareas en segundo plano, los flujos de autenticación y las operaciones del superadministrador usan un rol separado, sin propiedad sobre el esquema, reservado para operaciones del sistema.

## Límites en la API y módulos

- **Alcance por organización**: cada endpoint de organización obtiene el identificador de la sesión autenticada y filtra todas las consultas.
- **Guardias de módulo**: las rutas de un módulo desactivado devuelven error y no pueden consultarse.
- **Verificación de roles y capacidades**: administradores, moderadores, responsables de área y roles por espacio (`viewer`, `editor`, `manager`) se validan en cada lectura y escritura.

## Aislamiento del almacenamiento de archivos

Los archivos subidos se guardan en SeaweedFS bajo claves con alcance de organización y nunca se exponen como URLs públicas de bucket.

- Leer un archivo almacenado requiere una sesión autenticada y acceso verificado a la página de KNOW, al espacio de KNOW o al curso de GROW correspondiente.
- La reproducción de video admite rangos HTTP (`206 Partial Content`) únicamente tras verificar el acceso al curso.

## Aislamiento en colaboración en tiempo real

Las conexiones WebSocket al servicio `collab` se autentican con tokens de corta duración emitidos por la API para un documento y usuario específicos. Revocar el acceso de una persona a un espacio o página desconecta de inmediato su sesión de edición activa.
