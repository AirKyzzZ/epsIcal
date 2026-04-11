import "dotenv/config";
import { writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { scrapeEDT } from "./scraper.js";
import { parseEdtEvents, deduplicateEvents } from "./parser.js";
import { generateIcal } from "./generator.js";
import { startServer, type RefreshState } from "./server.js";
import { publishToGhPages } from "./publish.js";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const CALENDAR_PATH = path.join(DATA_DIR, "calendar.ics");

function ts(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

function logErr(msg: string): void {
  console.error(`[${ts()}] ${msg}`);
}

function getConfig() {
  const username = process.env.CAS_USERNAME;
  const password = process.env.CAS_PASSWORD;
  const port = parseInt(process.env.PORT || "3333", 10);
  const intervalHours = parseFloat(process.env.REFRESH_INTERVAL_HOURS || "6");

  if (!username || !password) {
    console.error(
      "Missing CAS_USERNAME or CAS_PASSWORD in .env\nCopy .env.example to .env and fill in your credentials."
    );
    process.exit(1);
  }

  return { username, password, port, intervalHours };
}

async function runScrape(): Promise<number> {
  const { username, password } = getConfig();

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  log("[epsIcal] Starting scrape...");
  const rawItems = await scrapeEDT(username, password);

  let allEvents = parseEdtEvents(rawItems);
  allEvents = deduplicateEvents(allEvents);
  allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

  log(`[epsIcal] ${allEvents.length} unique events found`);

  if (allEvents.length === 0) {
    throw new Error(
      "[epsIcal] Scrape produced 0 events — refusing to overwrite calendar. " +
        "Likely causes: expired CAS session, Wigor API change, or a parser regression."
    );
  }

  const ics = generateIcal(allEvents);
  await writeFile(CALENDAR_PATH, ics);
  log(`[epsIcal] Calendar saved to ${CALENDAR_PATH}`);

  return allEvents.length;
}

function createRefreshRunner(state: RefreshState) {
  let inFlight: Promise<void> | null = null;

  return async function refresh(): Promise<void> {
    if (inFlight) {
      log("[refresh] Already in progress, joining existing run");
      return inFlight;
    }

    inFlight = (async () => {
      state.status = "running";
      state.startedAt = ts();
      try {
        const count = await runScrape();
        try {
          await publishToGhPages();
        } catch (err) {
          // Publish failures must not mask a successful scrape — log and continue.
          const message = err instanceof Error ? err.message : String(err);
          logErr(`[refresh] publish failed: ${message}`);
          state.lastPublishError = message;
        }
        state.status = "ok";
        state.lastSuccessAt = ts();
        state.lastEventCount = count;
        state.lastError = null;
        log(`[refresh] OK (${count} events)`);
      } catch (err) {
        const message = err instanceof Error ? err.stack || err.message : String(err);
        state.status = "error";
        state.lastError = message;
        state.lastErrorAt = ts();
        logErr(`[refresh] FAILED: ${message}`);
        throw err;
      } finally {
        state.finishedAt = ts();
      }
    })();

    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };
}

const command = process.argv[2];

switch (command) {
  case "scrape": {
    await runScrape();
    await publishToGhPages();
    break;
  }

  case "serve": {
    const { port, intervalHours } = getConfig();

    const state: RefreshState = {
      status: "idle",
      startedAt: null,
      finishedAt: null,
      lastSuccessAt: null,
      lastError: null,
      lastErrorAt: null,
      lastEventCount: null,
      lastPublishError: null,
    };

    const refresh = createRefreshRunner(state);

    startServer(port, refresh, state);

    // Kick off an initial refresh a few seconds after boot so the first scrape
    // doesn't race server startup.
    const runScheduled = () => {
      refresh().catch(() => {
        // Errors are already logged + surfaced via state; swallow here so the
        // scheduler interval keeps firing.
      });
    };

    const intervalMs = Math.max(intervalHours, 0.25) * 60 * 60 * 1000;
    log(`[scheduler] Auto-refresh every ${intervalHours}h (first run in 5s)`);
    setTimeout(runScheduled, 5_000);
    setInterval(runScheduled, intervalMs);
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
