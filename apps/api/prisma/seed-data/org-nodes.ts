/**
 * Definicion del organigrama: estructura jerarquica completa.
 * Cada nodo tiene un key unico (para referencias), un nombre visible,
 * un tipo de nivel, un parentKey, opcional icon y sortOrder.
 *
 * El orden de insercion debe respetar el parentKey (top-down).
 */
export interface OrgNodeSeed {
  key: string;
  name: string;
  parentKey: string | null;
  icon?: string;
  sortOrder: number;
  /** Email del usuario que sera asignado como manager de este nodo (opcional) */
  managerEmail?: string;
}

export const ORG_NODES: OrgNodeSeed[] = [
  // ────────────────────────────────────────────────────────────────────────
  // Level 0: CEO (root, debajo de CEO va la "organizacion" pero CEO es la cabeza)
  // ────────────────────────────────────────────────────────────────────────
  {
    key: "root",
    name: "Executive Direction",
    parentKey: null,
    icon: "Building2",
    sortOrder: 0,
    managerEmail: "admin@cluster.example",
  },

  // ────────────────────────────────────────────────────────────────────────
  // Level 1: C-level
  // ────────────────────────────────────────────────────────────────────────
  {
    key: "cto-office",
    name: "CTO Office",
    parentKey: "root",
    icon: "Code",
    sortOrder: 0,
  },
  {
    key: "cfo-office",
    name: "CFO Office",
    parentKey: "root",
    icon: "Briefcase",
    sortOrder: 1,
  },
  {
    key: "coo-office",
    name: "COO Office",
    parentKey: "root",
    icon: "Briefcase",
    sortOrder: 2,
  },
  {
    key: "cmo-office",
    name: "CMO Office",
    parentKey: "root",
    icon: "Briefcase",
    sortOrder: 3,
  },
  {
    key: "chro-office",
    name: "CHRO Office",
    parentKey: "root",
    icon: "Users",
    sortOrder: 4,
  },

  // ────────────────────────────────────────────────────────────────────────
  // Level 2: Gerencias / Jefaturas debajo de cada C-level
  // ────────────────────────────────────────────────────────────────────────
  // Engineering (CTO)
  {
    key: "engineering",
    name: "Engineering",
    parentKey: "cto-office",
    icon: "Code",
    sortOrder: 0,
    managerEmail: "carlos.mendoza@cluster.example",
  },
  // Finance (CFO)
  {
    key: "finance",
    name: "Finance",
    parentKey: "cfo-office",
    icon: "Briefcase",
    sortOrder: 0,
  },
  // Operations (COO)
  {
    key: "operations",
    name: "Operations",
    parentKey: "coo-office",
    icon: "Briefcase",
    sortOrder: 0,
  },
  // Marketing (CMO)
  {
    key: "marketing",
    name: "Marketing",
    parentKey: "cmo-office",
    icon: "Users",
    sortOrder: 0,
    managerEmail: "ana.torres@cluster.example",
  },
  // People (CHRO)
  {
    key: "people",
    name: "People & Culture",
    parentKey: "chro-office",
    icon: "Users",
    sortOrder: 0,
  },
  // Sales (COO tambien, reportando a COO por revenue/ops)
  {
    key: "sales",
    name: "Sales",
    parentKey: "coo-office",
    icon: "Users",
    sortOrder: 1,
    managerEmail: "pedro.ramirez@cluster.example",
  },

  // ────────────────────────────────────────────────────────────────────────
  // Level 3: Jefaturas debajo de cada Gerencia
  // ────────────────────────────────────────────────────────────────────────
  // Engineering
  {
    key: "frontend",
    name: "Frontend",
    parentKey: "engineering",
    icon: "Code",
    sortOrder: 0,
  },
  {
    key: "backend",
    name: "Backend",
    parentKey: "engineering",
    icon: "Code",
    sortOrder: 1,
  },
  {
    key: "platform",
    name: "Platform & DevOps",
    parentKey: "engineering",
    icon: "Code",
    sortOrder: 2,
  },
  {
    key: "data",
    name: "Data & Analytics",
    parentKey: "engineering",
    icon: "Code",
    sortOrder: 3,
  },
  // Marketing
  {
    key: "content",
    name: "Content & Brand",
    parentKey: "marketing",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "growth",
    name: "Growth & Demand",
    parentKey: "marketing",
    icon: "Users",
    sortOrder: 1,
  },
  // Sales
  {
    key: "sdr",
    name: "SDR / Outbound",
    parentKey: "sales",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "ae",
    name: "Account Executives",
    parentKey: "sales",
    icon: "Users",
    sortOrder: 1,
  },
  // People
  {
    key: "recruiting",
    name: "Recruitment",
    parentKey: "people",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "people-ops",
    name: "People Ops",
    parentKey: "people",
    icon: "Users",
    sortOrder: 1,
  },

  // ────────────────────────────────────────────────────────────────────────
  // Level 4: Equipos
  // ────────────────────────────────────────────────────────────────────────
  {
    key: "team-frontend-web",
    name: "Web",
    parentKey: "frontend",
    icon: "Code",
    sortOrder: 0,
  },
  {
    key: "team-frontend-mobile",
    name: "Mobile",
    parentKey: "frontend",
    icon: "Code",
    sortOrder: 1,
  },
  {
    key: "team-backend-api",
    name: "API",
    parentKey: "backend",
    icon: "Code",
    sortOrder: 0,
  },
  {
    key: "team-backend-infra",
    name: "Infrastructure",
    parentKey: "backend",
    icon: "Code",
    sortOrder: 1,
  },
  {
    key: "team-content-blog",
    name: "Blog & SEO",
    parentKey: "content",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "team-growth-paid",
    name: "Paid Acquisition",
    parentKey: "growth",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "team-sdr-latam",
    name: "SDR LATAM",
    parentKey: "sdr",
    icon: "Users",
    sortOrder: 0,
  },
  {
    key: "team-ae-enterprise",
    name: "Enterprise",
    parentKey: "ae",
    icon: "Users",
    sortOrder: 0,
  },
];
