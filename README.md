# epsIcal

Synchronise ton emploi du temps EPSI (Hyperplanning) avec Apple Calendar, Google Calendar, ou n'importe quelle app compatible iCal.

Hyperplanning publie deja un `.ics`, mais il est illisible dans un calendrier : chaque evenement s'appelle `26-031-NAT-M0175 - COURAUD - BAC+3 ALL 26/27 EPSI BDX`. epsIcal recupere ce flux, remplace les codes par de vrais noms de cours, nettoie les salles et les descriptions, et republie un `.ics` propre.

## Fonctionnement

```
fetch(HP_ICAL_URL) -> parse ICS -> renomme + nettoie -> genere .ics -> publie sur gh-pages
```

Pas de scraping, pas de navigateur, pas de login. L'URL iCal d'Hyperplanning contient un token personnel qui sert d'authentification.

## Prerequis

- [Node.js](https://nodejs.org/) 20+
- npm

## Installation

```bash
git clone https://github.com/AirKyzzZ/epsIcal.git
cd epsIcal
npm install
```

## Configuration

Recupere ton URL iCal depuis Hyperplanning :

1. Ouvre ton espace etudiant (le lien direct avec ton `identifiant`)
2. Clique sur l'icone **`.ical`** en haut a droite
3. Sous *"Synchroniser l'emploi du temps"*, clique **Copier l'adresse**

Puis :

```bash
cp .env.example .env
```

Edite `.env` :

```env
HP_ICAL_URL=https://cd-XXXX.hyperplanning.fr/hp/Telechargements/ical/Edt_NOM.ics?version=...&icalsecurise=...&param=...
PORT=3333
```

> L'URL contient un token personnel (`icalsecurise`). Ne la commit jamais, ne la partage pas : elle donne acces a ton emploi du temps complet.

## Noms de cours

Hyperplanning ne publie que des codes (`26-031-NAT-M0175`), jamais le nom du cours. `course-names.json` fait la traduction :

```json
{
  "26-031-NAT-M0171": "Cybersecurite appliquee au developpement",
  "26-031-NAT-M0244": "PHP Framework Symfony",
  "26-031-NAT-M0252": ""
}
```

Un code sans nom retombe sur `CODE · INTERVENANT`, donc rien ne casse si le fichier est incomplet. A chaque `npm run scrape` le log indique combien de noms sont remplis :

```
[epsIcal] course names filled in: 12/42
```

Quand un nouveau code apparait en cours d'annee, ajoute-le au fichier.

### Reference des codes

Intervenant et nombre de seances pour chaque code de l'annee 2026-2027, du plus frequent au moins frequent.

| Code | Intervenant | Seances |
|------|-------------|---------|
| `26-031-NAT-M0171` | ALZATE | 10 |
| `26-031-NAT-M0244` | BEDARD | 10 |
| `26-031-NAT-M0252` | ROBERT | 10 |
| `25-031-NAT-M0384` | VERDOIS | 8 |
| `26-031-NAT-M0255` | VALAT | 7 |
| `25-031-NAT-M0385` | PEYNEAU | 6 |
| `26-031-NAT-M0050` | JAMBOR | 6 |
| `26-031-NAT-M0175` | COURAUD | 6 |
| `26-031-NAT-M0242` | TECHER | 6 |
| `26-031-NAT-M0245` | BEDARD | 6 |
| `26-031-NAT-M0251` | GABAS | 6 |
| `26-031-NAT-M0253` | ROBERT | 6 |
| `25-031-NAT-M0376` | LADRAT | 5 |
| `25-031-NAT-M0381` | JAMBOR | 5 |
| `26-031-NAT-M0158` | JAMBOR | 5 |
| `26-031-NAT-M0161` | JAMBOR | 5 |
| `26-031-NAT-M0164` | GRAFFIN | 5 |
| `26-031-NAT-M0246` | TECHER | 5 |
| `26-031-NAT-M0248` | GABAS | 5 |
| `26-031-NAT-M0162` | LABASSE | 4 |
| `26-031-NAT-M0177` | GABAS | 4 |
| `26-031-NAT-M0178` | LADRAT | 4 |
| `26-031-NAT-M0183` | LABASSE | 4 |
| `26-031-NAT-M0239` | COURAUD | 4 |
| `26-031-NAT-M0243` | LABASSE | 4 |
| `26-031-NAT-M0157` | MALDONADO | 3 |
| `26-031-NAT-M0163` | TECHER | 3 |
| `26-031-NAT-M0176` | ALZATE | 3 |
| `26-031-NAT-M0240` | CHAILLOU | 3 |
| `26-031-NAT-M0250` | ROBERT | 3 |
| `26-031-NAT-M0256` | JAMBOR | 3 |
| `25-010-NAT-M0012` | CHAILLOU | 2 |
| `25-032-NAT-M0108` | JAMBOR | 2 |
| `26-031-NAT-M0159` | BEDARD | 2 |
| `26-031-NAT-M0179` | MALDONADO | 2 |
| `26-031-NAT-M0180` | LABASSE | 2 |
| `26-031-NAT-M0181` | LE BARS | 2 |
| `26-031-NAT-M0182` | LE BARS | 2 |
| `26-031-NAT-M0184` | LABASSE | 2 |
| `26-031-NAT-M0249` | CHAILLOU | 2 |
| `25-010-NAT-M0069` | CHESNEAU | 1 |
| `25-010-NAT-M0082` | JAMBOR | 1 |

## Utilisation

### Recuperer et generer

```bash
npm run scrape
```

Genere `data/calendar.ics` et le publie sur `gh-pages`.

### Lancer le serveur

```bash
npm run serve
```

| Route | Description |
|-------|-------------|
| `/` | Page d'accueil |
| `/calendar.ics` | Le fichier iCal |
| `/health` | Health check |
| `/refresh` | Force une mise a jour |

### Tests

```bash
npm test        # parse un fixture reel et verifie les horaires, salles, UID
npm run typecheck
```

## S'abonner au calendrier

L'URL publique est `https://airkyzzz.github.io/epsIcal/calendar.ics`.

### Apple Calendar (Mac)

1. `Fichier` > `Nouvel abonnement...`
2. Colle l'URL
3. Rafraichissement automatique : "Chaque jour"

### Apple Calendar (iPhone/iPad)

1. `Reglages` > `Applications` > `Calendrier` > `Comptes` > `Ajouter un compte`
2. `Autre` > `Ajouter un calendrier avec abonnement`
3. Colle l'URL

### Google Calendar

`Autres calendriers` > `A partir de l'URL` > colle l'URL.

> Google rafraichit les abonnements toutes les 12-24h.

## Deploiement

Le scrape tourne quotidiennement sur le VPS `clawdbot` via systemd.

```bash
ssh clawdbot 'systemctl list-timers epsical-scrape.timer'   # prochain run
ssh clawdbot 'journalctl -u epsical-scrape.service -n 50'   # logs
ssh clawdbot 'cd /root/epsIcal && npm run scrape'           # refresh manuel
```

Le workflow GitHub Actions (`.github/workflows/scrape.yml`) est en `workflow_dispatch` seul, comme fallback manuel. Il lui faut le secret `HP_ICAL_URL`.

## Stack

- **TypeScript** — tout le code
- **ical-generator** — generation du `.ics`
- **Hono** — serveur HTTP minimal

## Troubleshooting

### "Missing HP_ICAL_URL in .env"

Cree `.env` a partir de `.env.example` et colle ton URL iCal. Voir [Configuration](#configuration).

### "Hyperplanning returned HTTP 404"

Le token `icalsecurise` a ete regenere. Retourne sur ton espace, reclique sur `.ical`, recopie l'adresse dans `.env`.

### Les titres affichent des codes au lieu des noms

`course-names.json` est incomplet pour ces codes. Voir [Noms de cours](#noms-de-cours).

### Le calendrier semble incomplet

Hyperplanning n'exporte que les semaines **publiees** par l'ecole. Les semaines pas encore publiees n'apparaissent nulle part, ni dans l'export ni dans l'espace.

### Les horaires sont decales

Hyperplanning emet des instants UTC (`...Z`) et epsIcal les republie tels quels, sans conversion. Si les heures sont fausses, compare `DTSTART` dans `data/calendar.ics` avec l'espace Hyperplanning avant de suspecter le code.

## Licence

MIT
