---
title: Requisitos
description: Qué necesita un servidor para ejecutar Cluster con Docker Compose, qué servicios inicia, qué puertos usa y el dimensionamiento medido.
section: self-host
order: 1
---

Cluster se ejecuta como un conjunto de contenedores descritos en `docker-compose.yml`. Esta página reúne lo que necesita el servidor antes de seguir [Primer inicio](/es/self-host/first-start/).

## Servidor

- Un servidor Linux con Docker Engine y Docker Compose v2.
- Una copia del repositorio de Cluster en una etiqueta de versión. `docker compose build` construye las imágenes en el servidor, así que no necesitas Node.js ni pnpm en el equipo: las imágenes traen su propio entorno de ejecución.
- Un dominio o subdominio que apunte al servidor. La aplicación web y la API deben servirse desde el mismo sitio (un dominio, o subdominios de un mismo dominio) con HTTPS; si no, nadie mantiene la sesión. Consulta [HTTPS y proxy inverso](/es/self-host/proxy/).
- Opcional: una cuenta SMTP para invitaciones, enlaces de contraseña y correos de seguridad. Sin ella, Cluster no envía correos y los administradores entregan enlaces de acceso.

## Servicios

Estos son los servicios que inicia `docker compose up -d`. No hace falta nada fuera del servidor: la base de datos, la caché y el almacenamiento de archivos corren dentro del conjunto.

| Servicio | Qué es | Notas |
|---|---|---|
| `postgres` | PostgreSQL 16 | Todos los datos. Volumen `postgres-data`. |
| `redis` | Redis 7.4 | Solo contadores de límite de solicitudes; perderlos no debilita nada. Requiere `REDIS_PASSWORD`. |
| `storage` | SeaweedFS, almacenamiento de objetos compatible con S3 | Archivos e imágenes subidos. Volumen `storage-data`. El navegador nunca accede a él directamente. |
| `migrate` | Tarea única | Crea los roles de la base de datos y aplica las migraciones, y luego termina. Es el único contenedor con las credenciales del dueño de la base. |
| `api` | La API de Cluster | Inicia cuando `migrate` termina bien. |
| `web` | La aplicación web | Inicia cuando `api` está sano. |
| `collab` | Servicio de edición en tiempo real | Requiere `COLLAB_INTERNAL_SECRET`, el mismo valor que usa la API. |
| `caddy` | Proxy TLS opcional | Solo con `--profile proxy`. Obtiene y renueva el certificado. |

## Puertos

| Puerto | Escucha en | Lo usa |
|---|---|---|
| 80, 443 (TCP) y 443 (UDP) | Todas las interfaces | `caddy`, o tu propio proxy inverso |
| 3000 | `127.0.0.1` | `web` (valor por defecto de `WEB_PORT`) |
| 3001 | `127.0.0.1` | `api` (valor por defecto de `API_PORT`) |
| 3002 | `127.0.0.1` | `collab` (valor por defecto de `COLLAB_PORT`) |

PostgreSQL, Redis y el almacenamiento no publican ningún puerto; solo se alcanzan dentro de la red de Compose. En el firewall del servidor abre solo SSH, 80 y 443.

## Límites de memoria y CPU

El archivo de Compose limita `api` a 1 CPU y a `API_MEMORY_LIMIT` (1 GB por defecto; las subidas y la reproducción de videos de lecciones necesitan más de 512 MB), y `web` y `collab` a 1 CPU y 512 MB cada uno. PostgreSQL, Redis y el almacenamiento no tienen límites.

## Dimensionamiento medido

Se hizo una prueba de carga con todo el conjunto fijado a un número de núcleos y de memoria, con usuarios sintéticos en un núcleo rápido de escritorio (4,8 GHz). Cada persona simulada mantenía conexiones en vivo abiertas y hacía una acción cada 15 segundos (uso normal) o cada 5 segundos (uso intensivo): abrir páginas e imágenes, las pantallas de aprendizaje, el directorio y la búsqueda. No incluyó un conjunto grande de datos de GROW (muchos cursos, asignaciones e informes).

| Límites | Uso normal | Uso intensivo |
|---|---|---|
| 1 CPU, 2 GB | unas 150 personas | de 75 a 100 personas |
| 2 CPU, 4 GB | 500 personas, sin llegar al límite | de 150 a 200 personas |

- Una vCPU en la nube puede ser hasta dos veces más lenta que el núcleo de la prueba. Toma estas cifras como punto de partida y mide en tu propio servidor.
- Iniciar sesión es la acción más costosa. En la misma prueba, 100 personas iniciando sesión en el mismo segundo tardaron unos 20 segundos con 2 CPU; 100 personas a lo largo de un minuto no fueron problema.
- La memoria de todo el conjunto llegó a un máximo de entre 570 y 930 MB en todas las ejecuciones.

## Disco

Lo que más crece son los archivos guardados: imágenes de hasta 20 MB, documentos de hasta 50 MB y videos de lecciones de hasta 1 GB cada uno. Las páginas de texto pesan poco. Reserva espacio para:

- Los volúmenes de PostgreSQL y del almacenamiento, y sus respaldos (consulta [Respaldos y restauración](/es/self-host/backups/)).
- Las imágenes de los contenedores y la construcción.
- La carpeta temporal de subidas (`UPLOAD_TMP_DIR`, o la carpeta temporal del sistema si está vacía): pueden subirse hasta 3 videos de 1 GB a la vez, y la API rechaza una subida que dejaría menos de 512 MB libres ahí.
