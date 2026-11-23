import type { Messages } from "./en";

/** Neutral Latin American Spanish (tú); same keys and placeholders as en.ts. */
export const es: Messages = {
  email: {
    invite: {
      subject: "Te invitaron a {organization} en Cluster",
      text: "Hola, {name}:\n\nTe invitaron a {organization} en Cluster. Define tu contraseña para empezar (el enlace vale 7 días):\n\n{link}\n",
      html: '<p>Hola, {name}:</p><p>Te invitaron a <strong>{organization}</strong> en Cluster.</p><p><a href="{link}">Define tu contraseña</a> para empezar. El enlace vale 7 días.</p>',
    },
    reset: {
      subject: "Restablece tu contraseña de Cluster",
      text: "Hola, {name}:\n\nUsa este enlace para definir una nueva contraseña (vale 1 hora):\n\n{link}\n\nSi no la pediste, ignora este correo.\n",
      html: '<p>Hola, {name}:</p><p><a href="{link}">Define una nueva contraseña</a>. El enlace vale 1 hora.</p><p>Si no la pediste, ignora este correo.</p>',
    },
    mfaReset: {
      subject: "Un administrador restableció tu acceso a Cluster",
      text: "Hola, {name}:\n\nUn administrador de tu organización restableció tu verificación en dos pasos y tu contraseña, y cerró todas tus sesiones. Define una nueva contraseña con este enlace (vale 24 horas):\n\n{link}\n\nLuego podrás configurar de nuevo la verificación en dos pasos. Si no lo esperabas, contacta a tu administrador.\n",
      html: '<p>Hola, {name}:</p><p>Un administrador de tu organización restableció tu verificación en dos pasos y tu contraseña, y cerró todas tus sesiones.</p><p><a href="{link}">Define una nueva contraseña</a>. El enlace vale 24 horas. Luego podrás configurar de nuevo la verificación en dos pasos.</p><p>Si no lo esperabas, contacta a tu administrador.</p>',
    },
  },
  security: {
    text: "Hola, {name}:\n\n{what}\n\nCuándo: {when}\nDesde la dirección: {ip}\n\nSi no fuiste tú, avísale cuanto antes a quien administra tu organización.\n",
    html: "<p>Hola, {name}:</p><p>{what}</p><p>Cuándo: {when}<br>Desde la dirección: {ip}</p><p>Si no fuiste tú, avísale cuanto antes a quien administra tu organización.</p>",
    unknownAddress: "desconocida",
    passwordChanged: {
      subject: "Tu contraseña de Cluster se cambió",
      what: "Se cambió la contraseña de tu cuenta de Cluster.",
    },
    passwordReset: {
      subject: "Tu contraseña de Cluster se restableció",
      what: "La contraseña de tu cuenta de Cluster se restableció con un enlace enviado a este correo.",
    },
    emailChanged: {
      subject: "Se cambió el correo de tu cuenta de Cluster",
      what: "Un administrador de tu organización cambió el correo con el que inicias sesión en Cluster y cerró todas tus sesiones. Si no lo esperabas, contacta a tu administrador.",
    },
    accessLinkCreated: {
      subject: "Un administrador creó un enlace para restablecer tu contraseña de Cluster",
      what: "Un administrador de tu organización creó un enlace para restablecer la contraseña de tu cuenta de Cluster. Si no lo esperabas, contacta a tu administrador.",
    },
    mfaEnabled: {
      subject: "Activaste la verificación en dos pasos en Cluster",
      what: "La verificación en dos pasos ya está activa en tu cuenta de Cluster; al iniciar sesión se te pedirá un código de tu app.",
    },
    mfaDisabled: {
      subject: "Desactivaste la verificación en dos pasos en Cluster",
      what: "Se desactivó la verificación en dos pasos de tu cuenta de Cluster; al iniciar sesión ya no se te pedirá un código.",
    },
    mfaChanged: {
      subject:
        "Pasaste la verificación en dos pasos a un nuevo dispositivo en Cluster",
      what: "La verificación en dos pasos de tu cuenta de Cluster ahora usa un nuevo dispositivo; el anterior y tus códigos de recuperación anteriores ya no sirven, y se cerraron tus otras sesiones.",
    },
    recoveryCodeUsed: {
      subject: "Se usó un código de recuperación de tu cuenta de Cluster",
      what: "Se usó uno de tus códigos de recuperación para confirmar un inicio de sesión o un cambio en tu cuenta de Cluster. Cada código sirve una sola vez.",
    },
  },
  /** El archivo de credenciales de un administrador (docs/specs/auth/access-without-mail). */
  exportAccess: {
    sheet: "Acceso",
    notice:
      "Este archivo contiene credenciales de acceso de las personas listadas. Entrega a cada una su fila y luego borra el archivo. Cada enlace o contraseña funciona hasta que venza su plazo.",
    headers: {
      firstName: "Nombre",
      lastName: "Apellidos",
      email: "Correo",
      path: "Área",
      employeeCode: "Código de empleado",
      credential: "Enlace de acceso o contraseña inicial",
      expiresAt: "Vence el",
    },
  },
  /** La hoja de instrucciones de la plantilla de importación masiva (docs/specs/org/bulk-import). Los encabezados siguen en inglés. */
  importTemplate: {
    sheet: "Personas",
    instructionsSheet: "Instrucciones",
    columnHeader: "Columna",
    ruleHeader: "Qué va en ella",
    columns: {
      node_1: "Nodo principal (cliente o empresa). Obligatorio mientras la organización aísla sus nodos principales.",
      areas: "Un área debajo del nivel anterior, un nivel por columna. La persona va al último nivel lleno. No dejes huecos.",
      node_1_code: "Código del nodo principal. Si lo pones, el nodo se busca por su código y nunca se renombra.",
      first_name: "Obligatorio para personas nuevas. Vacío conserva el nombre actual.",
      last_name: "Obligatorio para personas nuevas. Vacío conserva los apellidos actuales.",
      email: "Obligatorio. Identifica a la persona: una dirección nueva crea un miembro y un miembro existente se actualiza.",
      employee_code: "Código de empleado, único en la organización.",
      position: "Nombre de un puesto existente. Los puestos no se crean desde el archivo.",
      is_node_manager: "sí hace a la persona responsable de su área, no lo quita, vacío lo conserva.",
      entry_date: "Fecha de ingreso como AAAA-MM-DD o una celda de fecha.",
      can_create_spaces: "sí permite crear espacios de KNOW, no lo quita, vacío lo conserva.",
      can_delete_spaces: "sí permite eliminar espacios de KNOW, no lo quita, vacío lo conserva.",
    },
    notes: {
      title: "Cómo funciona",
      format: "Solo se lee la primera hoja, hasta 2000 filas. Deja la fila de encabezados como está.",
      preview: "Revisa primero la vista previa: no se escribe nada hasta que apliques, y un solo error detiene toda la importación.",
      roles: "Todas las personas creadas son colaboradoras. Los roles y el permiso de gestionar cursos nunca se cambian desde este archivo.",
      keep: "Las personas que no están en el archivo no se desactivan. Una celda vacía conserva el valor actual.",
      flags: "Las columnas de sí/no aceptan sí, si, no, true, false, 1 y 0.",
    },
  },
  certificate: {
    documentTitle: "Certificado · {course}",
    title: "Certificado de finalización",
    certifies: "Se certifica que",
    completed: "completó el curso",
    issued: "Emitido el {date} · Certificado {code}",
    verify: "Verifícalo en {url}",
  },
  report: {
    columns: {
      person: "Persona",
      email: "Correo",
      area: "Área",
      position: "Puesto",
      course: "Curso",
      status: "Estado",
      progress: "Avance",
      dueDate: "Fecha límite",
      completed: "Completado",
      bestScore: "Mejor nota",
      attempts: "Intentos",
    },
    states: {
      NOT_STARTED: "Sin empezar",
      IN_PROGRESS: "En curso",
      COMPLETED: "Completado",
      OVERDUE: "Vencido",
    },
  },
};
