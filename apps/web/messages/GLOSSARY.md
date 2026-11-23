# Copy glossary

Catalogs: `en.json` (source) and `es.json`. Spanish is neutral Latin American: `tú`, imperative buttons ("Guardar"), sentence case, no regionalisms. Keys are camelCase, grouped by area (`shell`, `auth`, `settings`, `instance`, `know`, `connect`, `grow`, `notifications`, `verify`, `errors`, `ui`, `common`, `metadata`). Placeholders and tags (`{name}`, `<accent>…</accent>`) must stay the same in every language; `lib/i18n/catalog.spec.ts` checks it.

Not translated: the product (Cluster) and module names (CONNECT, KNOW, GROW, LIFE; Connect, Know, Grow, Life), people's content.

| English | Español |
|---------|---------|
| area | área |
| assignment | asignación |
| attempt | intento |
| certificate | certificado |
| course | curso |
| due date | fecha límite |
| draft | borrador |
| feed | publicaciones |
| code (of a node) | código |
| external / internal (kind of a main node) | externo / interno |
| isolation (of main nodes) | aislamiento |
| lesson | lección |
| main node (top-level area) | nodo principal |
| manager (of an area) | responsable |
| moderator (tenant role `MANAGER`) | moderador |
| member | miembro |
| overdue | vencido |
| page | página |
| position | puesto |
| post | publicación |
| quiz | cuestionario |
| recovery code | código de recuperación |
| review (of a quiz) | revisión |
| session (signed-in device) | sesión |
| settings | configuración |
| sign in / sign out | iniciar sesión / cerrar sesión |
| space | espacio |
| step | paso |
| time zone | zona horaria |
| two-step verification (2FA) | verificación en dos pasos |
