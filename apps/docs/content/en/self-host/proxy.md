---
title: HTTPS and reverse proxy
description: How to expose Cluster behind the bundled Caddy proxy or your own nginx reverse proxy with WebSockets and video uploads.
section: self-host
order: 7
---

In production, only ports 80 and 443 should be public. The `web` (3000), `api` (3001), and `collab` (3002) containers bind to `127.0.0.1` only.

## Option A: Bundled Caddy

Docker Compose includes a `caddy` service under the `proxy` profile. It obtains and renews TLS certificates automatically and serves `web`, `api`, and `collab` from a single domain so `SameSite=Strict` session cookies work.

Set your domain and public URLs in `.env`:

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

Then build and start with the `proxy` profile:

```sh
docker compose build && docker compose --profile proxy up -d
```

:::note
Always pass `--profile proxy` to subsequent `up`, `ps`, or `logs` commands when using the bundled Caddy service.
:::

## Option B: Your own proxy (nginx)

If you use an existing reverse proxy, configure it to match these rules:

- Serve `web` and `api` on the same registrable domain over `https://`, set `TRUST_PROXY=1`, and forward `X-Forwarded-For` and `X-Forwarded-Proto`.
- Block internal routes (`/api/v1/internal/*`, `/collab/control/*`, `/collab/health`, `/control/*`) with `404`.
- Proxy `/api/*` and `/socket.io/*` (with WebSocket upgrade) to `127.0.0.1:3001`, `/collab/*` (stripping `/collab`, with WebSocket upgrade and at least `120s` read timeout) to `127.0.0.1:3002`, and everything else to `127.0.0.1:3000`.
- Allow unbuffered `1100m` uploads with a `3600s` read timeout only on `PUT /api/v1/grow/steps/<id>/video`; keep standard `60m` limits and at least a `120s` read timeout elsewhere.
- Do not inject an extra `Content-Security-Policy` header; Cluster sends its own nonce-based CSP.
