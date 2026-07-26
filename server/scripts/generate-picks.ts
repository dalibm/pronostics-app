import "dotenv/config";
import { generatePicks } from "../src/lib/generatePicks";
import { prisma } from "../src/lib/prisma";

generatePicks()
  .then(({ count, date }) => {
    console.log(`${count} pronostic(s) généré(s) pour le ${date}.`);
  })
  .catch((err) => {
    console.error("Échec de la génération des pronostics :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
