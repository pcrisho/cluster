---
title: Registro de actividad e instancia
description: Consulta la bitácora de auditoría de la organización y gestiona la instancia completa como superadministrador.
section: administration
order: 4
---

## Actividad de la organización

Abre **Configuración → Actividad** para consultar la bitácora de cambios administrativos de tu organización, incluyendo:

- Cambios en la configuración, activación de módulos y actualizaciones de tema.
- Invitaciones de miembros, importaciones masivas, ediciones de perfil y restablecimientos de 2FA.
- Cambios en áreas, puestos y permisos.

Usa **Cargar más** para revisar registros anteriores.

## Configuración de la instancia (superadministrador)

Los superadministradores tienen acceso a **Configuración → Instancia** para administrar todo el despliegue:

![Configuración de instancia del superadministrador con registro público, idioma predeterminado y apariencia](/screenshots/admin-instance-es-light.png "Configuración → Instancia")

- **Módulos disponibles**: elige qué módulos (**KNOW**, **GROW**, **CONNECT**, **LIFE**) pueden activar las organizaciones de esta instancia.
- **Registro público**: activa o desactiva el registro abierto. Para instancias privadas de empresa, mantenlo desactivado.
- **Apariencia y temas por organización**: define los colores, fuente y esquinas predeterminados de la instancia, y decide si las organizaciones pueden personalizar su propio tema.
- **Organizaciones**: crea nuevas organizaciones (con un administrador inicial), consulta el número de miembros, configura temas por organización o aislamiento de nodos, y suspende o reactiva organizaciones con **Suspender** o **Reactivar**.

:::warning
Las cuentas de superadministrador están protegidas frente a ediciones desde la organización y deben iniciar sesión siempre con verificación en dos pasos (2FA).
:::
