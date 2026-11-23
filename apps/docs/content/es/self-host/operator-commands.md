---
title: Comandos de operador
description: Scripts de mantenimiento dentro del contenedor API para restablecer 2FA, generar enlaces de acceso y limpiar archivos o tablas.
section: self-host
order: 8
---

Los comandos de operador se ejecutan dentro del contenedor `api` usando el rol de sistema. No requieren `pnpm` ni el código fuente dentro del contenedor.

## Comandos disponibles

| Tarea | Comando |
|---|---|
| Restablecer el 2FA de un usuario (incluido el superadministrador) | `docker compose exec api node dist/scripts/reset-mfa.js <correo>` |
| Emitir un enlace de invitación o restablecimiento de un solo uso | `docker compose exec api node dist/scripts/access-link.js <correo> [--hours N]` |
| Listar imágenes huérfanas de páginas y espacios | `docker compose exec api node dist/scripts/sweep-page-images.js` |
| Borrar imágenes huérfanas de páginas y espacios | `docker compose exec api node dist/scripts/sweep-page-images.js --apply` |
| Listar archivos o videos huérfanos de lecciones de GROW | `docker compose exec api node dist/scripts/sweep-lesson-files.js` |
| Borrar archivos o videos huérfanos de lecciones de GROW | `docker compose exec api node dist/scripts/sweep-lesson-files.js --apply` |
| Listar filas vencidas de las tablas de autenticación | `docker compose exec api node dist/scripts/sweep-auth.js` |
| Borrar filas vencidas de las tablas de autenticación | `docker compose exec api node dist/scripts/sweep-auth.js --apply` |

## Comportamiento y banderas

- **`reset-mfa`**: elimina el 2FA y los códigos de recuperación, cierra las sesiones activas de la cuenta y registra un evento de autenticación. La persona deberá volver a activar el 2FA al iniciar sesión.
- **`access-link`**: imprime un enlace de un solo uso para invitación (7 días por defecto; `--hours` `24`, `72`, `168`, `336` o `720`) o restablecimiento de contraseña (24 h por defecto; `1`, `24` o `72`). Entrégalo únicamente a esa persona.
- **Comandos de limpieza (`sweep`)**: sin `--apply`, se ejecutan en modo de prueba y solo muestran conteos o claves. Siempre omiten elementos creados hace menos de una hora.

:::warning
Pasar `--apply` elimina de forma permanente los archivos sin referencia o las filas vencidas. Ejecuta primero sin `--apply` y nunca ejecutes limpiezas de almacenamiento con `--apply` contra una base restaurada desde un respaldo anterior al estado actual del bucket.
:::

## Limpieza programada

```cron
0 3 * * 0  cd <carpeta-cluster> && docker compose exec -T api node dist/scripts/sweep-lesson-files.js --apply >> /var/log/cluster-sweep.log 2>&1
30 3 * * * cd <carpeta-cluster> && docker compose exec -T api node dist/scripts/sweep-auth.js --apply >> /var/log/cluster-sweep.log 2>&1
```
