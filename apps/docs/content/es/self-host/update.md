---
title: Actualizar Cluster
description: Cómo respaldar, cambiar a una nueva versión, migrar la base de datos y revertir si algo falla.
section: self-host
order: 3
---

Realiza siempre un respaldo manual de la base de datos antes de actualizar a una nueva etiqueta de versión.

## Pasos para actualizar

:::steps
1. **Toma un respaldo manual** como dueño de la base (nunca con `--enable-row-security`):

   ```sh
   docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > cluster-$(date +%F-%H%M).dump
   ```

   Guarda el archivo `.dump` fuera del servidor.
2. **Anota la etiqueta actual** por si necesitas revertir: `git describe --tags`.
3. **Descarga y cambia a la nueva versión**: `git fetch --tags && git checkout <nueva-etiqueta>`.
4. **Reconstruye las imágenes**: ejecuta `docker compose build`. Si cambió alguna variable `NEXT_PUBLIC_*`, la imagen web debe reconstruirse.
5. **Aplica migraciones y reinicia**: ejecuta `docker compose up -d`. El servicio `migrate` corre una vez, actualiza los roles, aplica las migraciones de Prisma y termina antes de que arranque `api`. Si falla, revisa `docker compose logs migrate`.
6. **Verifica el estado**: confirma que `https://<tu-dominio>/api/v1/health` responda `ok`, que todos los servicios en `docker compose ps` estén `healthy` y revisa `docker compose logs api --tail 100`.
7. **Haz una prueba de humo** con una cuenta real: inicia sesión (con 2FA si corresponde), abre una página de KNOW con imagen, reproduce y adelanta un video de GROW y verifica un certificado en `/verify/<código>`.
:::

## Cómo revertir

1. Revisa si corrió alguna migración: `docker compose logs migrate | grep -i migration`.
2. **Si no hubo migración**: vuelve a la etiqueta anterior, ejecuta `docker compose build`, y luego `docker compose up -d`.
3. **Si hubo migración**: el código anterior puede no coincidir con el esquema nuevo. Restaura el respaldo del paso 1:

   ```sh
   git checkout <etiqueta-anterior>
   docker compose stop api
   docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < cluster-<fecha>.dump
   docker compose build && docker compose up -d
   ```

:::warning
Se pierde todo lo escrito entre el respaldo y la restauración. Nunca ejecutes comandos de limpieza de almacenamiento con `--apply` contra una base restaurada desde un respaldo anterior al estado actual del bucket.
:::
