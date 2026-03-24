import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const CALENDAR_PATH = path.join(DATA_DIR, "calendar.ics");

export function createServer(onRefresh?: () => Promise<void>) {
  const app = new Hono();

  app.get("/calendar.ics", async (c) => {
    if (!existsSync(CALENDAR_PATH)) {
      return c.text("Calendar not generated yet. Run a scrape first.", 404);
    }

    const ics = await readFile(CALENDAR_PATH, "utf-8");
    return c.body(ics, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="edt-epsi.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
  });

  app.get("/health", (c) => {
    const hasCalendar = existsSync(CALENDAR_PATH);
    return c.json({ status: "ok", calendarGenerated: hasCalendar });
  });

  app.get("/refresh", async (c) => {
    if (!onRefresh) {
      return c.text("Refresh not configured", 501);
    }
    try {
      await onRefresh();
      return c.json({ status: "refreshed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ status: "error", message }, 500);
    }
  });

  app.get("/", (c) => {
    return c.html(`
      <html>
        <head><title>epsIcal</title></head>
        <body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:0 20px">
          <h1>epsIcal</h1>
          <p>Your EPSI schedule as an iCal feed.</p>
          <ul>
            <li><a href="/calendar.ics">Download calendar.ics</a></li>
            <li><a href="/health">Health check</a></li>
            <li><a href="/refresh">Force refresh</a></li>
          </ul>
          <h2>Subscribe</h2>
          <p>Add this URL to your calendar app:</p>
          <code>${c.req.url.replace(/\/$/, "")}/calendar.ics</code>
        </body>
      </html>
    `);
  });

  return app;
}

export function startServer(port: number, onRefresh?: () => Promise<void>) {
  const app = createServer(onRefresh);

  serve({ fetch: app.fetch, port }, () => {
    console.log(`[server] epsIcal running on http://localhost:${port}`);
    console.log(`[server] Subscribe URL: http://localhost:${port}/calendar.ics`);
  });
}
