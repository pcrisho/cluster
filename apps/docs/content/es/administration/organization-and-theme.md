---
title: Organización y tema
description: Configura el nombre, logotipo, idioma, zona horaria, módulos, política de 2FA y apariencia de tu organización.
section: administration
order: 1
---

Los administradores gestionan la configuración general desde **Configuración → Organización** y **Configuración → Apariencia**.

![Configuración de la organización con logotipo, nombre, idioma predeterminado y zona horaria](/screenshots/admin-organization-es-light.png "Configuración → Organización")

## Configuración general

En **Configuración → Organización**:

- **Nombre**: actualiza el nombre visible y el identificador de la organización. Los certificados ya emitidos conservan el nombre con el que se emitieron.
- **Logo**: sube un logotipo con recorte cuadrado que se muestra en la barra lateral.
- **Idioma y Zona horaria**: define el idioma predeterminado (**English** o **Español**) y la zona horaria de la organización. Cada miembro los hereda salvo que elija otros en **Mi cuenta**.
- **Módulos**: activa o desactiva **KNOW**, **GROW**, **CONNECT** o **LIFE** (dentro de los módulos disponibles en la instancia). Al desactivar un módulo, desaparece de la navegación y su API queda bloqueada, conservando el contenido.

## Políticas de seguridad y datos personales

- **Exigir la verificación en dos pasos a los administradores**: si está activa, los administradores que aún no tengan 2FA deberán configurarlo la próxima vez que inicien sesión.
- **Los miembros pueden editar sus datos personales**: controla si cada persona puede editar su nombre, foto, teléfono y biografía. Si lo desactivas, solo los administradores los cambian; el idioma y la privacidad siguen en manos de cada persona.

:::note
Los cambios en **Módulos**, **Seguridad**, **Datos personales** y **Celebraciones** se aplican al momento o mediante la barra de cambios sin guardar; usa **Descartar cambios** para revertir ediciones no guardadas.
:::

## Apariencia y marca

Si el superadministrador habilitó los temas por organización en la instancia, **Configuración → Apariencia** permite personalizar:

- **Colores de marca**: elige un predefinido (**Índigo**, **Azul**, **Verde azulado**, **Verde**, **Ámbar**, **Rosa**, **Pizarra**) o define colores primario y secundario propios. Cluster verifica el contraste automáticamente.
- **Fuente y esquinas**: elige la tipografía y el radio de las esquinas.

Todo lo que dejes sin definir sigue el tema de la instancia. Los certificados emitidos en GROW también toman el color de acento efectivo de tu organización.
