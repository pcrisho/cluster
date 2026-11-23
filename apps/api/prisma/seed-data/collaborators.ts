/**
 * Usuarios del seed. Combinan los colaboradores originales
 * (Lucia, Carlos, Ana, Pedro, Maria, Jorge) con perfiles adicionales
 * para llenar el organigrama.
 *
 * `globalPositionName`: posicion global (CEO, CTO, etc). Si se define, ignora orgNode.
 * `scopedPositionName`: posicion scoped al nodo. El usuario pertenece a ese nodo.
 * `teamKey`: cuando el cargo es scoped, indica el equipo final donde esta.
 */
export interface CollaboratorSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "MANAGER" | "COLLABORATOR";
  /** Posicion global (CEO, CTO, etc). Mutuamente excluyente con scoped. */
  globalPositionName?: string;
  /** Posicion scoped (vinculada a un nodo). Requiere teamKey. */
  scopedPositionName?: string;
  /** Key del nodo (teamKey para posicion scoped) donde pertenece. */
  teamKey?: string;
}

export const COLLABORATORS: CollaboratorSeed[] = [
  // ───── Originales ─────
  {
    email: "lucia.garcia@cluster.example",
    firstName: "Lucia",
    lastName: "Garcia",
    role: "COLLABORATOR",
    scopedPositionName: "Frontend Engineer",
    teamKey: "team-frontend-web",
  },
  {
    email: "carlos.mendoza@cluster.example",
    firstName: "Carlos",
    lastName: "Mendoza",
    role: "MANAGER",
    scopedPositionName: "VP of Engineering",
    teamKey: "engineering",
  },
  {
    email: "ana.torres@cluster.example",
    firstName: "Ana",
    lastName: "Torres",
    role: "MANAGER",
    scopedPositionName: "VP of Marketing",
    teamKey: "marketing",
  },
  {
    email: "pedro.ramirez@cluster.example",
    firstName: "Pedro",
    lastName: "Ramirez",
    role: "MANAGER",
    scopedPositionName: "VP of Sales",
    teamKey: "sales",
  },
  {
    email: "maria.flores@cluster.example",
    firstName: "Maria",
    lastName: "Flores",
    role: "COLLABORATOR",
    // Sin posicion (unassigned)
  },
  {
    email: "jorge.vega@cluster.example",
    firstName: "Jorge",
    lastName: "Vega",
    role: "COLLABORATOR",
    scopedPositionName: "Backend Engineer",
    teamKey: "team-backend-api",
  },

  // ───── C-level (nuevos) ─────
  {
    email: "ceo@cluster.example",
    firstName: "Sofia",
    lastName: "Mendoza",
    role: "MANAGER",
    globalPositionName: "CEO",
  },
  {
    email: "cto@cluster.example",
    firstName: "Ricardo",
    lastName: "Paredes",
    role: "MANAGER",
    globalPositionName: "CTO",
  },
  {
    email: "cfo@cluster.example",
    firstName: "Patricia",
    lastName: "Soto",
    role: "MANAGER",
    globalPositionName: "CFO",
  },
  {
    email: "coo@cluster.example",
    firstName: "Andres",
    lastName: "Reyes",
    role: "MANAGER",
    globalPositionName: "COO",
  },
  {
    email: "cmo@cluster.example",
    firstName: "Daniela",
    lastName: "Cruz",
    role: "MANAGER",
    globalPositionName: "CMO",
  },
  {
    email: "chro@cluster.example",
    firstName: "Mariana",
    lastName: "Lopez",
    role: "MANAGER",
    globalPositionName: "CHRO",
  },

  // ───── Engineering: Frontend ─────
  {
    email: "diego.castro@cluster.example",
    firstName: "Diego",
    lastName: "Castro",
    role: "MANAGER",
    scopedPositionName: "Frontend Lead",
    teamKey: "frontend",
  },
  {
    email: "elena.ruiz@cluster.example",
    firstName: "Elena",
    lastName: "Ruiz",
    role: "COLLABORATOR",
    scopedPositionName: "Senior Frontend Engineer",
    teamKey: "team-frontend-web",
  },
  {
    email: "pablo.diaz@cluster.example",
    firstName: "Pablo",
    lastName: "Diaz",
    role: "COLLABORATOR",
    scopedPositionName: "Frontend Engineer",
    teamKey: "team-frontend-mobile",
  },

  // ───── Engineering: Backend ─────
  {
    email: "sergio.romero@cluster.example",
    firstName: "Sergio",
    lastName: "Romero",
    role: "MANAGER",
    scopedPositionName: "Backend Lead",
    teamKey: "backend",
  },
  {
    email: "laura.ortiz@cluster.example",
    firstName: "Laura",
    lastName: "Ortiz",
    role: "COLLABORATOR",
    scopedPositionName: "Senior Backend Engineer",
    teamKey: "team-backend-api",
  },

  // ───── Engineering: Platform ─────
  {
    email: "matias.silva@cluster.example",
    firstName: "Matias",
    lastName: "Silva",
    role: "MANAGER",
    scopedPositionName: "DevOps Lead",
    teamKey: "platform",
  },
  {
    email: "nicolas.perez@cluster.example",
    firstName: "Nicolas",
    lastName: "Perez",
    role: "COLLABORATOR",
    scopedPositionName: "Site Reliability Engineer",
    teamKey: "platform",
  },

  // ───── Data ─────
  {
    email: "camila.gomez@cluster.example",
    firstName: "Camila",
    lastName: "Gomez",
    role: "MANAGER",
    scopedPositionName: "Data Lead",
    teamKey: "data",
  },
  {
    email: "franco.diaz@cluster.example",
    firstName: "Franco",
    lastName: "Diaz",
    role: "COLLABORATOR",
    scopedPositionName: "Data Analyst",
    teamKey: "data",
  },

  // ───── Marketing: Contenido ─────
  {
    email: "valentina.sosa@cluster.example",
    firstName: "Valentina",
    lastName: "Sosa",
    role: "MANAGER",
    scopedPositionName: "Content Lead",
    teamKey: "content",
  },
  {
    email: "martin.acosta@cluster.example",
    firstName: "Martin",
    lastName: "Acosta",
    role: "COLLABORATOR",
    scopedPositionName: "Content Writer",
    teamKey: "team-content-blog",
  },

  // ───── Marketing: Growth ─────
  {
    email: "jimena.medina@cluster.example",
    firstName: "Jimena",
    lastName: "Medina",
    role: "MANAGER",
    scopedPositionName: "Growth Lead",
    teamKey: "growth",
  },
  {
    email: "sebastian.vidal@cluster.example",
    firstName: "Sebastian",
    lastName: "Vidal",
    role: "COLLABORATOR",
    scopedPositionName: "Performance Marketer",
    teamKey: "team-growth-paid",
  },

  // ───── Sales: SDR ─────
  {
    email: "emilia.rios@cluster.example",
    firstName: "Emilia",
    lastName: "Rios",
    role: "MANAGER",
    scopedPositionName: "SDR Lead",
    teamKey: "sdr",
  },
  {
    email: "tomas.aguirre@cluster.example",
    firstName: "Tomas",
    lastName: "Aguirre",
    role: "COLLABORATOR",
    scopedPositionName: "Sales Development Rep",
    teamKey: "team-sdr-latam",
  },
  {
    email: "renata.benitez@cluster.example",
    firstName: "Renata",
    lastName: "Benitez",
    role: "COLLABORATOR",
    scopedPositionName: "Sales Development Rep",
    teamKey: "team-sdr-latam",
  },

  // ───── Sales: AE ─────
  {
    email: "agustin.navarro@cluster.example",
    firstName: "Agustin",
    lastName: "Navarro",
    role: "MANAGER",
    scopedPositionName: "AE Lead",
    teamKey: "ae",
  },
  {
    email: "constanza.ibarra@cluster.example",
    firstName: "Constanza",
    lastName: "Ibarra",
    role: "COLLABORATOR",
    scopedPositionName: "Senior Account Executive",
    teamKey: "team-ae-enterprise",
  },
  {
    email: "ramiro.duarte@cluster.example",
    firstName: "Ramiro",
    lastName: "Duarte",
    role: "COLLABORATOR",
    scopedPositionName: "Account Executive",
    teamKey: "team-ae-enterprise",
  },

  // ───── People ─────
  {
    email: "florencia.cabrera@cluster.example",
    firstName: "Florencia",
    lastName: "Cabrera",
    role: "MANAGER",
    scopedPositionName: "Recruiter Lead",
    teamKey: "recruiting",
  },
  {
    email: "julian.ferreyra@cluster.example",
    firstName: "Julian",
    lastName: "Ferreyra",
    role: "COLLABORATOR",
    scopedPositionName: "Tech Recruiter",
    teamKey: "recruiting",
  },

  // ───── Finance ─────
  {
    email: "esteban.maldonado@cluster.example",
    firstName: "Esteban",
    lastName: "Maldonado",
    role: "MANAGER",
    scopedPositionName: "Controller",
    teamKey: "finance",
  },
  {
    email: "paula.acosta@cluster.example",
    firstName: "Paula",
    lastName: "Acosta",
    role: "COLLABORATOR",
    scopedPositionName: "Accountant",
    teamKey: "finance",
  },

  // ───── Operations ─────
  {
    email: "gabriel.suarez@cluster.example",
    firstName: "Gabriel",
    lastName: "Suarez",
    role: "MANAGER",
    scopedPositionName: "Office Manager",
    teamKey: "operations",
  },
];
