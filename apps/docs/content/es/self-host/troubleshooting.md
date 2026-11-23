---
title: Solución de problemas
description: Problemas comunes en una instancia autoalojada de Cluster, qué los causa y cómo resolverlos con Docker Compose.
section: self-host
order: 10
---

Empieza por el estado del conjunto: `docker compose ps` muestra cada servicio y su salud, y `docker compose logs api --tail 100` (u otro nombre de servicio) muestra su registro reciente. Si usas el Caddy incluido, agrega `--profile proxy` a estos comandos.

## Docker Compose se niega a iniciar

Compose se detiene con un mensaje como "set COLLAB_INTERNAL_SECRET in .env" cuando falta un valor obligatorio. Los valores obligatorios son `COLLAB_INTERNAL_SECRET`, `REDIS_PASSWORD`, `CLUSTER_APP_PASSWORD` y `CLUSTER_SYSTEM_PASSWORD`. Defínelos en `.env` (los secretos con `openssl rand -hex 32`) e inicia de nuevo con `docker compose up -d`. Un `.env` antiguo puede no tener `CLUSTER_SYSTEM_PASSWORD`: agrégalo antes de actualizar.

## La API no inicia

- **Falló la tarea `migrate`.** La API inicia solo cuando esa tarea termina bien. Revisa `docker compose logs migrate`. Con un PostgreSQL administrado, la tarea necesita una cuenta de administrador que pueda otorgar el permiso de omitir la seguridad por filas; consulta [Roles de base de datos](/es/self-host/database-roles/).
- **Un rol de la base de datos no es seguro.** Al iniciar, la API revisa sus dos roles de base de datos y se niega a funcionar si alguno tiene más permisos de los debidos. Inicia el conjunto con `docker compose up -d` (la tarea `migrate` recrea los roles) y luego revisa `docker compose logs api`.
- **Después de una restauración.** Los roles de la base de datos no forman parte del respaldo de una sola base. La tarea `migrate` los recrea en el siguiente `docker compose up -d`.

## El chequeo de salud dice "degraded"

`/api/v1/health` responde 200 con `"status":"degraded"` cuando Redis o el almacenamiento no responden, y 503 cuando PostgreSQL está caído. El campo `checks` indica cuál. Revisa `docker compose logs redis` o `docker compose logs storage`, y reinicia el servicio con `docker compose restart storage` (o `redis`) si la causa no es clara. Docker reinicia un contenedor que termina, no uno marcado como no sano, así que es un chequeo externo el que te avisa.

## Las personas pierden la sesión o las imágenes no cargan

La cookie de sesión se envía solo al mismo sitio, y solo por HTTPS cuando `WEB_URL` empieza con `https://`.

- Sirve la aplicación web y la API desde el mismo sitio: un dominio (`app.example.com` con la API bajo `/api`) o subdominios de un mismo dominio (`app.example.com` y `api.example.com`). Dos dominios distintos no funcionan.
- `WEB_URL` debe ser exactamente la dirección que las personas abren en el navegador. Las solicitudes de inicio de sesión y de sesión desde otro origen se rechazan.
- Los valores `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` y `NEXT_PUBLIC_COLLAB_URL` quedan dentro de la imagen web al construirla. Después de cambiar alguno, ejecuta `docker compose build` y `docker compose up -d`.

## La edición en vivo muestra "Sin conexión" o "permission-denied"

- **"Sin conexión"**: el navegador no llega a `collab`. Revisa `docker compose ps` y que tu proxy reenvíe `/collab/` como WebSocket (consulta [HTTPS y proxy inverso](/es/self-host/proxy/)). Revisa también que el origen del navegador esté en `COLLAB_ALLOWED_ORIGINS` y que `NEXT_PUBLIC_COLLAB_URL` use `wss://` detrás de HTTPS. Las páginas se pueden leer y editar aunque no haya edición en vivo.
- **"permission-denied" para todos**: la API y `collab` no comparten el mismo `COLLAB_INTERNAL_SECRET`. Compose pasa un solo valor a ambos. Un valor exportado en tu terminal tiene prioridad sobre `.env`, así que asegúrate de que tu terminal no defina otro distinto y luego ejecuta `docker compose up -d`.

## Todos llegan al límite de solicitudes a la vez

Detrás de un proxy inverso, la API ve la dirección del proxy en cada solicitud si `TRUST_PROXY` no está definido. Defínelo con el número de proxies delante de la API (`1` detrás del Caddy incluido o de un nginx) y reinicia con `docker compose up -d`.

## El correo no llega

- Un `SMTP_HOST` vacío apaga el correo: no se envía nada. Los administradores entregan enlaces de acceso desde **Configuración → Miembros**, o tú imprimes uno con el [comando de operador](/es/self-host/operator-commands/) `access-link`.
- Si no, revisa `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`, publica los registros SPF y DKIM del dominio del remitente y busca errores de correo en `docker compose logs api`.

## Se rechaza la subida de un video

- "Se están subiendo otros archivos": se reciben hasta 3 videos a la vez. Inténtalo de nuevo cuando termine uno.
- "El servidor no tiene espacio para este archivo": la carpeta temporal (`UPLOAD_TMP_DIR`, o la carpeta temporal del sistema si está vacía) quedaría con menos de 512 MB libres. Apunta `UPLOAD_TMP_DIR` a un disco con espacio (en Docker, un volumen montado).
- La subida se corta a mitad con tu propio proxy: la ruta de video necesita un límite de cuerpo de unos 1100 MB, sin búfer de solicitudes y con un tiempo de lectura de una hora. Consulta [HTTPS y proxy inverso](/es/self-host/proxy/).

## Alguien perdió el acceso a la verificación en dos pasos

- Una persona que perdió su dispositivo y sus códigos de recuperación: un administrador restablece su 2FA desde **Configuración → Miembros**.
- El superadministrador, o cualquiera cuando ningún administrador puede ayudar: ejecuta el [comando de operador](/es/self-host/operator-commands/) `reset-mfa`.
- Cambiar `AUTH_SECRET_KEY` hace que dejen de funcionar todas las apps de autenticación registradas. No lo cambies; si ya cambió, restablece el 2FA de las personas afectadas.
