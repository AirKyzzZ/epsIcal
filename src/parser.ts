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

function parseFrenchDate(text: string): { day: number; month: number } | null {
  // "Lundi 2 Mars" or "Vendredi 27 Février"
  const dayMatch = text.match(/(\d+)/);
  const wordMatch = text.match(/\d+\s+(\S+)/);
  if (!dayMatch || !wordMatch) return null;

  const day = parseInt(dayMatch[1], 10);
  const monthRaw = wordMatch[1]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Exact match first
  let month = FRENCH_MONTHS[monthRaw];
  if (month === undefined) {
    // Partial match (first 3 chars)
    const entry = Object.entries(FRENCH_MONTHS).find(([key]) =>
      key.startsWith(monthRaw.slice(0, 3))
    );
    if (!entry) return null;
    month = entry[1];
  }

  return { day, month };
}

function parseLeftPercent(style: string): number | null {
  const match = style.match(/left:\s*([\d.]+)%/);
  return match ? parseFloat(match[1]) : null;
}

export function parseEdtHtml(
  html: string,
  requestedDate: Date
): EdtEvent[] {
  const $ = cheerio.load(html);
  const events: EdtEvent[] = [];
  const year = requestedDate.getFullYear();
  const requestedMonth = requestedDate.getMonth();

  // Step 1: Parse all day headers (.Jour) to build a leftPercent → Date map
  // This replaces the old hardcoded DAY_COLUMNS thresholds entirely.
  const headerColumns: { left: number; date: Date }[] = [];

  $(".Jour").each((_, el) => {
    const style = $(el).attr("style") || "";
    const left = parseLeftPercent(style);
    if (left === null) return;

    const headerText = $(el).find(".TCJour").text().trim();
    const parsed = parseFrenchDate(headerText);
    if (!parsed) return;

    // Handle year rollover: requestedDate in December but header is January → next year
    let eventYear = year;
    if (requestedMonth === 11 && parsed.month === 0) {
      eventYear = year + 1;
    }
    // Handle rollover the other way (shouldn't normally happen but be safe)
    if (requestedMonth === 0 && parsed.month === 11) {
      eventYear = year - 1;
    }

    const date = new Date(eventYear, parsed.month, parsed.day);
    headerColumns.push({ left, date });
  });

  // Sort by left% ascending
  headerColumns.sort((a, b) => a.left - b.left);

  if (headerColumns.length === 0) {
    console.warn("[parser] No day headers found — HTML may have changed structure");
    return events;
  }

  // DEBUG: Log headers for March 16 request
  const reqDateStr = requestedDate.toISOString().split('T')[0];
  if (reqDateStr === '2026-03-16') {
    console.log(`[parser DEBUG] Request date: ${reqDateStr}`);
    console.log(`[parser DEBUG] Found ${headerColumns.length} headers:`);
    headerColumns.forEach(col => {
      console.log(`  - left=${col.left}% → ${col.date.toISOString().split('T')[0]}`);
    });
  }

  // Step 2: For each event, find the closest header by left%
  function findClosestDate(leftPercent: number): Date | null {
    if (headerColumns.length === 0) return null;
    let closest = headerColumns[0];
    let minDiff = Math.abs(leftPercent - closest.left);
    for (const col of headerColumns) {
      const diff = Math.abs(leftPercent - col.left);
      if (diff < minDiff) {
        minDiff = diff;
        closest = col;
      }
    }
    return closest.date;
  }

  // Step 3: Parse events
  let debugTotal = 0;
  let debugNoLeft = 0;
  let debugNoTime = 0;
  const debugByDate: Record<string, number> = {};
  
  $(".Case").each((_, el) => {
    debugTotal++;
    const style = $(el).attr("style") || "";
    const left = parseLeftPercent(style);
    if (left === null) { debugNoLeft++; return; }

    const eventDate = findClosestDate(left);
    if (!eventDate) return;
    
    const dateKey = eventDate.toISOString().split('T')[0];
    debugByDate[dateKey] = (debugByDate[dateKey] || 0) + 1;
    
    if (reqDateStr === '2026-03-16' && left > 200) {
      const timeText2 = $(el).find("td.TChdeb").text().trim();
      const courseText = $(el).find("td.TCase").text().trim().slice(0, 30);
      console.log(`[parser DEBUG] Case left=${left}% → ${dateKey} time="${timeText2}" course="${courseText}"`);
    }

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

  if (reqDateStr === '2026-03-16') {
    console.log(`[parser DEBUG] Total .Case: ${debugTotal}, noLeft: ${debugNoLeft}, noTime: ${debugNoTime}`);
    console.log(`[parser DEBUG] Events by date:`, JSON.stringify(debugByDate));
    console.log(`[parser DEBUG] Final events returned: ${events.length}`);
  }
  
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
