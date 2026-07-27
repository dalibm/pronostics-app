import { NextRequest, NextResponse } from "next/server";
import { generatePicks } from "@/lib/generatePicks";
import { checkPendingResults } from "@/lib/checkResults";

// ~40 ligues de foot interrogées séquentiellement, avec retries en cas de
// 429 côté The Odds API (voir fetchJson dans generatePicks.ts) : la valeur
// par défaut (10s sur Hobby) ne suffit pas toujours.
export const maxDuration = 60;

// Appelé quotidiennement par Vercel Cron (voir vercel.json). Vercel ajoute
// automatiquement l'en-tête `Authorization: Bearer $CRON_SECRET` sur les
// appels planifiés — on vérifie ce secret pour empêcher un déclenchement
// public (l'appel consomme du quota The Odds API et réécrit les pronostics
// du jour).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Corrige les pronostics de la veille avant d'en générer de nouveaux.
  // Pas de cron dédié : le plan Vercel Hobby limite à 2 crons/jour et les
  // deux slots sont déjà pris par generate-picks et generate-weekly-picks.
  // Un échec ici ne doit pas empêcher la génération du jour.
  try {
    await checkPendingResults();
  } catch (err) {
    console.warn("Échec de la vérification des résultats en attente :", err);
  }

  try {
    const result = await generatePicks();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Échec de la génération planifiée :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
