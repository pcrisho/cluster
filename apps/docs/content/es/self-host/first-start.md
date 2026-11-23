---
title: Primer inicio
description: Lista de verificación para completar en tu servidor antes de invitar personas a una instancia autoalojada de Cluster.
section: self-host
order: 2
---

Esta lista reúne todo lo que debes verificar en tu servidor antes de invitar a tu primera organización o usuarios.

Primero revisa que el servidor cumpla los [Requisitos](/es/self-host/requirements/). Si algo falla en el camino, consulta [Solución de problemas](/es/self-host/troubleshooting/).

## Lista de verificación inicial

:::steps
1. **Completa tu archivo `.env`**: genera secretos hexadecimales únicos de 32 bytes (`openssl rand -hex 32`) para `JWT_SECRET`, `AUTH_SECRET_KEY` (distinto de `JWT_SECRET`), `COLLAB_INTERNAL_SECRET`, `CLUSTER_APP_PASSWORD`, `CLUSTER_SYSTEM_PASSWORD` y `POSTGRES_PASSWORD`.
2. **Define las URL públicas y el proxy**: configura `WEB_URL`, `WS_CORS_ORIGIN`, `COLLAB_ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_COLLAB_URL` y `TRUST_PROXY` (`1` detrás de un proxy inverso). Web y API deben compartir el mismo sitio bajo HTTPS para que las cookies de sesión funcionen.
3. **Configura el superadministrador**: define `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` y `SUPERADMIN_ORG_NAME` antes del primer arranque. La API crea al superadministrador al iniciar si aún no existe.
4. **Cierra el firewall**: permite solo SSH, puerto 80 y puerto 443. Los puertos 3000, 3001 y 3002 escuchan únicamente en `127.0.0.1`.
5. **Levanta los servicios**: ejecuta `docker compose build` y `docker compose up -d` (agrega `--profile proxy` si usas el proxy Caddy incluido).
6. **Verifica salud y rutas internas**: confirma que `https://<tu-dominio>/api/v1/health` responda `{"status":"ok",...}` y que `/api/v1/internal/collab/x` y `/collab/health` respondan `404` desde fuera.
7. **Ajusta la configuración de la instancia**: inicia sesión como superadministrador, abre **Configuración → Instancia**, cierra el registro público si es privada y activa solo los módulos necesarios (por ejemplo, KNOW y GROW).
8. **Activa el 2FA del superadministrador**: abre **Mi cuenta**, escanea el código QR con una app de autenticación y guarda los códigos de recuperación fuera del servidor.
9. **Prueba el correo (si aplica)**: configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`, publica SPF y DKIM, e invita a una cuenta de prueba.
10. **Configura respaldos y monitoreo**: deja activos los respaldos automáticos y un chequeo externo antes de invitar a nadie.
:::

:::warning
Nunca invites usuarios en producción antes de completar un respaldo y un simulacro de restauración en otra máquina.
:::
