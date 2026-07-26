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
4. Garde les 5 matchs à venir dans les prochaines 36h avec la plus haute confiance, et stocke le résultat en base (remplace les pronostics du jour s'ils existaient déjà).

Coût : au plus 12 crédits par exécution (1 crédit = 1 sport interrogé), soit ~360/mois en lançant le script chaque jour — sous le quota gratuit de 500/mois.

### Lancer le serveur

```sh
npm run dev
```

L'app mobile appelle `GET /api/picks/today` pour récupérer les pronostics du jour.

### Génération automatique quotidienne

Le plus fiable sur macOS est `launchd` (le cron classique a des limitations de permissions). Crée `~/Library/LaunchAgents/com.pronostics.generate.plist` :

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

## 2. App mobile (`app/`)

```sh
cd app
npm install
```

Vérifie `app/.env` — `EXPO_PUBLIC_API_URL` doit pointer vers l'IP locale de ton Mac (pas `localhost`, car l'iPhone est un appareil différent sur le réseau) :

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
