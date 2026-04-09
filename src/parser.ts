import type { RawEdtItem } from "./scraper.js";

export interface EdtEvent {
  course: string;
  teacher: string;
  group: string;
  room: string;
  date: Date;
  startTime: string;
  endTime: string;
  start: Date;
  end: Date;
  modality: "presential" | "remote" | "mixed" | "unknown";
  teamsUrl: string | null;
}

function formatTime(date: Date): string {
  // We display the time in Europe/Paris since all EDT events use that tz.
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

/**
 * Returns the Europe/Paris UTC offset (in ms) for the given instant.
 * Positive when Paris is ahead of UTC (CET = +1h, CEST = +2h).
 */
function parisOffsetAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // Intl returns 24 for midnight in some locales
  const parisAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return parisAsUtc - instant.getTime();
}

/**
 * The Wigor `/Home/Get` API returns Start/End with an offset suffix that is
 * intentionally misleading. The Kendo scheduler on wigorservices.net is
 * configured with `timezone: "Etc/UTC"`, so students see the *UTC wall clock*
 * of the raw instant — and they interpret that number as Paris local time.
 *
 * Example: a class that runs 10:00–12:00 Paris time comes back from the API
 * as `"2026-04-07T12:00:00+02:00"`. That string parses to the instant
 * `10:00Z` whose UTC wall clock reads "10:00" — matching what the UI shows.
 *
 * To emit a correct iCal DTSTART with `TZID=Europe/Paris`, we pull the UTC
 * wall clock from the parsed instant and reinterpret it as Paris local time.
 */
function wigorTimeToParisInstant(raw: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return parsed;

  const y = parsed.getUTCFullYear();
  const mo = parsed.getUTCMonth();
  const d = parsed.getUTCDate();
  const h = parsed.getUTCHours();
  const mi = parsed.getUTCMinutes();
  const s = parsed.getUTCSeconds();

  // Build the instant whose Europe/Paris projection reads (y, mo, d, h, mi, s).
  const naive = new Date(Date.UTC(y, mo, d, h, mi, s));
  return new Date(naive.getTime() - parisOffsetAt(naive));
}

function mapModality(raw: string | null): EdtEvent["modality"] {
  if (!raw) return "unknown";
  const v = raw.toLowerCase();
  if (v.includes("présentiel") || v.includes("presentiel")) return "presential";
  if (v.includes("distanciel") || v.includes("distance")) return "remote";
  if (v.includes("mixte")) return "mixed";
  return "unknown";
}

/**
 * Wigor's `TeamsUrl` field returns a chunk of HTML (`<a href="..."><img/></a>`,
 * sometimes several links for sub-groups). Extract the plain href(s) so the
 * calendar description stays readable.
 */
function extractTeamsUrl(raw: string | null): string | null {
  if (!raw) return null;
  const matches = Array.from(raw.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
  if (matches.length === 0) {
    const trimmed = raw.trim();
    return trimmed.startsWith("http") ? trimmed : null;
  }
  // Deduplicate while preserving order; first link is always the main meeting.
  return Array.from(new Set(matches)).join(" | ");
}

export function parseEdtEvents(items: RawEdtItem[]): EdtEvent[] {
  const events: EdtEvent[] = [];

  for (const item of items) {
    if (!item.Start || !item.End) continue;

    const start = wigorTimeToParisInstant(item.Start);
    const end = wigorTimeToParisInstant(item.End);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    // Course title lives in Commentaire (the label displayed on the card).
    // Fall back to Title/Matiere if Commentaire is empty.
    const course =
      (item.Commentaire && item.Commentaire.trim()) ||
      (item.Title && item.Title.trim()) ||
      (item.Matiere && item.Matiere.trim()) ||
      "Cours";

    const teacher = (item.NomProf || "").trim();
    const group = (item.LibelleGroupe || "").trim();
    const room = (item.Salles || "").trim();
    const modality = mapModality(item.CoursMixteInfoBulle);

    events.push({
      course,
      teacher,
      group,
      room,
      date: start,
      startTime: formatTime(start),
      endTime: formatTime(end),
      start,
      end,
      modality: modality === "unknown" && room.toLowerCase().includes("distanciel")
        ? "remote"
        : modality,
      teamsUrl: extractTeamsUrl(item.TeamsUrl),
    });
  }

  return events;
}

/** Deduplicates events by course + start timestamp. */
export function deduplicateEvents(events: EdtEvent[]): EdtEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.course}|${e.start.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
