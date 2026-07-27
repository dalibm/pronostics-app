import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateWeeklyPicks } from "@/lib/generatePicks";

export const maxDuration = 60;

export async function GET() {
  const picks = await prisma.pick.findMany({
    where: { period: "WEEKLY" },
    orderBy: { confidence: "desc" },
  });

  const generatedAt = picks[0]?.date.toISOString().slice(0, 10) ?? null;

  return NextResponse.json({ date: generatedAt, picks });
}

// Déclenché par le bouton "Régénérer" de l'app (voir api/picks/today pour
// le détail des choix : pas d'auth, consomme le quota The Odds API).
export async function POST() {
  try {
    const result = await generateWeeklyPicks();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Échec de la régénération manuelle hebdomadaire :", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
