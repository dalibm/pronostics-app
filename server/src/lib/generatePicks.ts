import { prisma } from "./prisma";

// Toutes les grandes ligues n'ont pas de matchs toute l'année (ex. foot européen,
// NBA, NFL, NHL sont en pause l'été). On élargit donc aux catégories de sport
// suivies, puis on privilégie les plus grandes ligues quand plusieurs sont actives
// en même temps (voir tri par PRIORITY_LEAGUES plus bas).
const ALLOWED_GROUPS = new Set([
  "Soccer",
  "Basketball",
  "Ice Hockey",
  "American Football",
  "Baseball",
  "Tennis",
  "Mixed Martial Arts",
]);

// Grandes ligues à privilégier quand elles sont en saison (ordre = priorité).
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
  "soccer_usa_mls",
  "soccer_brazil_campeonato",
  "soccer_japan_j_league",
  "mma_mixed_martial_arts",
];

// Limite le nombre d'appels /odds par exécution pour rester large sous le quota
// gratuit (500 crédits/mois) : 1 crédit = 1 sport x 1 region x 1 market.
const MAX_SPORT_CALLS = 12;
const HOURS_AHEAD = 48;

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
  market: string;
  selection: string;
  odds: number;
  confidence: number;
  reasoning: string;
  sourceUrls: string[];
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
  const sports = await fetchJson<OddsApiSport[]>(
    `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`,
  );
  const inScope = sports.filter((s) => s.active && ALLOWED_GROUPS.has(s.group));

  // Grandes ligues (dans PRIORITY_LEAGUES) en premier, dans cet ordre ; le reste ensuite.
  return inScope.sort((a, b) => {
    const pa = PRIORITY_LEAGUES.indexOf(a.key);
    const pb = PRIORITY_LEAGUES.indexOf(b.key);
    const ra = pa === -1 ? PRIORITY_LEAGUES.length : pa;
    const rb = pb === -1 ? PRIORITY_LEAGUES.length : pb;
    return ra - rb;
  });
}

function evaluateEvent(
  event: OddsApiEvent,
  sportInfo: OddsApiSport,
): CandidatePick | null {
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

  const avgByOutcome = new Map<string, number>();
  for (const [name, prices] of pricesByOutcome) {
    avgByOutcome.set(name, prices.reduce((a, b) => a + b, 0) / prices.length);
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
    market: isSoccer ? "Résultat du match (1X2)" : "Vainqueur du match",
    selection: favorite === "Draw" ? "Match nul" : selectionLabel,
    odds: Math.round(avgOdds * 100) / 100,
    confidence,
    reasoning:
      `Favori du marché avec une cote moyenne de ${avgOdds.toFixed(2)} chez ${bookmakerCount} bookmaker(s) ` +
      `(probabilité implicite ≈ ${confidence}%). ${consensus.charAt(0).toUpperCase()}${consensus.slice(1)} entre bookmakers ` +
      `(cotes de ${minOdds.toFixed(2)} à ${maxOdds.toFixed(2)}).`,
    sourceUrls: ["https://the-odds-api.com"],
  };
}

export async function generatePicks(): Promise<{ count: number; date: string }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_KEY manquant dans les variables d'environnement");
  }
  const regions = process.env.ODDS_API_REGIONS ?? "eu";

  const activeSports = await getActiveSports(apiKey);
  const sportsToQuery = activeSports.slice(0, MAX_SPORT_CALLS);

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateOnly = new Date(`${todayIso}T00:00:00.000Z`);

  if (sportsToQuery.length === 0) {
    await prisma.pick.deleteMany({ where: { date: dateOnly } });
    return { count: 0, date: todayIso };
  }

  const now = Date.now();
  const cutoff = now + HOURS_AHEAD * 60 * 60 * 1000;
  const candidates: CandidatePick[] = [];

  for (const sportInfo of sportsToQuery) {
    const url =
      `https://api.the-odds-api.com/v4/sports/${sportInfo.key}/odds/` +
      `?apiKey=${apiKey}&regions=${regions}&markets=h2h&oddsFormat=decimal`;
    let events: OddsApiEvent[];
    try {
      events = await fetchJson<OddsApiEvent[]>(url);
    } catch (err) {
      console.warn(`Échec pour ${sportInfo.key} :`, err);
      continue;
    }

    for (const event of events) {
      const commence = new Date(event.commence_time).getTime();
      if (commence < now || commence > cutoff) continue;
      const candidate = evaluateEvent(event, sportInfo);
      if (candidate) candidates.push(candidate);
    }
  }

  const picks = candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  await prisma.pick.deleteMany({ where: { date: dateOnly } });
  if (picks.length > 0) {
    await prisma.pick.createMany({
      data: picks.map((p) => ({
        date: dateOnly,
        sport: p.sport,
        league: p.league,
        event: p.event,
        market: p.market,
        selection: p.selection,
        odds: p.odds,
        confidence: p.confidence,
        reasoning: p.reasoning,
        sourceUrls: p.sourceUrls,
      })),
    });
  }

  return { count: picks.length, date: todayIso };
}
