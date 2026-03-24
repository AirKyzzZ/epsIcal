import { chromium, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const AUTH_STATE_PATH = path.join(DATA_DIR, "auth.json");

const EDT_BASE_URL =
  "https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?action=posEDTLMS&serverID=C";
const CAS_HOST = "cas-p.wigorservices.net";

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getEdtUrl(username: string, date?: Date): string {
  let url = `${EDT_BASE_URL}&Tel=${username}`;
  if (date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    url += `&date=${mm}/${dd}/${yyyy}`;
  }
  return url;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** Returns the Monday of September 1st's week for the current school year */
function getSchoolYearStart(): Date {
  const now = new Date();
  // School year starts in September
  // If we're before September, it started last year's September
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const sept1 = new Date(year, 8, 1); // September 1
  return getMonday(sept1);
}

/** Returns the Monday of July's last week for the current school year */
function getSchoolYearEnd(): Date {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, 6, 31); // July 31
}

async function authenticateCAS(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  console.log("[scraper] Authenticating via CAS...");

  await page.waitForSelector("#username", { timeout: 10000 });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('input[type="submit"], button[type="submit"]');

  await page.waitForURL((url) => !url.hostname.includes(CAS_HOST), {
    timeout: 15000,
  });

  console.log("[scraper] CAS authentication successful");
}

async function isOnCASLogin(page: Page): Promise<boolean> {
  return page.url().includes(CAS_HOST);
}

export interface ScrapeResult {
  html: string;
  url: string;
  weekOf: Date;
}

export async function scrapeEDT(
  username: string,
  password: string
): Promise<ScrapeResult[]> {
  ensureDataDir();

  const browser = await chromium.launch({ headless: true });

  let context: BrowserContext;
  if (existsSync(AUTH_STATE_PATH)) {
    console.log("[scraper] Reusing saved session...");
    context = await browser.newContext({ storageState: AUTH_STATE_PATH });
  } else {
    context = await browser.newContext();
  }

  const page = await context.newPage();
  const results: ScrapeResult[] = [];

  try {
    const startDate = getSchoolYearStart();
    const endDate = getSchoolYearEnd();
    const totalWeeks = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    const requests = totalWeeks;

    console.log(
      `[scraper] Scraping full school year: ${startDate.toISOString().split("T")[0]} → ${endDate.toISOString().split("T")[0]} (~${totalWeeks} weeks, ${requests} requests)`
    );

    const firstUrl = getEdtUrl(username, startDate);
    await page.goto(firstUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    if (await isOnCASLogin(page)) {
      await authenticateCAS(page, username, password);
      await page.waitForTimeout(2000);
      await context.storageState({ path: AUTH_STATE_PATH });
      console.log("[scraper] Session saved");
    }

    for (let i = 0; i < requests; i++) {
      const weekDate = addWeeks(startDate, i);
      if (weekDate > endDate) break;

      const url = getEdtUrl(username, weekDate);

      if (i > 0) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        if (await isOnCASLogin(page)) {
          console.log("[scraper] Session expired, re-authenticating...");
          await authenticateCAS(page, username, password);
          await page.waitForTimeout(2000);
          await context.storageState({ path: AUTH_STATE_PATH });
        }
      }

      await page.waitForTimeout(1000);

      const html = await page.content();
      results.push({ html, url, weekOf: weekDate });

      const weekStr = weekDate.toISOString().split("T")[0];
      console.log(`[scraper] Scraped week of ${weekStr} (${i + 1}/${requests})`);
    }
  } finally {
    await browser.close();
  }

  return results;
}
