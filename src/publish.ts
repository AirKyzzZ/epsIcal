import { execFileSync } from "child_process";
import { existsSync, cpSync, mkdirSync, readFileSync, rmSync } from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CALENDAR_PATH = path.join(DATA_DIR, "calendar.ics");
const PUBLISH_DIR = path.join(DATA_DIR, "gh-pages");

function run(cmd: string, args: string[], cwd: string = ROOT): string {
  return execFileSync(cmd, args, { cwd, stdio: "pipe" }).toString().trim();
}

export async function publishToGhPages() {
  if (!existsSync(CALENDAR_PATH)) {
    console.log("[publish] No calendar.ics to publish");
    return;
  }

  // Refuse to publish an empty calendar — protects gh-pages from being wiped
  // if the scraper ever produces a calendar without events.
  const ics = readFileSync(CALENDAR_PATH, "utf-8");
  const eventCount = (ics.match(/^BEGIN:VEVENT/gm) || []).length;
  if (eventCount === 0) {
    console.error(
      "[publish] Refusing to publish calendar.ics with 0 events (would wipe gh-pages)"
    );
    return;
  }

  try {
    // Clean up any previous publish dir
    if (existsSync(PUBLISH_DIR)) {
      rmSync(PUBLISH_DIR, { recursive: true, force: true });
    }
    mkdirSync(PUBLISH_DIR, { recursive: true });

    // Get the remote URL
    const remoteUrl = run("git", ["remote", "get-url", "origin"]);

    // Clone just the gh-pages branch (shallow)
    run("git", ["clone", "--depth", "1", "--branch", "gh-pages", remoteUrl, PUBLISH_DIR]);

    // Copy the calendar
    cpSync(CALENDAR_PATH, path.join(PUBLISH_DIR, "calendar.ics"));

    // Check if changed
    const status = run("git", ["status", "--porcelain"], PUBLISH_DIR);
    if (!status) {
      console.log("[publish] No changes to publish");
      return;
    }

    // Commit and push
    run("git", ["add", "calendar.ics"], PUBLISH_DIR);
    run("git", ["commit", "-m", "chore: update calendar"], PUBLISH_DIR);
    run("git", ["push"], PUBLISH_DIR);

    console.log("[publish] Published to GitHub Pages");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[publish] Failed: ${message}`);
  } finally {
    if (existsSync(PUBLISH_DIR)) {
      rmSync(PUBLISH_DIR, { recursive: true, force: true });
    }
  }
}
