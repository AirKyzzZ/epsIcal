export interface EdtEvent {
  uid: string;
  code: string;
  course: string;
  teacher: string;
  group: string;
  room: string;
  start: Date;
  end: Date;
  teamsUrl: string | null;
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(value: string): string {
  return value.replace(/\\([\;,nN])/g, (_, ch) =>
    ch === "n" || ch === "N" ? "\n" : ch
  );
}

function parseProperty(line: string): IcsProperty | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");

  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }

  return { name: name.toUpperCase(), params, value };
}

function parseIcsDate(prop: IcsProperty): Date | null {
  const m = prop.value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  );
  if (!m) return null;

  const [, y, mo, d, h, mi, s, zulu] = m;
  if (!h) return null;

  // Hyperplanning always stamps timed events as UTC. A local-time form would
  // need a VTIMEZONE lookup we deliberately don't carry, so reject it loudly
  // rather than silently shifting the event.
  if (!zulu) return null;

  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  );
}

function field(description: string, ...labels: string[]): string {
  for (const label of labels) {
    const m = description.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  return "";
}

function cleanRoom(raw: string): string {
  return raw
    .split(",")
    .map((part) => part.replace(/\s*\(\d+\)\s*$/, "").trim())
    .filter(Boolean)
    .join(", ");
}

function extractTeamsUrl(description: string): string | null {
  const hrefs = Array.from(description.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
  const bare = Array.from(
    description.matchAll(/https:\/\/teams\.microsoft\.com\/[^\s"'<>]+/g)
  ).map((m) => m[0]);

  const teams = [...hrefs, ...bare].filter((u) => u.startsWith("https://teams.microsoft.com/"));
  if (teams.length === 0) return null;

  return Array.from(new Set(teams)).join(" | ");
}

export interface ParseResult {
  events: EdtEvent[];
  skippedAllDay: number;
}

export function parseHyperplanningIcs(ics: string): ParseResult {
  const lines = unfold(ics);
  const events: EdtEvent[] = [];
  let skippedAllDay = 0;

  let current: IcsProperty[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) {
        const event = buildEvent(current);
        if (event === "all-day") skippedAllDay++;
        else if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (current) {
      const prop = parseProperty(line);
      if (prop) current.push(prop);
    }
  }

  return { events, skippedAllDay };
}

function buildEvent(props: IcsProperty[]): EdtEvent | "all-day" | null {
  const get = (name: string) => props.find((p) => p.name === name);

  const dtstart = get("DTSTART");
  const dtend = get("DTEND");
  if (!dtstart || !dtend) return null;

  if (dtstart.params.VALUE === "DATE") return "all-day";

  const start = parseIcsDate(dtstart);
  const end = parseIcsDate(dtend);
  if (!start || !end) return null;

  const description = unescapeText(get("DESCRIPTION")?.value ?? "");
  const summary = unescapeText(get("SUMMARY")?.value ?? "");

  const code = field(description, "Matière") || summary.split(" - ")[0].trim();
  const teacher = field(description, "Intervenant");
  const group = field(description, "Groupe");
  const room = cleanRoom(
    field(description, "Salles", "Salle") || unescapeText(get("LOCATION")?.value ?? "")
  );

  return {
    uid: get("UID")?.value ?? "",
    code,
    course: code,
    teacher,
    group,
    room,
    start,
    end,
    teamsUrl: extractTeamsUrl(description),
  };
}

export function deduplicateEvents(events: EdtEvent[]): EdtEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = e.uid || `${e.code}|${e.start.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
