import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { EdtEvent } from "./parser.js";
import { loadCourseNames, resolveCourseName } from "./course-names.js";

export function generateIcal(events: EdtEvent[]): string {
  const calendar = ical({
    name: "EDT EPSI",
    method: ICalCalendarMethod.PUBLISH,
    prodId: {
      company: "epsIcal",
      product: "EDT EPSI Schedule",
    },
  });

  const names = loadCourseNames();

  for (const event of events) {
    const description = [
      event.teacher && `Prof: ${event.teacher}`,
      event.group && `Groupe: ${event.group}`,
      event.room && `Salle: ${event.room}`,
      event.teamsUrl && `Teams: ${event.teamsUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    calendar.createEvent({
      id: event.uid || undefined,
      start: event.start,
      end: event.end,
      summary: resolveCourseName(event.code, event.teacher, names),
      location: event.room || undefined,
      description,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  return calendar.toString();
}
