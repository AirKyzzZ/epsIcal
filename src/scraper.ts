import { chromium, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const AUTH_STATE_PATH = path.join(DATA_DIR, "auth.json");

const EDT_BASE_URL =
  "https://ws-edt-cd.wigorservices.net/WebPsDyn.aspx?action=posEDTLMS&serverID=C";
const API_URL = "https://ws-edt-cd.wigorservices.net/Home/Get";
const CAS_HOST = "cas-p.wigorservices.net";

/**
 * Raw event shape returned by /Home/Get. Only the fields we consume are typed;
 * the API returns ~30 fields but we ignore the rest.
 */
export interface RawEdtItem {
  Commentaire: string | null;
  Title: string | null;
  NomProf: string | null;
  LibelleGroupe: string | null;
  LibelleSemaine: string | null;
  Matiere: string | null;
  Salles: string | null;
  CoursMixteInfoBulle: string | null;
  TeamsUrl: string | null;
  Start: string;
  End: string;
  IsAllDay: boolean;
  Origine: number | null;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getEdtUrl(username: string): string {
  return `${EDT_BASE_URL}&Tel=${username}`;
}

/** Returns September 1st of the current school year at 00:00 UTC. */
function getSchoolYearStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(Date.UTC(year, 8, 1));
}

/** Returns July 31 of the current school year end at 00:00 UTC. */
function getSchoolYearEnd(): Date {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(Date.UTC(year, 6, 31));
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

async function fetchRange(
  page: Page,
  dateDebut: Date,
  dateFin: Date
): Promise<RawEdtItem[]> {
  const params = new URLSearchParams({
    dateDebut: dateDebut.toISOString(),
    dateFin: dateFin.toISOString(),
  });

  const result = await page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      body: await res.text(),
    };
  }, `${API_URL}?${params}`);

  if (result.status !== 200) {
    throw new Error(
      `[scraper] /Home/Get returned HTTP ${result.status}: ${result.body.slice(0, 200)}`
    );
  }

  if (!result.contentType.includes("json")) {
    throw new Error(
      `[scraper] /Home/Get returned non-JSON (${result.contentType}). Session likely expired. First 200 chars: ${result.body.slice(0, 200)}`
    );
  }

  const parsed = JSON.parse(result.body) as {
    Data: RawEdtItem[];
    Total: number;
    Errors: unknown;
  };

  if (parsed.Errors) {
    throw new Error(`[scraper] API returned errors: ${JSON.stringify(parsed.Errors)}`);
  }

  return parsed.Data ?? [];
}

export async function scrapeEDT(
  username: string,
  password: string
): Promise<RawEdtItem[]> {
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

  try {
    const startDate = getSchoolYearStart();
    const endDate = getSchoolYearEnd();

    console.log(
      `[scraper] Fetching school year: ${startDate.toISOString().split("T")[0]} → ${endDate.toISOString().split("T")[0]}`
    );

    // Visit the EDT landing page first. This handles CAS redirect if the
    // session has expired, and primes the cookies required by /Home/Get.
    await page.goto(getEdtUrl(username), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    if (await isOnCASLogin(page)) {
      await authenticateCAS(page, username, password);
      await page.waitForTimeout(1000);
      await context.storageState({ path: AUTH_STATE_PATH });
      console.log("[scraper] Session saved");
    }

    // Single API call for the whole school year (≈350 events, ~2s, ~750 KB).
    let items = await fetchRange(page, startDate, endDate);

    // If the session was actually expired server-side, the first request may
    // redirect to CAS (returning HTML). fetchRange throws in that case — retry
    // once after forcing a fresh login.
    if (items.length === 0) {
      console.log(
        "[scraper] No events returned on first attempt, retrying after re-auth..."
      );
      await page.goto(getEdtUrl(username), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      if (await isOnCASLogin(page)) {
        await authenticateCAS(page, username, password);
        await context.storageState({ path: AUTH_STATE_PATH });
      }
      items = await fetchRange(page, startDate, endDate);
    }

    console.log(`[scraper] Retrieved ${items.length} raw events`);
    return items;
  } finally {
    await browser.close();
  }
}
