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

    const start = new Date(item.Start);
    const end = new Date(item.End);
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
