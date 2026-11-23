---
title: Miembros, importación y permisos
description: Invita miembros, importa personas de forma masiva desde Excel, restablece el 2FA y asigna permisos de módulos.
section: administration
order: 2
---

Gestiona a las personas desde **Configuración → Miembros**.

![Lista de miembros con búsqueda, filtros por estado, roles y acciones de invitación](/screenshots/admin-members-es-light.png "Configuración → Miembros")

## Invitar y editar miembros

- **Invitar miembro**: envía una invitación por correo (si SMTP está configurado) o genera un enlace de acceso único o contraseña inicial para entregarlo directamente.
- **Editar datos**: actualiza nombre, correo, código de empleado, teléfono y fechas. Cambiar el correo cierra sus sesiones activas y avisa a la dirección anterior.
- **Restablecer 2FA**: si un administrador o miembro pierde su aplicación de autenticación y sus códigos de recuperación, un administrador puede restablecer su 2FA desde las acciones del miembro. Esto borra su contraseña y envía un enlace de 24 horas para definir una nueva.

## Importación masiva desde una hoja de cálculo

Abre **Configuración → Miembros → Importar miembros** para crear o actualizar muchas personas a la vez:

:::steps
1. Haz clic en **Descargar plantilla** para obtener el libro `.xlsx` con las columnas esperadas.
2. Completa las personas, sus áreas, puestos, responsables y permisos (hasta 5 MB y 2 000 filas).
3. Suelta o elige el archivo `.xlsx` para previsualizar cada fila y revisar errores de validación. No se guarda nada durante la vista previa.
4. Haz clic en **Aplicar** para guardar todos los cambios en una sola transacción.
:::

## Permisos para toda la organización

Aunque los administradores pueden hacer todo, puedes otorgar permisos específicos a miembros desde la acción **Permisos** de cada persona:

| Permiso | Qué permite |
|---|---|
| **Crear espacios** | Puede crear espacios nuevos en KNOW y queda como su responsable. |
| **Eliminar espacios** | Puede eliminar los espacios de KNOW que gestiona, con todas sus páginas y archivos. |
| **Gestionar cursos** | Puede crear, editar, asignar, publicar y archivar cualquier curso en GROW. |

:::tip
El acceso a cada espacio de KNOW es independiente de los permisos globales: se configura con el botón **Compartir** dentro de cada espacio.
:::
