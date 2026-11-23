---
title: HTTPS y proxy inverso
description: Cómo exponer Cluster detrás del proxy Caddy incluido o de tu propio nginx con WebSockets y subidas de video.
section: self-host
order: 7
---

En producción, solo los puertos 80 y 443 deben ser públicos. Los contenedores `web` (3000), `api` (3001) y `collab` (3002) escuchan únicamente en `127.0.0.1`.

## Opción A: Caddy incluido

Docker Compose incluye un servicio `caddy` bajo el perfil `proxy`. Obtiene y renueva certificados TLS automáticamente y sirve `web`, `api` y `collab` desde un mismo dominio para que funcionen las cookies de sesión `SameSite=Strict`.

Define tu dominio y URLs públicas en `.env`:

```sh
CLUSTER_DOMAIN=app.example.com
WEB_URL=https://app.example.com
WS_CORS_ORIGIN=https://app.example.com
COLLAB_ALLOWED_ORIGINS=https://app.example.com
NEXT_PUBLIC_API_URL=https://app.example.com/api/v1
NEXT_PUBLIC_WS_URL=https://app.example.com
NEXT_PUBLIC_COLLAB_URL=wss://app.example.com/collab
TRUST_PROXY=1
```

Luego construye e inicia con el perfil `proxy`:

```sh
docker compose build && docker compose --profile proxy up -d
```

:::note
Pasa siempre `--profile proxy` en los comandos posteriores de `up`, `ps` o `logs` cuando uses el servicio Caddy incluido.
:::

## Opción B: Tu propio proxy (nginx)

Si utilizas un proxy inverso existente, configúralo siguiendo estas reglas:

- Sirve `web` y `api` en el mismo dominio registrable sobre `https://`, define `TRUST_PROXY=1` y reenvía `X-Forwarded-For` y `X-Forwarded-Proto`.
- Bloquea con `404` las rutas internas (`/api/v1/internal/*`, `/collab/control/*`, `/collab/health`, `/control/*`).
- Envía `/api/*` y `/socket.io/*` (con upgrade de WebSocket) a `127.0.0.1:3001`, `/collab/*` (quitando el prefijo `/collab`, con WebSocket y timeout de lectura de al menos `120s`) a `127.0.0.1:3002` y el resto a `127.0.0.1:3000`.
- Permite subidas sin búfer de `1100m` con timeout de `3600s` únicamente en `PUT /api/v1/grow/steps/<id>/video`; mantén `60m` y al menos `120s` de timeout en las demás rutas.
- No agregues una cabecera `Content-Security-Policy` adicional; Cluster envía su propia política con nonce.
