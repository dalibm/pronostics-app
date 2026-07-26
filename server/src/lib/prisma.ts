import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Le nom de la variable d'environnement varie selon l'intégration Postgres
// utilisée sur Vercel (DATABASE_URL en local, POSTGRES_PRISMA_URL ou
// POSTGRES_URL selon l'intégration Vercel Postgres/Neon).
function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "Aucune variable DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL trouvée.",
    );
  }
  return url;
}

function createClient() {
  const connectionString = getConnectionString();
  // Le pooler Supabase présente une chaîne de certificats que Node ne trouve
  // pas dans ses CA de confiance par défaut ("self-signed certificate in
  // certificate chain") — on garde le chiffrement TLS mais sans vérifier la
  // chaîne, comme le fait le moteur natif de Prisma automatiquement.
  const needsSsl = !connectionString.includes("localhost");
  const adapter = new PrismaPg({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
