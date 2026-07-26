import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyPicks } from "@/lib/generatePicks";

// Appelé chaque mardi par Vercel Cron (voir vercel.json). Voir
// api/cron/generate-picks/route.ts pour le détail de la vérification du
// secret.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await generateWeeklyPicks();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Échec de la génération hebdomadaire planifiée :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
