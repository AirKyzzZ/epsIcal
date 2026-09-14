# epsIcal

Synchronise ton emploi du temps EPSI (Hyperplanning) avec Apple Calendar, Google Calendar, ou n'importe quelle app compatible iCal.

Hyperplanning publie deja un `.ics`, mais il est illisible dans un calendrier : chaque evenement s'appelle `Autonomie - MSPR: Dvp et deploiement d'une application dans le respect du cahier des charges Client // Developpement applicatif utilisant une API IA - CHAILLOU - BAC+3 CDA DevFS 1S2S 26/27 EPSI BDX`. epsIcal recupere ce flux, raccourcit les titres, nettoie les salles et les descriptions, et republie un `.ics` propre.

## Fonctionnement

```
fetch(HP_ICAL_URL) -> parse ICS -> raccourcit + nettoie -> genere .ics -> publie sur gh-pages
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

## Titres des evenements

epsIcal compose un titre court, lisible meme tronque dans une vue semaine :

```
📘 Methodologie Agile & DevOps · F207
🛠 Scrum · F207
🛠 Docker (classe inversee) · F110
🎯 MSPR Mise en production
🏠 MSPR Dvp & deploiement + API IA
```

L'emoji encode le type de seance :

| Emoji | Type |
|-------|------|
| 📘 | Cours |
| 🛠 | Atelier, workshop, classe inversee |
| 🎯 | MSPR, dossier, evaluation |
| 🏠 | Autonomie |
| 👥 | Vie de classe, conseil pedagogique |

Le nom est raccourci en retirant le prefixe de type (`Atelier `, `Classe inversee - `, `Autonomie - `, `Workshop - `). Au dela de 48 caracteres il est coupe sur une frontiere de mot, et le run le signale :

```
[epsIcal] 2 course name(s) truncated — add a short label in course-names.json:
[epsIcal]   "Architecture applicative : structuration des services et de la persistance"
```

`course-names.json` est la table de libelles courts, clef = nom Hyperplanning exact :

```json
{
  "Architecture applicative : structuration des services et de la persistance": "Architecture applicative",
  "Classe inversee - Le langage SQL & SGBD": "SQL & SGBD (classe inversee)"
}
```

Les apostrophes courbes et les espaces doubles sont normalises avant la recherche, pas besoin de recopier les bizarreries du flux.

La description garde le nom complet, le type en clair, l'intervenant, le groupe et la salle. Le lien Teams, quand il existe, part dans le champ `URL` pour donner un bouton cliquable. Les salles fantomes d'autonomie (`SALLE_20 (0)`, capacite zero) restent dans la description mais sortent du titre.

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
npm test        # parse un fixture reel : horaires, salles, titres, descriptions
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

Le scrape tourne tous les matins via GitHub Actions (`.github/workflows/scrape.yml`, cron `0 4 * * *`, soit 06:00 a Paris l'ete et 05:00 l'hiver). Il lui faut le secret `HP_ICAL_URL` :

```bash
gh secret set HP_ICAL_URL
gh workflow run scrape && gh run watch   # run manuel
```

> GitHub desactive un workflow planifie apres 60 jours sans commit sur le repo. Un `workflow_dispatch` ou un commit le reactive.

L'ancien timer systemd sur le VPS `clawdbot` faisait le meme travail. Garde un seul publieur pour eviter que les deux se marchent dessus :

```bash
ssh clawdbot 'systemctl disable --now epsical-scrape.timer'
```

## Stack

- **TypeScript** — tout le code
- **ical-generator** — generation du `.ics`
- **Hono** — serveur HTTP minimal

## Troubleshooting

### "Missing HP_ICAL_URL in .env"

Cree `.env` a partir de `.env.example` et colle ton URL iCal. Voir [Configuration](#configuration).

### "Hyperplanning returned HTTP 404"

Le token `icalsecurise` a ete regenere. Retourne sur ton espace, reclique sur `.ical`, recopie l'adresse dans `.env`.

### Un titre est coupe avec un "…"

Aucune regle ne raccourcit ce cours assez. Ajoute un libelle court dans `course-names.json`, le nom exact a copier est dans le log du run. Voir [Titres des evenements](#titres-des-evenements).

### Le calendrier semble incomplet

Hyperplanning n'exporte que les semaines **publiees** par l'ecole. Les semaines pas encore publiees n'apparaissent nulle part, ni dans l'export ni dans l'espace.

### Les horaires sont decales

Hyperplanning emet des instants UTC (`...Z`) et epsIcal les republie tels quels, sans conversion. Si les heures sont fausses, compare `DTSTART` dans `data/calendar.ics` avec l'espace Hyperplanning avant de suspecter le code.

## Licence

MIT
