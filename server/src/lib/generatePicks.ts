import { prisma } from "./prisma";

// Le foot est la priorité de l'app ; les autres sports ne servent qu'à
// compléter s'il manque des pronostics de foot un jour donné.
const OTHER_GROUPS = new Set([
  "Basketball",
  "Ice Hockey",
  "American Football",
  "Baseball",
  "Tennis",
  "Mixed Martial Arts",
]);

// Ordre de préférence quand plusieurs ligues ont des matchs le même jour —
// n'affecte pas le coût (voir plus bas), juste l'ordre d'évaluation.
const PRIORITY_LEAGUES = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "basketball_nba",
  "americanfootball_nfl",
  "icehockey_nhl",
  "baseball_mlb",
];

// The Odds API ne facture PAS les requêtes qui ne retournent aucun match
// (vérifié : header `x-requests-last: 0` sur une ligue sans match dans la
// fenêtre demandée). On peut donc interroger TOUTES les ligues actives —
// y compris D2/D3 — sans coût pour celles qui ne jouent pas ce jour-là ；
// seules les ligues qui ont effectivement des matchs coûtent des crédits.
// Filet de sécurité seulement (pas une vraie limite en pratique : il y a
// environ 40 ligues de foot suivies au total) pour éviter une explosion de
// coût si un jour exceptionnel voit énormément de ligues jouer en même temps
// (foot = 2 crédits/ligue avec match, h2h + buts ; autres = 1 crédit).
const MAX_PAID_FOOTBALL_LEAGUES = 60;
const MAX_PAID_OTHER_SPORTS = 6;
const HOURS_AHEAD = 24;

// Objectif = maximiser le taux de réussite, pas la valeur pour un parieur :
// on n'exclut plus les favoris à cote très faible (ex. 1.05), au contraire
// ce sont eux qui ont statistiquement le plus de chances de se réaliser.
//
// En revanche on exige un minimum de bookmakers en accord sur une cote —
// un marché avec 1-2 cotations peut afficher une "confiance" élevée à cause
// d'une cote isolée mal calibrée (ligue peu liquide), sans être fiable pour
// autant. C'est le principal facteur de bruit dans la sélection.
const MIN_BOOKMAKERS = 5;

type OddsApiSport = {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
};

type OddsApiOutcome = { name: string; price: number; point?: number };
type OddsApiMarket = { key: string; outcomes: OddsApiOutcome[] };
type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
};
type OddsApiEvent = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

type CandidatePick = {
  sport: string;
  league: string;
  event: string;
  matchTime: string;
  market: string;
  selection: string;
  odds: number;
  confidence: number;
  reasoning: string;
  sourceUrls: string[];
  // Champs bruts nécessaires pour vérifier automatiquement le résultat plus
  // tard (voir checkResults.ts) — non affichés dans l'app.
  sportKey: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  marketKey: "h2h" | "totals";
  selectionKey: string; // home_team / away_team / "Draw" / "Over" / "Under"
  point: number | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Requête échouée (${res.status}) : ${url}\n${body}`);
  }
  return res.json() as Promise<T>;
}

async function getActiveSports(apiKey: string): Promise<OddsApiSport[]> {
  // Endpoint gratuit (ne compte jamais dans le quota).
  const sports = await fetchJson<OddsApiSport[]>(
    `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`,
  );
  const inScope = sports.filter((s) => s.active && (s.group === "Soccer" || OTHER_GROUPS.has(s.group)));

  return inScope.sort((a, b) => {
    const pa = PRIORITY_LEAGUES.indexOf(a.key);
    const pb = PRIORITY_LEAGUES.indexOf(b.key);
    const ra = pa === -1 ? PRIORITY_LEAGUES.length : pa;
    const rb = pb === -1 ? PRIORITY_LEAGUES.length : pb;
    return ra - rb;
  });
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function evaluateH2h(event: OddsApiEvent, sportInfo: OddsApiSport): CandidatePick | null {
  const pricesByOutcome = new Map<string, number[]>();

  for (const bookmaker of event.bookmakers) {
    const h2h = bookmaker.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;
    for (const outcome of h2h.outcomes) {
      const list = pricesByOutcome.get(outcome.name) ?? [];
      list.push(outcome.price);
      pricesByOutcome.set(outcome.name, list);
    }
  }

  if (pricesByOutcome.size === 0) return null;

  const bookmakerCount = event.bookmakers.filter((b) =>
    b.markets.some((m) => m.key === "h2h"),
  ).length;
  if (bookmakerCount < MIN_BOOKMAKERS) return null;

  const avgByOutcome = new Map<string, number>();
  for (const [name, prices] of pricesByOutcome) {
    avgByOutcome.set(name, average(prices));
  }

  const impliedByOutcome = new Map<string, number>();
  let impliedSum = 0;
  for (const [name, avg] of avgByOutcome) {
    const implied = 1 / avg;
    impliedByOutcome.set(name, implied);
    impliedSum += implied;
  }

  let favorite = "";
  let favoriteNormProb = 0;
  for (const [name, implied] of impliedByOutcome) {
    const normProb = implied / impliedSum;
    if (normProb > favoriteNormProb) {
      favoriteNormProb = normProb;
      favorite = name;
    }
  }
  if (!favorite) return null;

  const favoritePrices = pricesByOutcome.get(favorite)!;
  const avgOdds = avgByOutcome.get(favorite)!;
  const minOdds = Math.min(...favoritePrices);
  const maxOdds = Math.max(...favoritePrices);
  const spreadRatio = (maxOdds - minOdds) / avgOdds;
  const consensus = spreadRatio < 0.05 ? "fort consensus" : "léger désaccord";

  const confidence = Math.round(favoriteNormProb * 100);
  const isSoccer = sportInfo.group === "Soccer";
  const selectionLabel =
    favorite === event.home_team
      ? `${favorite} (domicile)`
      : favorite === event.away_team
        ? `${favorite} (extérieur)`
        : favorite; // "Draw"

  return {
    sport: sportInfo.group,
    league: sportInfo.title,
    event: `${event.home_team} vs ${event.away_team}`,
    matchTime: event.commence_time,
    market: isSoccer ? "Résultat du match (1X2)" : "Vainqueur du match",
    selection: favorite === "Draw" ? "Match nul" : selectionLabel,
    odds: Math.round(avgOdds * 100) / 100,
    confidence,
    reasoning:
      `Favori du marché avec une cote moyenne de ${avgOdds.toFixed(2)} chez ${bookmakerCount} bookmaker(s) ` +
      `(probabilité implicite ≈ ${confidence}%). ${capitalize(consensus)} entre bookmakers ` +
      `(cotes de ${minOdds.toFixed(2)} à ${maxOdds.toFixed(2)}).`,
    sourceUrls: ["https://the-odds-api.com"],
    sportKey: sportInfo.key,
    eventId: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    marketKey: "h2h",
    selectionKey: favorite,
    point: null,
  };
}

function evaluateTotals(event: OddsApiEvent, sportInfo: OddsApiSport): CandidatePick | null {
  // Les bookmakers peuvent proposer des lignes différentes (2.5, 3.0...) —
  // on regroupe par ligne et on retient celle offrant le plus de cotations.
  const byPoint = new Map<number, { over: number[]; under: number[] }>();
  let bookmakerCount = 0;

  for (const bookmaker of event.bookmakers) {
    const totals = bookmaker.markets.find((m) => m.key === "totals");
    if (!totals) continue;
    bookmakerCount++;
    for (const outcome of totals.outcomes) {
      if (outcome.point == null) continue;
      const entry = byPoint.get(outcome.point) ?? { over: [], under: [] };
      if (outcome.name === "Over") entry.over.push(outcome.price);
      else if (outcome.name === "Under") entry.under.push(outcome.price);
      byPoint.set(outcome.point, entry);
    }
  }

  if (byPoint.size === 0) return null;

  let chosenPoint = -1;
  let bestCoverage = 0;
  for (const [point, entry] of byPoint) {
    const coverage = entry.over.length + entry.under.length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      chosenPoint = point;
    }
  }

  const entry = byPoint.get(chosenPoint)!;
  if (Math.min(entry.over.length, entry.under.length) < MIN_BOOKMAKERS) return null;

  const avgOver = average(entry.over);
  const avgUnder = average(entry.under);
  const impliedOver = 1 / avgOver;
  const impliedUnder = 1 / avgUnder;
  const impliedSum = impliedOver + impliedUnder;
  const normOver = impliedOver / impliedSum;
  const normUnder = impliedUnder / impliedSum;

  const favorsOver = normOver >= normUnder;
  const favoriteNormProb = favorsOver ? normOver : normUnder;
  const favoritePrices = favorsOver ? entry.over : entry.under;
  const avgOdds = favorsOver ? avgOver : avgUnder;
  const minOdds = Math.min(...favoritePrices);
  const maxOdds = Math.max(...favoritePrices);
  const spreadRatio = (maxOdds - minOdds) / avgOdds;
  const consensus = spreadRatio < 0.05 ? "fort consensus" : "léger désaccord";
  const confidence = Math.round(favoriteNormProb * 100);
  const direction = favorsOver ? "Plus" : "Moins";

  return {
    sport: sportInfo.group,
    league: sportInfo.title,
    event: `${event.home_team} vs ${event.away_team}`,
    matchTime: event.commence_time,
    market: "Nombre de buts (Over/Under)",
    selection: `${direction} de ${chosenPoint} buts`,
    odds: Math.round(avgOdds * 100) / 100,
    confidence,
    reasoning:
      `"${direction} de ${chosenPoint} buts" favorisé avec une cote moyenne de ${avgOdds.toFixed(2)} chez ${bookmakerCount} bookmaker(s) ` +
      `(probabilité implicite ≈ ${confidence}%). ${capitalize(consensus)} entre bookmakers ` +
      `(cotes de ${minOdds.toFixed(2)} à ${maxOdds.toFixed(2)}).`,
    sourceUrls: ["https://the-odds-api.com"],
    sportKey: sportInfo.key,
    eventId: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    marketKey: "totals",
    selectionKey: favorsOver ? "Over" : "Under",
    point: chosenPoint,
  };
}

/**
 * Interroge chaque sport de la liste. Comme les ligues sans match dans la
 * fenêtre ne coûtent rien, on les évalue TOUTES et on ne s'arrête que quand
 * `maxPaidLeagues` ligues ont effectivement retourné des matchs (coût réel).
 */
async function evaluateSports(
  sports: OddsApiSport[],
  apiKey: string,
  regions: string,
  now: number,
  cutoff: number,
  maxPaidLeagues: number,
): Promise<CandidatePick[]> {
  const candidates: CandidatePick[] = [];
  const commenceTimeFrom = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  const commenceTimeTo = new Date(cutoff).toISOString().replace(/\.\d{3}Z$/, "Z");
  let paidLeagues = 0;

  for (const sportInfo of sports) {
    if (paidLeagues >= maxPaidLeagues) break;

    const isSoccer = sportInfo.group === "Soccer";
    const markets = isSoccer ? "h2h,totals" : "h2h";
    const url =
      `https://api.the-odds-api.com/v4/sports/${sportInfo.key}/odds/` +
      `?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=decimal` +
      `&commenceTimeFrom=${commenceTimeFrom}&commenceTimeTo=${commenceTimeTo}`;
    let events: OddsApiEvent[];
    try {
      events = await fetchJson<OddsApiEvent[]>(url);
    } catch (err) {
      console.warn(`Échec pour ${sportInfo.key} :`, err);
      continue;
    }

    if (events.length === 0) continue; // gratuit, ne compte pas dans le quota
    paidLeagues++;

    for (const event of events) {
      const h2hCandidate = evaluateH2h(event, sportInfo);
      if (h2hCandidate) candidates.push(h2hCandidate);

      if (isSoccer) {
        const totalsCandidate = evaluateTotals(event, sportInfo);
        if (totalsCandidate) candidates.push(totalsCandidate);
      }
    }
  }

  return candidates;
}

async function generatePicksForPeriod(
  period: "DAILY" | "WEEKLY",
  hoursAhead: number,
  topN: number,
): Promise<{ count: number; date: string }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_KEY manquant dans les variables d'environnement");
  }
  const regions = process.env.ODDS_API_REGIONS ?? "eu";

  const activeSports = await getActiveSports(apiKey);
  const footballSports = activeSports.filter((s) => s.group === "Soccer");
  const otherSports = activeSports.filter((s) => s.group !== "Soccer");

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateOnly = new Date(`${todayIso}T00:00:00.000Z`);
  const now = Date.now();
  const cutoff = now + hoursAhead * 60 * 60 * 1000;

  // Le foot est toujours prioritaire : on interroge TOUTES les ligues actives
  // (top divisions comme D2/D3), h2h + buts. Coût nul pour celles sans match.
  const footballCandidates = await evaluateSports(
    footballSports,
    apiKey,
    regions,
    now,
    cutoff,
    MAX_PAID_FOOTBALL_LEAGUES,
  );

  let picks = footballCandidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);

  // Les autres sports ne comblent que les places restantes.
  if (picks.length < topN) {
    const remainingSlots = topN - picks.length;
    const otherCandidates = await evaluateSports(
      otherSports,
      apiKey,
      regions,
      now,
      cutoff,
      MAX_PAID_OTHER_SPORTS,
    );
    const otherPicks = otherCandidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, remainingSlots);
    picks = [...picks, ...otherPicks];
  }

  // Le quotidien ne remplace que les pronostics du jour ; l'hebdomadaire
  // remplace toute la liste précédente (une seule liste "semaine" à la fois).
  if (period === "DAILY") {
    await prisma.pick.deleteMany({ where: { period, date: dateOnly } });
  } else {
    await prisma.pick.deleteMany({ where: { period } });
  }
  if (picks.length > 0) {
    await prisma.pick.createMany({
      data: picks.map((p) => ({
        period,
        date: dateOnly,
        matchTime: new Date(p.matchTime),
        sport: p.sport,
        league: p.league,
        event: p.event,
        market: p.market,
        selection: p.selection,
        odds: p.odds,
        confidence: p.confidence,
        reasoning: p.reasoning,
        sourceUrls: p.sourceUrls,
        sportKey: p.sportKey,
        eventId: p.eventId,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        marketKey: p.marketKey,
        selectionKey: p.selectionKey,
        point: p.point,
      })),
    });
  }

  return { count: picks.length, date: todayIso };
}

export async function generatePicks(): Promise<{ count: number; date: string }> {
  return generatePicksForPeriod("DAILY", HOURS_AHEAD, 5);
}

export async function generateWeeklyPicks(): Promise<{ count: number; date: string }> {
  return generatePicksForPeriod("WEEKLY", 7 * 24, 10);
}
