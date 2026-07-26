import { NextRequest, NextResponse } from "next/server";
import { generatePicks } from "@/lib/generatePicks";

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
