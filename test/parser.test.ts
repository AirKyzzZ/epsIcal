import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { parseHyperplanningIcs, deduplicateEvents } from "../src/parser.js";
import { resolveCourseName } from "../src/course-names.js";
import { generateIcal } from "../src/generator.js";

const fixture = readFileSync(
  path.join(import.meta.dirname, "fixtures", "hyperplanning.ics"),
  "utf-8"
);

const { events, skippedAllDay } = parseHyperplanningIcs(fixture);
const byCode = (code: string) => events.find((e) => e.code === code)!;

const paris = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);

test("drops all-day Férié entries and keeps timed courses", () => {
  assert.equal(skippedAllDay, 1);
  assert.equal(events.length, 4);
});

test("reads times as UTC instants that land on the right Paris wall clock", () => {
  const event = byCode("25-010-NAT-M0069");
  assert.equal(event.start.toISOString(), "2026-09-02T07:30:00.000Z");
  assert.equal(paris(event.start), "02/09/2026 09:30");
  assert.equal(paris(event.end), "02/09/2026 13:00");
});

test("pulls fields from the structured description", () => {
  const event = byCode("25-010-NAT-M0069");
  assert.equal(event.teacher, "CHESNEAU");
  assert.equal(event.group, "BAC+3 ALL 26/27 EPSI BDX");
  assert.equal(event.uid, "Cours-531292-1-ETUDIANT_Test-Index-Education");
});

test("strips room capacities and keeps multi-room lists", () => {
  assert.equal(byCode("25-010-NAT-M0069").room, "F100");
  assert.equal(byCode("26-031-NAT-M0175").room, "F408, F410 MYDIL");
});

test("survives a course with no teacher", () => {
  const event = byCode("26-031-NAT-M0239");
  assert.equal(event.teacher, "");
  assert.ok(event.group.length > 0);
});

test("extracts the Teams link out of the description HTML", () => {
  const event = byCode("25-010-NAT-M0069");
  assert.ok(event.teamsUrl?.startsWith("https://teams.microsoft.com/"));
  assert.ok(!event.teamsUrl?.includes("<"));
  assert.equal(event.teamsUrl?.split(" | ").length, 1);
});

test("courses without a Teams link report null", () => {
  assert.equal(byCode("26-031-NAT-M0171").teamsUrl, null);
});

test("resolves course names with a code fallback", () => {
  assert.equal(
    resolveCourseName("26-031-NAT-M0175", "COURAUD", { "26-031-NAT-M0175": "PHP Symfony" }),
    "PHP Symfony"
  );
  assert.equal(resolveCourseName("26-031-NAT-M0175", "COURAUD", {}), "26-031-NAT-M0175 · COURAUD");
  assert.equal(resolveCourseName("26-031-NAT-M0175", "", {}), "26-031-NAT-M0175");
});

test("deduplicates on UID", () => {
  assert.equal(deduplicateEvents([...events, ...events]).length, events.length);
});

test("emits UTC timestamps and carries the Hyperplanning UID through", () => {
  const ics = generateIcal([byCode("25-010-NAT-M0069")]);
  assert.match(ics, /^DTSTART:20260902T073000Z$/m);
  assert.match(ics, /^DTEND:20260902T110000Z$/m);
  assert.match(ics, /^UID:Cours-531292-1-ETUDIANT_Test-Index-Education$/m);
  assert.doesNotMatch(ics, /TZID/);
});

test("builds a readable description", () => {
  const ics = generateIcal([byCode("26-031-NAT-M0171")]);
  assert.match(ics, /Prof: ALZATE/);
  assert.match(ics, /Groupe: BAC\+3 ALL 26\/27 EPSI BDX/);
  assert.match(ics, /Salle: F408/);
});
