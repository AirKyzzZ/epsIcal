import "dotenv/config";
import { writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { scrapeEDT } from "./scraper.js";
import { parseEdtEvents, deduplicateEvents } from "./parser.js";
import { generateIcal } from "./generator.js";
import { startServer } from "./server.js";
import { publishToGhPages } from "./publish.js";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const CALENDAR_PATH = path.join(DATA_DIR, "calendar.ics");

function getConfig() {
  const username = process.env.CAS_USERNAME;
  const password = process.env.CAS_PASSWORD;
  const port = parseInt(process.env.PORT || "3333", 10);

  if (!username || !password) {
    console.error(
      "Missing CAS_USERNAME or CAS_PASSWORD in .env\nCopy .env.example to .env and fill in your credentials."
    );
    process.exit(1);
  }

  return { username, password, port };
}

async function runScrape() {
  const { username, password } = getConfig();

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  console.log("[epsIcal] Starting scrape...");
  const rawItems = await scrapeEDT(username, password);

  let allEvents = parseEdtEvents(rawItems);
  allEvents = deduplicateEvents(allEvents);

  // Sort by date then start time
  allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

  console.log(`[epsIcal] ${allEvents.length} unique events found`);

  const ics = generateIcal(allEvents);
  await writeFile(CALENDAR_PATH, ics);
  console.log(`[epsIcal] Calendar saved to ${CALENDAR_PATH}`);

  return allEvents.length;
}

const command = process.argv[2];

switch (command) {
  case "scrape": {
    await runScrape();
    await publishToGhPages();
    break;
  }

  case "serve": {
    const { port } = getConfig();
    startServer(port, async () => {
      await runScrape();
      await publishToGhPages();
    });
    break;
  }

  default: {
    console.log(`
epsIcal - Sync your EPSI schedule to any calendar app

Usage:
  npx tsx src/index.ts scrape    Scrape EDT and generate calendar.ics
  npx tsx src/index.ts serve     Start HTTP server (serves calendar.ics)

Or use npm scripts:
  npm run scrape                 Run scraper once
  npm run serve                  Start server
  npm run dev                    Start server with hot-reload
`);
  }
}
