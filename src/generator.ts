import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { EdtEvent } from "./parser.js";

const TIMEZONE = "Europe/Paris";

export function generateIcal(events: EdtEvent[]): string {
  const calendar = ical({
    name: "EDT EPSI",
    timezone: TIMEZONE,
    method: ICalCalendarMethod.PUBLISH,
    prodId: {
      company: "epsIcal",
      product: "EDT EPSI Schedule",
    },
  });

  for (const event of events) {
    const description = [
      event.teacher && `Prof: ${event.teacher}`,
      event.group && `Groupe: ${event.group}`,
      event.modality !== "unknown" &&
        `Mode: ${event.modality === "presential" ? "Présentiel" : "Distanciel"}`,
    ]
      .filter(Boolean)
      .join("\n");

    calendar.createEvent({
      start: event.start,
      end: event.end,
      timezone: TIMEZONE,
      summary: event.course,
      location: event.room || undefined,
      description,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  return calendar.toString();
}
