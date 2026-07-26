# Pronostics App

Application iPhone personnelle, 100% gratuite, qui affiche chaque jour jusqu'à 5 pronostics de paris sportifs. Les pronostics sont calculés automatiquement (sans IA payante) à partir des cotes réelles fournies par [The Odds API](https://the-odds-api.com) (plan gratuit, 500 requêtes/mois, sans carte bancaire).

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

Ce script :
1. Récupère la liste des sports/ligues actuellement en saison (foot, basket, hockey, football US, baseball, tennis, MMA), en priorisant les grandes ligues (EPL, Liga, NBA, NFL, MLB...) quand elles jouent, et en couvrant automatiquement d'autres compétitions actives sinon (ex. MLB et CFL en été).
2. Pour chacun, récupère les cotes "1X2 / vainqueur du match" moyennées sur plusieurs bookmakers via The Odds API.
3. Calcule une probabilité implicite par équipe (à partir de la cote moyenne, normalisée entre les issues possibles) et retient le favori de chaque match comme pronostic.
4. Garde les 5 matchs à venir dans les prochaines 48h avec la plus haute confiance, et stocke le résultat en base (remplace les pronostics du jour s'ils existaient déjà).

Coût : au plus 12 crédits par exécution (1 crédit = 1 sport interrogé), soit ~360/mois en lançant le script chaque jour — sous le quota gratuit de 500/mois.

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

1. Dans le projet Vercel → onglet **Storage** → **Create Database** → **Postgres** (propulsé par Neon, plan gratuit).
2. Une fois créée, connecte-la au projet (bouton **Connect**) — Vercel injecte automatiquement `DATABASE_URL` dans les variables d'environnement du projet.

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

Une fois déployé, Vercel te donne une URL du type `https://pronostics-app-xxxx.vercel.app`. Le cron défini dans `vercel.json` (`/api/cron/generate-picks`, tous les jours à 7h UTC) génère les pronostics automatiquement — plus besoin de ton Mac.

Pour tester manuellement la génération sur le déploiement :
```sh
curl -H "Authorization: Bearer <ton CRON_SECRET>" https://pronostics-app-xxxx.vercel.app/api/cron/generate-picks
```

### f. Redéployer après un changement

```sh
git add -A && git commit -m "..." && git push
```
Vercel redéploie automatiquement à chaque push sur `main`.

## 3. App mobile (`app/`)

```sh
cd app
npm install
```

Vérifie `app/.env` — `EXPO_PUBLIC_API_URL` doit pointer vers ton backend :

- **Backend déployé sur Vercel (section 2)** — utilise directement l'URL Vercel, ça marche partout (Wi-Fi ou 4G) :
  ```
  EXPO_PUBLIC_API_URL=https://pronostics-app-xxxx.vercel.app
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
