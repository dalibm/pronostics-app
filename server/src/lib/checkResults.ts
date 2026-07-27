import { prisma } from "./prisma";
import type { PickStatus } from "@/generated/prisma/enums";

// Un match de foot dure ~2h ; on laisse 3h de marge avant d'aller chercher
// le score pour être sûr qu'il est terminé et remonté par l'API.
const SETTLE_DELAY_HOURS = 3;
// Si un match n'apparaît toujours pas "completed" après ce délai (reporté,
// annulé...), on arrête d'essayer de le corriger.
const ABANDON_AFTER_DAYS = 3;

type OddsApiScoreEntry = { name: string; score: string };
type OddsApiScoreEvent = {
  id: string;
  completed: boolean;
  scores: OddsApiScoreEntry[] | null;
};

async function fetchScores(
  sportKey: string,
  apiKey: string,
): Promise<OddsApiScoreEvent[]> {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=${ABANDON_AFTER_DAYS}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Requête scores échouée (${res.status}) pour ${sportKey} :\n${body}`);
  }
  return res.json() as Promise<OddsApiScoreEvent[]>;
}

function gradeH2h(
  scores: OddsApiScoreEntry[],
  homeTeam: string,
  awayTeam: string,
  selectionKey: string,
): PickStatus | null {
  const home = scores.find((s) => s.name === homeTeam);
  const away = scores.find((s) => s.name === awayTeam);
  if (!home || !away) return null;

  const homeGoals = Number(home.score);
  const awayGoals = Number(away.score);
  if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) return null;

  const actualWinner =
    homeGoals > awayGoals ? homeTeam : awayGoals > homeGoals ? awayTeam : "Draw";

  return actualWinner === selectionKey ? "WON" : "LOST";
}

function gradeTotals(
  scores: OddsApiScoreEntry[],
  point: number,
  selectionKey: string,
): PickStatus | null {
  const totalGoals = scores.reduce((sum, s) => {
    const n = Number(s.score);
    return Number.isNaN(n) ? sum : sum + n;
  }, 0);
  if (scores.some((s) => Number.isNaN(Number(s.score)))) return null;

  if (totalGoals === point) return "PUSH";
  const actual = totalGoals > point ? "Over" : "Under";
  return actual === selectionKey ? "WON" : "LOST";
}

/**
 * Va chercher le score réel des matchs dont le pronostic est encore PENDING
 * et dont le coup d'envoi est passé, puis marque chaque pronostic
 * WON/LOST/PUSH. Les matchs introuvables ou non terminés après
 * `ABANDON_AFTER_DAYS` jours passent en VOID (ex. match reporté/annulé).
 */
export async function checkPendingResults(): Promise<{
  settled: number;
  voided: number;
}> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_KEY manquant dans les variables d'environnement");
  }

  const now = Date.now();
  const settleCutoff = new Date(now - SETTLE_DELAY_HOURS * 60 * 60 * 1000);
  const abandonCutoff = new Date(now - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const pending = await prisma.pick.findMany({
    where: {
      status: "PENDING",
      matchTime: { lte: settleCutoff },
      sportKey: { not: null },
      eventId: { not: null },
    },
  });

  if (pending.length === 0) return { settled: 0, voided: 0 };

  const bySportKey = new Map<string, typeof pending>();
  for (const pick of pending) {
    const list = bySportKey.get(pick.sportKey!) ?? [];
    list.push(pick);
    bySportKey.set(pick.sportKey!, list);
  }

  let settled = 0;
  let voided = 0;

  for (const [sportKey, picks] of bySportKey) {
    let events: OddsApiScoreEvent[];
    try {
      events = await fetchScores(sportKey, apiKey);
    } catch (err) {
      console.warn(`Échec récupération scores pour ${sportKey} :`, err);
      continue;
    }
    const eventsById = new Map(events.map((e) => [e.id, e]));

    for (const pick of picks) {
      const event = eventsById.get(pick.eventId!);
      if (!event || !event.completed || !event.scores) {
        if (pick.matchTime <= abandonCutoff) {
          await prisma.pick.update({
            where: { id: pick.id },
            data: { status: "VOID", settledAt: new Date() },
          });
          voided++;
        }
        continue;
      }

      const status =
        pick.marketKey === "h2h"
          ? gradeH2h(event.scores, pick.homeTeam!, pick.awayTeam!, pick.selectionKey!)
          : pick.marketKey === "totals"
            ? gradeTotals(event.scores, pick.point!, pick.selectionKey!)
            : null;

      if (status === null) {
        if (pick.matchTime <= abandonCutoff) {
          await prisma.pick.update({
            where: { id: pick.id },
            data: { status: "VOID", settledAt: new Date() },
          });
          voided++;
        }
        continue;
      }

      await prisma.pick.update({
        where: { id: pick.id },
        data: { status, settledAt: new Date() },
      });
      settled++;
    }
  }

  return { settled, voided };
}
