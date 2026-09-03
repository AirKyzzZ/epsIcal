const REQUEST_TIMEOUT_MS = 30_000;

export async function fetchHyperplanningIcs(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.text();

  // A rotated or revoked icalsecurise token does not 401 — Hyperplanning serves
  // a 404 HTML page, so an unchecked read would parse to zero events.
  if (!response.ok) {
    throw new Error(
      `[fetcher] Hyperplanning returned HTTP ${response.status}. ` +
        `The icalsecurise token has most likely been rotated — reopen the espace ` +
        `(iCal export button) and copy the fresh URL into HP_ICAL_URL.`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/calendar")) {
    throw new Error(
      `[fetcher] Expected text/calendar but got "${contentType}". ` +
        `First 200 chars: ${body.slice(0, 200)}`
    );
  }

  if (!body.startsWith("BEGIN:VCALENDAR")) {
    throw new Error("[fetcher] Response is not an iCalendar document");
  }

  return body;
}
