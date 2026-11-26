import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  // Env vars are loaded externally via `dotenv -e ../../.env` in package.json scripts
  // Migrations and the seed run as the owner; the API itself uses DATABASE_URL (the cluster_app role)
  datasource: {
    url: process.env.DATABASE_OWNER_URL!,
  },
});
