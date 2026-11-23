---
title: Monitoreo
description: Chequeos de salud, rotación de registros y alertas de espacio en disco para una instancia autoalojada de Cluster.
section: self-host
order: 9
---

## Chequeo externo de salud

Configura un monitor externo (desde otro servidor o servicio) para consultar `https://<tu-dominio>/api/v1/health` cada 1 a 5 minutos:

- **`200` con `"status":"ok"`**: base de datos, Redis y almacenamiento responden.
- **`200` con `"status":"degraded"`**: Redis o almacenamiento no respondieron; configura el monitor para alertar si el cuerpo contiene la palabra `degraded`.
- **`503`**: PostgreSQL no responde.

Agrega una segunda verificación sobre la raíz web (`https://<tu-dominio>/`).

:::note
Docker Compose con `restart: unless-stopped` reinicia contenedores que terminan con error, no contenedores marcados como `unhealthy`. Las alertas externas garantizan detectar dependencias degradadas a tiempo.
:::

## Registros de contenedores

Cada servicio rota sus registros localmente con un límite de 10 MB × 5 archivos. Consulta los registros recientes con:

```sh
docker compose logs --tail 100 api
docker compose ps
```

## Alertas de espacio en disco

Las subidas simultáneas de video usan `UPLOAD_TMP_DIR` (hasta 3 × 1 GB), y `api` rechaza nuevas subidas con `507` si quedan menos de 512 MB libres. Programa `scripts/ops/check-disk.sh` con cron para alertar cuando `/`, `/var/lib/docker` o `UPLOAD_TMP_DIR` superen el 80 %:

```cron
*/15 * * * *  <carpeta-cluster>/scripts/ops/check-disk.sh || echo "uso de disco alto en $(hostname)"
```
