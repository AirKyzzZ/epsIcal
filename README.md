# epsIcal

Synchronise ton emploi du temps EPSI (Wigor) avec Apple Calendar, Google Calendar, ou n'importe quelle app compatible iCal.

L'outil scrape ton EDT depuis le portail Wigor, le convertit en fichier `.ics`, et le sert via un petit serveur HTTP. Tu t'abonnes a l'URL depuis ton app calendrier et c'est a jour automatiquement.

## Fonctionnalites

- Authentification CAS automatique (session sauvegardee)
- Scraping de 4 semaines (semaine courante + 3 suivantes)
- Generation d'un fichier `.ics` standard
- Serveur HTTP leger pour servir le calendrier
- Endpoint `/refresh` pour forcer une mise a jour
- Compatible avec toutes les apps calendrier (Apple Calendar, Google Calendar, Outlook, Thunderbird...)

## Prerequis

- [Node.js](https://nodejs.org/) 20+
- npm

## Installation

```bash
git clone https://github.com/maxime-mnsiet/epsIcal.git
cd epsIcal
npm install
npx playwright install chromium
```

## Configuration

Copie le fichier d'exemple et remplis tes identifiants CAS (les memes que MonCampus) :

```bash
cp .env.example .env
```

Edite `.env` :

```env
CAS_USERNAME=prenom.nom
CAS_PASSWORD=ton_mot_de_passe
PORT=3333
```

## Utilisation

### Scraper une fois

```bash
npm run scrape
```

Genere `data/calendar.ics` avec ton emploi du temps des 4 prochaines semaines.

### Lancer le serveur

```bash
npm run serve
```

Le serveur demarre sur `http://localhost:3333`. Endpoints :

| Route | Description |
|-------|-------------|
| `/` | Page d'accueil avec instructions |
| `/calendar.ics` | Le fichier iCal (pour abonnement calendrier) |
| `/health` | Health check |
| `/refresh` | Force un re-scrape |

### Developpement

```bash
npm run dev
```

Lance le serveur avec hot-reload.

## S'abonner au calendrier

### Apple Calendar (Mac)

1. Ouvre Calendar
2. `Fichier` > `Nouvel abonnement...`
3. Entre l'URL : `http://localhost:3333/calendar.ics`
4. Configure le rafraichissement automatique sur "Chaque jour"

### Apple Calendar (iPhone/iPad)

1. `Reglages` > `Calendrier` > `Comptes` > `Ajouter un compte`
2. `Autre` > `Ajouter un calendrier avec abonnement`
3. Entre l'URL du serveur
4. Valide

### Google Calendar

1. Va sur [calendar.google.com](https://calendar.google.com)
2. `Autres calendriers` > `A partir de l'URL`
3. Colle l'URL : `http://<ton-serveur>:3333/calendar.ics`

> Google Calendar rafraichit les abonnements toutes les 12-24h environ.

## Deploiement (serveur 24/7)

Pour que le calendrier soit accessible en permanence (depuis iPhone, etc.), deploie sur un serveur.

### Setup

```bash
# Sur le serveur
git clone https://github.com/maxime-mnsiet/epsIcal.git
cd epsIcal
npm install
npx playwright install chromium
# Si deps systeme manquantes pour Chromium :
npx playwright install-deps chromium
cp .env.example .env
# Edite .env avec tes identifiants
```

### Systemd (serveur HTTP)

Cree `/etc/systemd/system/epsical.service` :

```ini
[Unit]
Description=epsIcal - EDT EPSI Calendar Server
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/epsIcal
ExecStart=/usr/bin/npx tsx src/index.ts serve
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable epsical
sudo systemctl start epsical
```

### Cron (scrape quotidien)

```bash
crontab -e
```

Ajoute :

```
0 6 * * * cd /path/to/epsIcal && /usr/bin/npx tsx src/index.ts scrape >> /tmp/epsical-cron.log 2>&1
```

Le scrape tourne tous les jours a 6h du matin.

## Stack

- **TypeScript** — Tout le code
- **Playwright** — Authentification CAS + scraping
- **Cheerio** — Parsing HTML
- **ical-generator** — Generation du fichier .ics
- **Hono** — Serveur HTTP minimal

## Troubleshooting

### "Missing CAS_USERNAME or CAS_PASSWORD"

Assure-toi d'avoir cree le fichier `.env` avec tes identifiants. Voir [Configuration](#configuration).

### Le scrape echoue / "CAS authentication failed"

- Verifie tes identifiants CAS (les memes que MonCampus)
- Supprime `data/auth.json` pour forcer une re-authentification
- Le CAS peut etre temporairement indisponible

### Le calendrier est vide

- Certaines semaines n'ont pas de cours (vacances, stages)
- Essaie de forcer un refresh : `curl http://localhost:3333/refresh`

### Playwright n'arrive pas a s'installer

Sur un serveur Linux, il faut parfois installer les dependances systeme :

```bash
npx playwright install-deps chromium
```

## Licence

MIT
