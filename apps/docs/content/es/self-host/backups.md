---
title: Respaldos y restauración
description: Respaldos automáticos de PostgreSQL y SeaweedFS con restic, y cómo hacer un simulacro de restauración.
section: self-host
order: 5
---

Cluster incluye scripts en `scripts/backup/` para respaldar tanto la base de datos PostgreSQL como el bucket de SeaweedFS hacia un repositorio cifrado de `restic` fuera del servidor.

## Qué se respalda

1. **Base de datos PostgreSQL**: volcada con `pg_dump -Fc` como `POSTGRES_USER` desde el contenedor `postgres`.
2. **Bucket de almacenamiento**: sincronizado con `rclone` desde un contenedor que comparte la red de `storage`.
3. **Archivo cifrado fuera del servidor**: ambos se suben juntos con `restic backup`, conservando 7 copias diarias, 4 semanales y 6 mensuales.

:::warning
Nunca vuelques la base con el rol de aplicación ni con `--enable-row-security`: obtendrías un volcado vacío de todas las tablas de organizaciones. Guarda también una copia de tu `.env` en un gestor de contraseñas fuera del servidor; sin `AUTH_SECRET_KEY`, las personas no pueden recuperar su 2FA.
:::

## Preparación inicial

1. Instala `docker`, `flock`, `curl` y `restic` en el servidor.
2. Inicializa un repositorio `restic` fuera del servidor (`restic init`) y guarda su contraseña también fuera del servidor.
3. Crea `/etc/cluster-backup.env` (permisos `600`) con el destino (**RESTIC_REPOSITORY**), el archivo de contraseña (**RESTIC_PASSWORD_FILE**), el directorio de trabajo (**BACKUP_DIR**, por defecto `/var/backups/cluster`), `STORAGE_BUCKET` igual que en `.env` y opcionalmente **BACKUP_PING_URL** para alertas externas.

## Programación

Ejecuta el respaldo a diario y verifica la antigüedad del último respaldo cada hora con cron:

```cron
0 3 * * *  cd <carpeta-cluster> && set -a && . /etc/cluster-backup.env && set +a && scripts/backup/backup.sh >> /var/log/cluster-backup.log 2>&1
17 * * * * cd <carpeta-cluster> && set -a && . /etc/cluster-backup.env && set +a && scripts/backup/check-backup-age.sh || echo "respaldo atrasado en $(hostname)"
```

Una vez al mes, verifica la integridad del repositorio con `restic check --read-data-subset=5%`.

## Simulacro de restauración

Haz un simulacro completo en otra máquina limpia antes de invitar usuarios:

:::steps
1. Prepara una máquina limpia con Docker, `restic`, la misma etiqueta de versión, tu `.env` y `/etc/cluster-backup.env`.
2. Inicia solo los servicios de base de datos y almacenamiento: `docker compose build migrate && docker compose up -d --wait postgres storage`.
3. Ejecuta `scripts/backup/restore.sh` (o `restore.sh <id-snapshot>`). Restaura la base como `POSTGRES_USER`, recrea los roles, ejecuta `migrate` y copia el bucket de vuelta.
4. Ejecuta `docker compose up -d`. Espera a que `docker compose ps` muestre todos los servicios `healthy`.
5. Inicia sesión, abre una página de KNOW con imagen, reproduce y adelanta un video de GROW y verifica un certificado en `/verify/<código>`.
:::
