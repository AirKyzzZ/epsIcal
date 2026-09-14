import "dotenv/config";
import { writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fetchHyperplanningIcs } from "./fetcher.js";
import { parseHyperplanningIcs, deduplicateEvents, type EdtEvent } from "./parser.js";
import { generateIcal } from "./generator.js";
import { loadCourseLabels, shortenCourse } from "./course-label.js";
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
  const icalUrl = process.env.HP_ICAL_URL;
  const port = parseInt(process.env.PORT || "3333", 10);
  const intervalHours = parseFloat(process.env.REFRESH_INTERVAL_HOURS || "6");

  if (!icalUrl) {
    console.error(
      "Missing HP_ICAL_URL in .env\n" +
        "Open your Hyperplanning espace, click the .ical button, and copy the " +
        "subscription address into .env as HP_ICAL_URL."
    );
    process.exit(1);
  }

  return { icalUrl, port, intervalHours };
}

function parisTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function logSummary(events: EdtEvent[]): void {
  const labels = loadCourseLabels();
  const courses = new Set(events.map((e) => e.course));
  const clumsy = [...courses].filter((c) => shortenCourse(c, labels).endsWith("…"));

  log(`[epsIcal] ${events.length} events, ${courses.size} distinct courses`);
  log(
    `[epsIcal] range: ${parisTime(events[0].start)} → ${parisTime(events[events.length - 1].start)}`
  );

  if (clumsy.length > 0) {
    log(
      `[epsIcal] ${clumsy.length} course name(s) truncated — add a short label in course-names.json:`
    );
    for (const course of clumsy) log(`[epsIcal]   ${JSON.stringify(course)}`);
  }

  for (const event of events.slice(0, 3)) {
    log(`[epsIcal]   ${parisTime(event.start)}  ${shortenCourse(event.course, labels)}  ${event.room}`);
  }
}

async function runScrape(): Promise<number> {
  const { icalUrl } = getConfig();

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  log("[epsIcal] Fetching Hyperplanning calendar...");
  const raw = await fetchHyperplanningIcs(icalUrl);

  const { events, skippedAllDay } = parseHyperplanningIcs(raw);
  const allEvents = deduplicateEvents(events);
  allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (skippedAllDay > 0) {
    log(`[epsIcal] Skipped ${skippedAllDay} all-day entries (Férié)`);
  }

  if (allEvents.length === 0) {
    throw new Error(
      "[epsIcal] Parsed 0 events — refusing to overwrite calendar. " +
        "Likely causes: a rotated HP_ICAL_URL token, or a Hyperplanning format change."
    );
  }

  logSummary(allEvents);

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
  npx tsx src/index.ts scrape    Fetch Hyperplanning and generate calendar.ics
  npx tsx src/index.ts serve     Start HTTP server (serves calendar.ics)

Or use npm scripts:
  npm run scrape                 Fetch once
  npm run serve                  Start server
  npm run dev                    Start server with hot-reload
`);
  }
}
