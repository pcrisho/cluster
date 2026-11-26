/**
 * Posiciones scoped a un nodo. Cada nodo puede tener su propio
 * catalogo de cargos con su nivel (1-10) y color opcional.
 */
export interface ScopedPositionSeed {
  orgNodeKey: string;
  name: string;
  description: string;
  color: string;
}

export const SCOPED_POSITIONS: ScopedPositionSeed[] = [
  // ───── Engineering gerencia ─────
  {
    orgNodeKey: "engineering",
    name: "VP of Engineering",
    description: "Lidera la estrategia tecnica del area de Engineering.",
    color: "#3b82f6",
  },
  {
    orgNodeKey: "engineering",
    name: "Engineering Manager",
    description: "Lidera una o mas areas de ingenieria.",
    color: "#60a5fa",
  },

  // ───── Frontend ─────
  {
    orgNodeKey: "frontend",
    name: "Frontend Lead",
    description: "Tech lead del equipo de Frontend.",
    color: "#10b981",
  },
  {
    orgNodeKey: "frontend",
    name: "Senior Frontend Engineer",
    description: "Ingeniero frontend senior.",
    color: "#34d399",
  },
  {
    orgNodeKey: "frontend",
    name: "Frontend Engineer",
    description: "Ingeniero frontend.",
    color: "#6ee7b7",
  },

  // ───── Backend ─────
  {
    orgNodeKey: "backend",
    name: "Backend Lead",
    description: "Tech lead del equipo de Backend.",
    color: "#f59e0b",
  },
  {
    orgNodeKey: "backend",
    name: "Senior Backend Engineer",
    description: "Ingeniero backend senior.",
    color: "#fbbf24",
  },
  {
    orgNodeKey: "backend",
    name: "Backend Engineer",
    description: "Ingeniero backend.",
    color: "#fcd34d",
  },

  // ───── Platform & DevOps ─────
  {
    orgNodeKey: "platform",
    name: "DevOps Lead",
    description: "Lidera plataforma e infraestructura.",
    color: "#8b5cf6",
  },
  {
    orgNodeKey: "platform",
    name: "Site Reliability Engineer",
    description: "Encargado de disponibilidad y performance.",
    color: "#a78bfa",
  },

  // ───── Data & Analytics ─────
  {
    orgNodeKey: "data",
    name: "Data Lead",
    description: "Lidera el equipo de datos.",
    color: "#06b6d4",
  },
  {
    orgNodeKey: "data",
    name: "Data Analyst",
    description: "Analisis de datos y reporting.",
    color: "#22d3ee",
  },

  // ───── Finanzas ─────
  {
    orgNodeKey: "finance",
    name: "VP of Finance",
    description: "Lidera el area financiera.",
    color: "#f59e0b",
  },
  {
    orgNodeKey: "finance",
    name: "Controller",
    description: "Control financiero y reporting.",
    color: "#fbbf24",
  },
  {
    orgNodeKey: "finance",
    name: "Accountant",
    description: "Contabilidad general.",
    color: "#fcd34d",
  },

  // ───── Operaciones ─────
  {
    orgNodeKey: "operations",
    name: "VP of Operations",
    description: "Lidera operaciones.",
    color: "#10b981",
  },
  {
    orgNodeKey: "operations",
    name: "Office Manager",
    description: "Administracion de oficina y operaciones internas.",
    color: "#34d399",
  },

  // ───── Marketing ─────
  {
    orgNodeKey: "marketing",
    name: "VP of Marketing",
    description: "Lidera marketing global.",
    color: "#ec4899",
  },
  {
    orgNodeKey: "marketing",
    name: "Product Marketing Manager",
    description: "Marketing de producto.",
    color: "#f472b6",
  },

  // ───── Contenido & Brand ─────
  {
    orgNodeKey: "content",
    name: "Content Lead",
    description: "Lidera estrategia de contenido.",
    color: "#f97316",
  },
  {
    orgNodeKey: "content",
    name: "Content Writer",
    description: "Creacion de contenido escrito.",
    color: "#fb923c",
  },

  // ───── Growth & Demand ─────
  {
    orgNodeKey: "growth",
    name: "Growth Lead",
    description: "Lidera acquisition y growth.",
    color: "#84cc16",
  },
  {
    orgNodeKey: "growth",
    name: "Performance Marketer",
    description: "Paid media y performance.",
    color: "#a3e635",
  },

  // ───── Ventas ─────
  {
    orgNodeKey: "sales",
    name: "VP of Sales",
    description: "Lidera el area de ventas.",
    color: "#14b8a6",
  },
  {
    orgNodeKey: "sales",
    name: "Sales Manager",
    description: "Gerencia de equipo de ventas.",
    color: "#2dd4bf",
  },

  // ───── SDR ─────
  {
    orgNodeKey: "sdr",
    name: "SDR Lead",
    description: "Lidera equipo de SDRs.",
    color: "#06b6d4",
  },
  {
    orgNodeKey: "sdr",
    name: "Sales Development Rep",
    description: "Prospeccion outbound.",
    color: "#22d3ee",
  },

  // ───── Account Executives ─────
  {
    orgNodeKey: "ae",
    name: "AE Lead",
    description: "Lidera equipo de AEs.",
    color: "#0ea5e9",
  },
  {
    orgNodeKey: "ae",
    name: "Senior Account Executive",
    description: "Cierre de cuentas enterprise.",
    color: "#38bdf8",
  },
  {
    orgNodeKey: "ae",
    name: "Account Executive",
    description: "Cierre de cuentas mid-market.",
    color: "#7dd3fc",
  },

  // ───── People & Culture ─────
  {
    orgNodeKey: "people",
    name: "VP of People",
    description: "Lidera el area de personas.",
    color: "#a855f7",
  },

  // ───── Reclutamiento ─────
  {
    orgNodeKey: "recruiting",
    name: "Recruiter Lead",
    description: "Lidera el equipo de reclutamiento.",
    color: "#c084fc",
  },
  {
    orgNodeKey: "recruiting",
    name: "Tech Recruiter",
    description: "Reclutamiento tecnico.",
    color: "#d8b4fe",
  },

  // ───── People Ops ─────
  {
    orgNodeKey: "people-ops",
    name: "People Ops Specialist",
    description: "Operaciones de personal (onboarding, beneficios).",
    color: "#a78bfa",
  },
];
