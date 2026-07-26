import "dotenv/config";
import { defineConfig } from "prisma/config";

// Le nom de la variable d'environnement varie selon l'intégration Postgres
// utilisée sur Vercel (DATABASE_URL en local, POSTGRES_PRISMA_URL ou
// POSTGRES_URL selon l'intégration Vercel Postgres/Neon).
const databaseUrl =
  process.env["DATABASE_URL"] ??
  process.env["POSTGRES_PRISMA_URL"] ??
  process.env["POSTGRES_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
