import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePicks } from "@/lib/generatePicks";
import { checkPendingResults } from "@/lib/checkResults";

// Régénération manuelle depuis l'app (~40 ligues interrogées) : même marge
// que le cron quotidien (voir api/cron/generate-picks/route.ts).
export const maxDuration = 60;

export async function GET() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const picks = await prisma.pick.findMany({
    where: { period: "DAILY", date: today },
    orderBy: { confidence: "desc" },
  });

  return NextResponse.json({ date: today.toISOString().slice(0, 10), picks });
}

// Déclenché par le bouton "Régénérer" de l'app. Usage personnel mono-
// utilisateur, pas d'authentification (comme le reste de l'API) — chaque
// appel consomme le quota The Odds API.
export async function POST() {
  try {
    await checkPendingResults();
  } catch (err) {
    console.warn("Échec de la vérification des résultats en attente :", err);
  }

  try {
    const result = await generatePicks();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Échec de la régénération manuelle :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
