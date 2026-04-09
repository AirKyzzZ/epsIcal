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

  const modalityLabel: Record<EdtEvent["modality"], string | null> = {
    presential: "Présentiel",
    remote: "Distanciel",
    mixed: "Mixte",
    unknown: null,
  };

  for (const event of events) {
    const mode = modalityLabel[event.modality];
    const description = [
      event.teacher && `Prof: ${event.teacher}`,
      event.group && `Groupe: ${event.group}`,
      mode && `Mode: ${mode}`,
      event.teamsUrl && `Teams: ${event.teamsUrl}`,
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
