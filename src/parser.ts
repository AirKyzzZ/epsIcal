import * as cheerio from "cheerio";

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
  modality: "presential" | "remote" | "unknown";
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  "février": 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  "août": 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  "décembre": 11,
  decembre: 11,
};

/** Column left% → column index mapping thresholds */
const DAY_COLUMNS = [
  { min: 0, max: 20, weekOffset: 0, dayIndex: 0 }, // Mon week 1
  { min: 20, max: 39, weekOffset: 0, dayIndex: 1 }, // Tue week 1
  { min: 39, max: 58, weekOffset: 0, dayIndex: 2 }, // Wed week 1
  { min: 58, max: 78, weekOffset: 0, dayIndex: 3 }, // Thu week 1
  { min: 78, max: 98, weekOffset: 0, dayIndex: 4 }, // Fri week 1
  { min: 98, max: 120, weekOffset: 1, dayIndex: 0 }, // Mon week 2
  { min: 120, max: 139, weekOffset: 1, dayIndex: 1 }, // Tue week 2
  { min: 139, max: 158, weekOffset: 1, dayIndex: 2 }, // Wed week 2
  { min: 158, max: 178, weekOffset: 1, dayIndex: 3 }, // Thu week 2
  { min: 178, max: 200, weekOffset: 1, dayIndex: 4 }, // Fri week 2
];

function parseFrenchDate(
  text: string,
  referenceYear: number
): { day: number; month: number } | null {
  // "Lundi 2 Mars" or "Vendredi 27 Février"
  const match = text.match(/\d+\s+(\S+)/);
  if (!match) return null;

  const dayMatch = text.match(/(\d+)/);
  if (!dayMatch) return null;

  const day = parseInt(dayMatch[1], 10);
  const monthName = match[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const month = FRENCH_MONTHS[monthName];
  if (month === undefined) {
    // Try partial match
    const entry = Object.entries(FRENCH_MONTHS).find(([key]) =>
      key.startsWith(monthName.slice(0, 3))
    );
    if (!entry) return null;
    return { day, month: entry[1] };
  }

  return { day, month };
}

function parseLeftPercent(style: string): number | null {
  const match = style.match(/left:\s*([\d.]+)%/);
  return match ? parseFloat(match[1]) : null;
}

function findDayColumn(leftPercent: number) {
  return DAY_COLUMNS.find(
    (col) => leftPercent >= col.min && leftPercent < col.max
  );
}

export function parseEdtHtml(
  html: string,
  requestedDate: Date
): EdtEvent[] {
  const $ = cheerio.load(html);
  const events: EdtEvent[] = [];
  const year = requestedDate.getFullYear();

  // Parse day headers to build date mapping
  // Structure: { weekOffset: number, dayIndex: number } → Date
  const dayDates = new Map<string, Date>();

  $(".Jour").each((_, el) => {
    const style = $(el).attr("style") || "";
    const left = parseLeftPercent(style);
    if (left === null) return;

    const headerText = $(el).find(".TCJour").text().trim();
    const parsed = parseFrenchDate(headerText, year);
    if (!parsed) return;

    const col = findDayColumn(left);
    if (!col) return;

    const key = `${col.weekOffset}-${col.dayIndex}`;
    const date = new Date(year, parsed.month, parsed.day);
    dayDates.set(key, date);
  });

  // Parse events
  $(".Case").each((_, el) => {
    const style = $(el).attr("style") || "";
    const left = parseLeftPercent(style);
    if (left === null) return;

    const col = findDayColumn(left);
    if (!col) return;

    const key = `${col.weekOffset}-${col.dayIndex}`;
    const eventDate = dayDates.get(key);
    if (!eventDate) return;

    // Course name: text content of td.TCase, stripped of Teams links
    const courseTd = $(el).find("td.TCase");
    const courseClone = courseTd.clone();
    courseClone.find(".Teams, .Presence").remove();
    const course = courseClone.text().trim();

    // Teacher and group from td.TCProf
    const profTd = $(el).find("td.TCProf");
    const profClone = profTd.clone();
    profClone.find("span, img").remove();
    const profText = profClone.html();
    let teacher = "";
    let group = "";
    if (profText) {
      const parts = profText.split("<br>");
      teacher = cheerio.load(parts[0] || "").text().trim();
      group = parts[1] ? cheerio.load(parts[1]).text().trim() : "";
    }

    // Time range
    const timeText = $(el).find("td.TChdeb").text().trim();
    const timeMatch = timeText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) return;
    const startTime = timeMatch[1];
    const endTime = timeMatch[2];

    // Room
    const roomText = $(el).find("td.TCSalle").text().trim();
    const room = roomText.replace(/^Salle:/, "").trim();

    // Modality
    const modalityImg = $(el).find('img[alt]');
    let modality: EdtEvent["modality"] = "unknown";
    modalityImg.each((_, img) => {
      const alt = $(img).attr("alt")?.toLowerCase() || "";
      if (alt.includes("senciel") || alt.includes("presenciel")) {
        modality = "presential";
      } else if (alt.includes("distanciel") || alt.includes("distance")) {
        modality = "remote";
      }
    });
    if (room.toLowerCase().includes("distanciel")) {
      modality = "remote";
    }

    // Build full start/end Date objects
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const start = new Date(eventDate);
    start.setHours(startH, startM, 0, 0);

    const end = new Date(eventDate);
    end.setHours(endH, endM, 0, 0);

    events.push({
      course,
      teacher,
      group,
      room,
      date: eventDate,
      startTime,
      endTime,
      start,
      end,
      modality,
    });
  });

  return events;
}

/** Deduplicates events by course+date+startTime */
export function deduplicateEvents(events: EdtEvent[]): EdtEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.course}|${e.date.toISOString()}|${e.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
