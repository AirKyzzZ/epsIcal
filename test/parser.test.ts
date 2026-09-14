import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { parseHyperplanningIcs, deduplicateEvents } from "../src/parser.js";
import { generateIcal } from "../src/generator.js";

const fixture = readFileSync(
  path.join(import.meta.dirname, "fixtures", "hyperplanning.ics"),
  "utf-8"
);

const { events, skippedAllDay } = parseHyperplanningIcs(fixture);
const byCourse = (course: string) => events.find((e) => e.course.startsWith(course))!;

const flat = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

const paris = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);

test("drops all-day Férié entries and keeps timed courses", () => {
  assert.equal(skippedAllDay, 1);
  assert.equal(events.length, 9);
});

test("reads times as UTC instants that land on the right Paris wall clock", () => {
  const event = byCourse("Rentrée");
  assert.equal(event.start.toISOString(), "2026-09-02T07:30:00.000Z");
  assert.equal(paris(event.start), "02/09/2026 09:30");
  assert.equal(paris(event.end), "02/09/2026 13:00");
});

test("pulls fields from the structured description", () => {
  const event = byCourse("Rentrée");
  assert.equal(event.teacher, "CHESNEAU");
  assert.equal(event.group, "BAC+3 ALL 26/27 EPSI BDX");
  assert.equal(event.uid, "Cours-531292-1-ETUDIANT_Test-Index-Education");
});

test("keeps course names that contain their own dashes", () => {
  assert.equal(byCourse("Workshop").course, "Workshop - Créativité & Innovation");
  assert.equal(
    byCourse("Classe inversée").course,
    "Classe inversée - Atelier Virtualisation et conteneurs : Docker"
  );
});

test("falls back to the summary when Matière is missing", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:no-matiere",
    "DTSTART:20260902T073000Z",
    "DTEND:20260902T090000Z",
    "SUMMARY:Workshop - Créativité & Innovation - COURAUD - BAC+3 ALL 26/27 EPSI BDX",
    "DESCRIPTION:Intervenant : COURAUD\\nGroupe : BAC+3 ALL 26/27 EPSI BDX",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  assert.equal(
    parseHyperplanningIcs(ics).events[0].course,
    "Workshop - Créativité & Innovation"
  );
});

test("strips room capacities and keeps multi-room lists", () => {
  assert.equal(byCourse("Rentrée").room, "F100");
  assert.equal(byCourse("Workshop").room, "F409 BAS, F410 MYDIL");
});

test("flags zero-capacity rooms as placeholders", () => {
  assert.equal(byCourse("Autonomie").room, "SALLE_20");
  assert.equal(byCourse("Autonomie").roomIsPlaceholder, true);
  assert.equal(byCourse("Rentrée").roomIsPlaceholder, false);
  assert.equal(byCourse("Workshop").roomIsPlaceholder, false);
});

test("survives a course with no teacher", () => {
  const event = byCourse("Temps de vie de classe");
  assert.equal(event.teacher, "");
  assert.ok(event.group.length > 0);
});

test("extracts the Teams link out of the description HTML", () => {
  const event = byCourse("Rentrée");
  assert.ok(event.teamsUrl?.startsWith("https://teams.microsoft.com/"));
  assert.ok(!event.teamsUrl?.includes("<"));
});

test("courses without a Teams link report null", () => {
  assert.equal(byCourse("Atelier Scrum").teamsUrl, null);
});

test("deduplicates on UID", () => {
  assert.equal(deduplicateEvents([...events, ...events]).length, events.length);
});

test("emits UTC timestamps and carries the Hyperplanning UID through", () => {
  const ics = generateIcal([byCourse("Rentrée")]);
  assert.match(ics, /^DTSTART:20260902T073000Z$/m);
  assert.match(ics, /^DTEND:20260902T110000Z$/m);
  assert.match(ics, /^UID:Cours-531292-1-ETUDIANT_Test-Index-Education$/m);
  assert.doesNotMatch(ics, /TZID/);
});

test("titles carry the session-type emoji, the short name and the room", () => {
  assert.match(flat(generateIcal([byCourse("Atelier Scrum")])), /^SUMMARY:🛠 Scrum · F207$/m);
  assert.match(
    flat(generateIcal([byCourse("Méthodologie")])),
    /^SUMMARY:📘 Méthodologie Agile & DevOps · F207$/m
  );
});

test("keeps placeholder rooms out of the title but in the event body", () => {
  const ics = flat(generateIcal([byCourse("Autonomie")]));
  assert.doesNotMatch(ics, /^SUMMARY:.*SALLE_20/m);
  assert.match(ics, /^SUMMARY:🏠 /m);
  assert.match(ics, /^LOCATION:SALLE_20$/m);
  assert.match(ics, /Salle: SALLE_20/);
});

test("describes the session with its type and the untruncated course name", () => {
  const ics = flat(generateIcal([byCourse("Dossier de Synthèse")]));
  assert.match(ics, /Type: Évaluation/);
  assert.match(ics, /Prof: ALZATE/);
  assert.match(ics, /Groupe: BAC\+3 ALL 26\/27 EPSI BDX/);
  assert.match(ics, /Salle: F207/);
  assert.match(ics, /Dossier de Synthèse Veille Technologique/);
});

test("omits the full name when the title already shows it in full", () => {
  const ics = flat(generateIcal([byCourse("Rentrée")]));
  assert.equal(ics.match(/Rentrée/g)?.length, 1);
});

test("publishes the Teams link as a clickable URL", () => {
  assert.match(flat(generateIcal([byCourse("Rentrée")])), /^URL[;:].*teams\.microsoft\.com/m);
});
