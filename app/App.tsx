import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type Period = "today" | "week";

type Pick = {
  id: string;
  sport: string;
  league: string | null;
  event: string;
  matchTime: string;
  market: string;
  selection: string;
  odds: number | null;
  confidence: number;
  reasoning: string;
};

function formatMatchTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

export default function App() {
  const [period, setPeriod] = useState<Period>("today");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPicks = useCallback(async (p: Period) => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/picks/${p}`);
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      const data = await res.json();
      setPicks(data.picks);
      setDate(data.date ?? "");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de contacter le serveur. Vérifie EXPO_PUBLIC_API_URL.",
      );
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPicks(period).finally(() => setLoading(false));
  }, [period, fetchPicks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPicks(period).finally(() => setRefreshing(false));
  }, [period, fetchPicks]);

  const onRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/picks/${period}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur serveur (${res.status})`);
      await fetchPicks(period);
      Alert.alert("Pronostics régénérés", `${data.count} pronostic(s) généré(s).`);
    } catch (e) {
      Alert.alert(
        "Échec de la régénération",
        e instanceof Error ? e.message : "Impossible de contacter le serveur.",
      );
    } finally {
      setRegenerating(false);
    }
  }, [period, fetchPicks]);

  const emptyMessage =
    period === "today"
      ? "Aucun pronostic pour aujourd'hui pour le moment."
      : "Aucun pronostic pour cette semaine pour le moment.";

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Pronostics</Text>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, period === "today" && styles.tabActive]}
          onPress={() => setPeriod("today")}
        >
          <Text style={[styles.tabText, period === "today" && styles.tabTextActive]}>
            Aujourd&apos;hui
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, period === "week" && styles.tabActive]}
          onPress={() => setPeriod("week")}
        >
          <Text style={[styles.tabText, period === "week" && styles.tabTextActive]}>
            Cette semaine
          </Text>
        </Pressable>
      </View>

      <View style={styles.dateRow}>
        {!!date && <Text style={styles.date}>{date}</Text>}
        <Pressable
          style={[styles.regenerateButton, regenerating && styles.regenerateButtonDisabled]}
          onPress={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.regenerateText}>Régénérer</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : picks.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.empty}>{emptyMessage}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {picks.map((pick) => (
            <View key={pick.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.sport}>
                  {pick.sport}
                  {pick.league ? ` · ${pick.league}` : ""}
                </Text>
                <Text style={styles.confidence}>{pick.confidence}%</Text>
              </View>
              <Text style={styles.event}>{pick.event}</Text>
              <Text style={styles.matchTime}>{formatMatchTime(pick.matchTime)}</Text>
              <Text style={styles.selection}>
                {pick.market} — {pick.selection}
              </Text>
              {pick.odds != null && (
                <Text style={styles.odds}>Cote : {pick.odds}</Text>
              )}
              <Text style={styles.reasoning}>{pick.reasoning}</Text>
            </View>
          ))}
          <Text style={styles.disclaimer}>
            À titre informatif uniquement — aucune garantie de gain. Jouez
            avec modération.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0f19",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#151b2b",
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#2b3552",
  },
  tabText: {
    color: "#8a93a6",
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#fff",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  date: {
    fontSize: 14,
    color: "#8a93a6",
  },
  regenerateButton: {
    backgroundColor: "#2b3552",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  regenerateButtonDisabled: {
    opacity: 0.6,
  },
  regenerateText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  loader: {
    marginTop: 40,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  error: {
    color: "#ff6b6b",
    textAlign: "center",
  },
  empty: {
    color: "#8a93a6",
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  card: {
    backgroundColor: "#151b2b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sport: {
    color: "#8a93a6",
    fontSize: 12,
    textTransform: "uppercase",
  },
  confidence: {
    color: "#4ade80",
    fontWeight: "700",
    fontSize: 12,
  },
  event: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 2,
  },
  matchTime: {
    color: "#6b90ff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  selection: {
    color: "#d6dbe6",
    fontSize: 14,
    marginBottom: 8,
  },
  odds: {
    color: "#8a93a6",
    fontSize: 13,
    marginBottom: 8,
  },
  reasoning: {
    color: "#aeb4c2",
    fontSize: 13,
    lineHeight: 18,
  },
  disclaimer: {
    color: "#5b6272",
    fontSize: 11,
    textAlign: "center",
    marginVertical: 20,
  },
});
