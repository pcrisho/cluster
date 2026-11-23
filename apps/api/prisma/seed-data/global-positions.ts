/**
 * Global positions (no scoped a un nodo). Aplican a toda la org.
 * Ejemplos clasicos: CEO, C-suite.
 */
export interface GlobalPositionSeed {
  name: string;
  description: string;
  color: string;
}

export const GLOBAL_POSITIONS: GlobalPositionSeed[] = [
  {
    name: "CEO",
    description: "Chief Executive Officer. Vision y estrategia global.",
    color: "#ef4444",
  },
  {
    name: "CFO",
    description: "Chief Financial Officer. Finanzas y estrategia economica.",
    color: "#f59e0b",
  },
  {
    name: "CTO",
    description: "Chief Technology Officer. Estrategia tecnologica.",
    color: "#3b82f6",
  },
  {
    name: "COO",
    description: "Chief Operating Officer. Operaciones del dia a dia.",
    color: "#10b981",
  },
  {
    name: "CMO",
    description: "Chief Marketing Officer. Marketing y marca global.",
    color: "#ec4899",
  },
  {
    name: "CHRO",
    description: "Chief Human Resources Officer. Personas y cultura.",
    color: "#a855f7",
  },
  {
    name: "Admin",
    description: "Administrador de plataforma. Acceso total al sistema.",
    color: "#8b5cf6",
  },
  {
    name: "Founder",
    description: "Cofundador/a de la organizacion.",
    color: "#dc2626",
  },
];
