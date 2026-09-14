import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import type { EdtEvent } from "./parser.js";
import {
  classifyCourse,
  courseKindText,
  courseLabel,
  loadCourseLabels,
  shortenCourse,
} from "./course-label.js";

export function generateIcal(events: EdtEvent[]): string {
  const calendar = ical({
    name: "EDT EPSI",
    method: ICalCalendarMethod.PUBLISH,
    prodId: {
      company: "epsIcal",
      product: "EDT EPSI Schedule",
    },
  });

  const labels = loadCourseLabels();

  for (const event of events) {
    const fullName = event.course;
    const shortName = shortenCourse(event.course, labels);

    const description = [
      shortName === fullName ? null : fullName,
      `Type: ${courseKindText(classifyCourse(event.course))}`,
      event.teacher && `Prof: ${event.teacher}`,
      event.group && `Groupe: ${event.group}`,
      event.room && `Salle: ${event.room}`,
    ]
      .filter(Boolean)
      .join("\n");

    calendar.createEvent({
      id: event.uid || undefined,
      start: event.start,
      end: event.end,
      summary: courseLabel(event.course, event.roomIsPlaceholder ? "" : event.room, labels),
      location: event.room || undefined,
      description,
      url: event.teamsUrl ?? undefined,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  return calendar.toString();
}
