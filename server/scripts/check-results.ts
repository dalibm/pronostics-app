import "dotenv/config";
import { checkPendingResults } from "../src/lib/checkResults";
import { prisma } from "../src/lib/prisma";

checkPendingResults()
  .then(({ settled, voided }) => {
    console.log(`${settled} pronostic(s) corrigé(s), ${voided} annulé(s) (match introuvable/reporté).`);
  })
  .catch((err) => {
    console.error("Échec de la vérification des résultats :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
