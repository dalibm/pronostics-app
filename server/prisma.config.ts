import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma migrate deploy` a besoin d'une connexion DIRECTE (non poolée) : les
// migrations posent un verrou (advisory lock) que PgBouncer/pooler (Supabase,
// Neon...) en mode transaction ne supporte pas, ce qui bloque indéfiniment au
// lieu d'échouer. On utilise donc POSTGRES_URL_NON_POOLING en priorité (fourni
// par l'intégration Vercel Postgres, quel que soit le fournisseur sous-jacent).
const databaseUrl =
  process.env["POSTGRES_URL_NON_POOLING"] ??
  process.env["DIRECT_URL"] ??
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
