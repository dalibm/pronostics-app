import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const counts = await prisma.pick.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const won = byStatus.WON ?? 0;
  const lost = byStatus.LOST ?? 0;
  const push = byStatus.PUSH ?? 0;
  const voided = byStatus.VOID ?? 0;
  const pending = byStatus.PENDING ?? 0;
  const graded = won + lost;

  console.log(`En attente : ${pending}`);
  console.log(`Annulés (match introuvable/reporté) : ${voided}`);
  console.log(`Push (nul exact sur l'over/under) : ${push}`);
  console.log(`Gagnés : ${won}`);
  console.log(`Perdus : ${lost}`);
  if (graded > 0) {
    console.log(`Taux de réussite : ${((won / graded) * 100).toFixed(1)}% (${won}/${graded})`);
  } else {
    console.log("Taux de réussite : pas encore assez de pronostics corrigés.");
  }
}

main()
  .catch((err) => {
    console.error("Échec du calcul des stats :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
