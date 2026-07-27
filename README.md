# Pronostics App

Application iPhone personnelle, 100% gratuite, qui affiche des pronostics de paris sportifs : une liste **quotidienne** de 5 pronostics (matchs des prochaines 24h) et une liste **hebdomadaire** de 10 pronostics (générée chaque mardi, matchs des 7 prochains jours). Les pronostics sont calculés automatiquement (sans IA payante) à partir des cotes réelles fournies par [The Odds API](https://the-odds-api.com) (plan gratuit, 500 requêtes/mois, sans carte bancaire).

## Structure

```
pronostics-app/
  server/   Backend Next.js + Prisma/PostgreSQL — génère et sert les pronostics
  app/      App mobile Expo (React Native) — affiche les pronostics du jour
```

## 1. Backend (`server/`)

### Base de données

Une base PostgreSQL locale `pronostics_app` a déjà été créée (via Postgres.app). Le fichier `server/.env` pointe dessus.

```sh
cd server
npm install
npx prisma migrate dev --name init   # crée la table Pick
```

### Clé API gratuite (The Odds API)

1. Va sur https://the-odds-api.com et clique sur **Get API Key** (formulaire e-mail, pas de carte bancaire).
2. Copie la clé reçue par e-mail.
3. Ajoute-la dans `server/.env` :

```
ODDS_API_KEY="ta-clé"
ODDS_API_REGIONS="eu"
```

### Générer les pronostics du jour (manuellement, pour tester)

```sh
npm run generate:picks
```

Ce script priorise le **football**, toutes divisions confondues (championnats majeurs comme Ligue 1/Liga/Bundesliga/Serie A, mais aussi D2/D3 — Championship, Ligue 2, Bundesliga 2, Serie B... — et les qualifications européennes), et ne complète avec d'autres sports (basket, hockey, football US, baseball, MMA) que s'il manque des matchs pour arriver à 5, par exemple pendant les trêves internationales.

1. Récupère la liste de **toutes** les ligues de foot actuellement en saison (pas seulement l'élite).
2. Pour chacune, récupère les cotes moyennées sur plusieurs bookmakers via The Odds API — marché "1X2 / vainqueur du match" et "nombre de buts (Over/Under)" — en filtrant sur les matchs des prochaines 24h directement au niveau de la requête (`commenceTimeFrom`/`commenceTimeTo`).
3. Calcule une probabilité implicite par issue (à partir de la cote moyenne, normalisée entre les issues possibles) et retient le favori de chaque marché comme candidat pronostic — en exigeant au moins 5 bookmakers en accord sur la cote (sinon le marché est jugé trop peu liquide/fiable pour être retenu). Aucune cote n'est exclue par ailleurs : l'objectif est de maximiser le taux de réussite, donc un favori à cote très faible (ex. 1.05) reste un bon candidat.
4. Garde les 5 candidats de foot avec la plus haute confiance, tous championnats confondus. S'il y en a moins de 5, comble avec les autres sports suivis (mêmes règles) pour arriver à 5.
5. Stocke le résultat en base (remplace les pronostics du jour s'ils existaient déjà).

**Coût** : The Odds API ne facture **pas** les requêtes qui ne retournent aucun match (vérifié via l'en-tête `x-requests-last: 0`) — on peut donc interroger toutes les ligues actives (~40 au total) sans payer pour celles qui ne jouent pas ce jour-là. Seules les ligues avec un match effectif coûtent des crédits (2 pour le foot — 1X2 + buts —, 1 pour les autres sports), avec un plafond de sécurité large (60 ligues de foot payantes max, 6 autres sports max par exécution) qui ne limite pas la recherche en pratique — il sert juste à éviter un pic de coût extrême un jour exceptionnel.

Chaque pronostic affiche aussi la **date et l'heure du match** (`matchTime`), converties automatiquement dans le fuseau horaire du téléphone côté app.

Cartons et corners ne sont pas encore couverts : ce sont des marchés "additionnels" chez The Odds API qui nécessitent d'interroger chaque match individuellement (bien plus coûteux en crédits) — à ajouter plus tard si besoin, avec une limite stricte du nombre de matchs concernés pour rester gratuit.

### Vérifier les résultats et mesurer le taux de réussite

```sh
npm run check:results   # va chercher le score réel des matchs joués et corrige chaque pronostic PENDING en WON/LOST/PUSH
npm run stats           # affiche le taux de réussite mesuré (WON / (WON + LOST))
```

`check:results` est aussi appelé automatiquement au début du cron quotidien `generate-picks` (pas de cron dédié : le plan Vercel Hobby limite à 2 crons/jour, déjà pris par `generate-picks` et `generate-weekly-picks`). Un match reporté/annulé, ou introuvable après 3 jours, passe en `VOID` plutôt que de rester bloqué en `PENDING` indéfiniment. Les pronostics générés avant cette fonctionnalité n'ont pas les données nécessaires (`sportKey`/`eventId`) pour être corrigés automatiquement et resteront `PENDING`.

### Lancer le serveur

```sh
npm run dev
```

L'app mobile appelle `GET /api/picks/today` pour récupérer les pronostics du jour.

### Génération automatique quotidienne (en local, si tu n'utilises pas Vercel)

Si tu préfères garder le backend en local plutôt que de le déployer (section 3), le plus fiable sur macOS est `launchd` (le cron classique a des limitations de permissions). Crée `~/Library/LaunchAgents/com.pronostics.generate.plist` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pronostics.generate</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>generate:picks</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/mohamedalibenmansour/pronostics-app/server</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/pronostics-generate.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/pronostics-generate.log</string>
</dict>
</plist>
```

Puis :

```sh
launchctl load ~/Library/LaunchAgents/com.pronostics.generate.plist
```

Ça lance la génération chaque jour à 7h00 (le Mac doit être allumé). Ajuste `/usr/local/bin/npm` si besoin (`which npm`).

## 2. Déployer le backend en ligne, gratuitement (Vercel)

Ça rend l'API des pronostics accessible partout (pas seulement sur ton Wi-Fi) et supprime le besoin de laisser ton Mac allumé pour la génération quotidienne. 100% gratuit sur le plan Hobby de Vercel (le cron gratuit est limité à 1 exécution/jour — parfait pour ce besoin).

### a. Pousser le code sur GitHub

1. Crée un dépôt vide sur https://github.com/new (ex. `pronostics-app`), **sans** README/gitignore (déjà présents ici).
2. Depuis `~/pronostics-app` :
   ```sh
   git remote add origin https://github.com/<ton-user>/pronostics-app.git
   git branch -M main
   git push -u origin main
   ```

### b. Créer le projet sur Vercel

1. Va sur https://vercel.com, connecte-toi (via GitHub, gratuit).
2. **Add New → Project**, importe le dépôt `pronostics-app`.
3. **Important** : dans les paramètres du projet, mets **Root Directory** = `server` (le monorepo a le backend dans ce sous-dossier).
4. Ne clique pas encore sur Deploy — configure d'abord la base de données et les variables (étapes suivantes).

### c. Base de données PostgreSQL gratuite

1. Dans le projet Vercel → onglet **Storage** → **Create Database** (Postgres via Neon ou Supabase, plan gratuit).
2. Une fois créée, connecte-la au projet (bouton **Connect**) — Vercel injecte automatiquement les variables `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` / `POSTGRES_PRISMA_URL` (ou `DATABASE_URL` selon le fournisseur) dans les variables d'environnement du projet.

> **Important** : après avoir connecté la base, il faut redéployer manuellement (Deployments → `⋯` → Redeploy) pour que les nouvelles variables soient prises en compte — les connecter ne redéploie pas automatiquement.

### d. Variables d'environnement

Dans **Settings → Environment Variables** du projet Vercel, ajoute :

```
ODDS_API_KEY=<ta clé The Odds API>
ODDS_API_REGIONS=eu
CRON_SECRET=f48adcc66a0946f7a4e2b88ece9a28e82e0bba6d3903b9ea58c3c161c3990c32
```

(`DATABASE_URL` est déjà présent grâce à l'étape précédente.) Le `CRON_SECRET` ci-dessus a été généré pour toi — garde-le tel quel ou régénère le tien avec `openssl rand -hex 32`.

### e. Déployer

Clique sur **Deploy**. Le script `build` (`prisma generate && prisma migrate deploy && next build`) crée automatiquement la table `Pick` sur la nouvelle base au premier déploiement.

Une fois déployé, Vercel te donne une URL du type `https://pronostics-app-wq1e.vercel.app`. Deux crons définis dans `vercel.json` génèrent les pronostics automatiquement — plus besoin de ton Mac :
- `/api/cron/generate-picks` — tous les jours à 7h UTC (liste quotidienne, `GET /api/picks/today`)
- `/api/cron/generate-weekly-picks` — chaque mardi à 6h UTC (liste hebdomadaire, `GET /api/picks/week`)

Pour tester manuellement la génération sur le déploiement :
```sh
curl -H "Authorization: Bearer <ton CRON_SECRET>" https://pronostics-app-wq1e.vercel.app/api/cron/generate-picks
curl -H "Authorization: Bearer <ton CRON_SECRET>" https://pronostics-app-wq1e.vercel.app/api/cron/generate-weekly-picks
```

### f. Redéployer après un changement

```sh
git add -A && git commit -m "..." && git push
```
Vercel redéploie automatiquement à chaque push sur `main`.

### Dépannage

- **Page 404 partout malgré un build vert** : va dans **Settings → General → Framework Preset** et vérifie que c'est bien réglé sur **Next.js** (pas "Other"). Ça peut rester sur "Other" si Root Directory a été changé après l'import initial — il faut le sélectionner manuellement, sauvegarder, puis redéployer.
- **`prisma migrate deploy` reste bloqué (timeout après ~45 min)** : la connexion utilisée passe par le pooler (PgBouncer) au lieu de la connexion directe — déjà corrigé dans `prisma.config.ts` (utilise `POSTGRES_URL_NON_POOLING`), mais si le fournisseur ne fournit pas cette variable, vérifie son nom exact dans Storage → ta base → onglet ".env.local".
- **Erreur `self-signed certificate in certificate chain`** : le pooler Supabase utilise une chaîne de certificats non reconnue par Node — déjà corrigé dans `src/lib/prisma.ts` (`sslmode=no-verify` + `ssl: { rejectUnauthorized: false }`).
- **Redirection vers une page de login Vercel** : la protection **Deployment Protection → Vercel Authentication** est activée — désactive-la (ou limite-la aux Preview) dans Settings pour que l'app soit accessible publiquement.

## 3. App mobile (`app/`)

```sh
cd app
npm install
```

Vérifie `app/.env` — `EXPO_PUBLIC_API_URL` doit pointer vers ton backend :

- **Backend déployé sur Vercel (section 2)** — utilise directement l'URL Vercel, ça marche partout (Wi-Fi ou 4G) :
  ```
  EXPO_PUBLIC_API_URL=https://pronostics-app-wq1e.vercel.app
  ```
- **Backend en local** — utilise l'IP locale de ton Mac, pas `localhost` (l'iPhone est un appareil différent sur le réseau), et l'iPhone doit être sur le même Wi-Fi :
  ```
  EXPO_PUBLIC_API_URL=http://192.168.0.36:3000
  ```
  Si ton IP change (reconnexion Wi-Fi), retrouve-la avec `ipconfig getifaddr en0` et mets à jour ce fichier.

### Lancer sur ton iPhone via Expo Go

1. Installe l'app **Expo Go** depuis l'App Store sur ton iPhone.
2. Assure-toi que ton iPhone et ton Mac sont sur le **même réseau Wi-Fi**.
3. Sur le Mac :
   ```sh
   cd app
   npx expo start
   ```
4. Un QR code s'affiche dans le terminal. Scanne-le avec l'appareil photo de ton iPhone (ou directement dans Expo Go) — l'app s'ouvre.
5. Le serveur backend (`npm run dev` dans `server/`) doit être lancé pour que l'app puisse récupérer les pronostics.

Aucun compte développeur Apple n'est nécessaire pour ce mode de test.

## Notes

- Usage personnel, mono-utilisateur — pas d'authentification.
- Contenu à but informatif uniquement, sans garantie de résultat.
