import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCourse, courseLabel, shortenCourse } from "../src/course-label.js";

test("classifies a plain course", () => {
  assert.equal(classifyCourse("Méthodologie Agile & DevOps"), "cours");
});

test("classifies workshops and inverted classes as ateliers", () => {
  assert.equal(classifyCourse("Atelier Scrum"), "atelier");
  assert.equal(classifyCourse("Workshop - Créativité & Innovation"), "atelier");
  assert.equal(classifyCourse("Classe inversée - Développement en Python"), "atelier");
});

test("classifies MSPR and dossiers as évaluations", () => {
  assert.equal(classifyCourse("MSPR : Mise en production"), "evaluation");
  assert.equal(classifyCourse("Dossier professionnel: Explications par groupe"), "evaluation");
});

test("autonomie wins over the underlying course type", () => {
  assert.equal(classifyCourse("Autonomie - MSPR: Dvp et deploiement"), "autonomie");
  assert.equal(classifyCourse("Autonomie - Workshop - Créativité & Innovation"), "autonomie");
});

test("classifies class-life slots", () => {
  assert.equal(classifyCourse("Temps de vie de classe"), "vie-de-classe");
  assert.equal(classifyCourse("Conseil pédagogique"), "vie-de-classe");
});

test("strips type prefixes and collapses doubled spaces", () => {
  assert.equal(shortenCourse("Atelier Scrum", {}), "Scrum");
  assert.equal(shortenCourse("Atelier : Modélisation des données et UML", {}), "Modélisation des données et UML");
  assert.equal(shortenCourse("Workshop - Créativité & Innovation", {}), "Créativité & Innovation");
  assert.equal(shortenCourse("Le langage SQL &  SGBD", {}), "Le langage SQL & SGBD");
});

test("an override wins over the prefix rules", () => {
  const overrides = { "Atelier Scrum": "Scrum agile" };
  assert.equal(shortenCourse("Atelier Scrum", overrides), "Scrum agile");
});

test("a straight-apostrophe override matches the feed's curly apostrophe", () => {
  const overrides = { "Atelier : L'industrialisation des tests": "CI des tests" };
  assert.equal(shortenCourse("Atelier : L’industrialisation  des tests", overrides), "CI des tests");
});

test("truncates on a word boundary when nothing shortens a long name", () => {
  const long = "Architecture applicative : structuration des services et de la persistance";
  const short = shortenCourse(long, {});
  assert.ok(short.length <= 49, `got ${short.length}: ${short}`);
  assert.ok(short.endsWith("…"));
  assert.ok(!short.includes("  "));
  assert.ok(long.startsWith(short.slice(0, -1).trim()));
});

test("keeps a name that is already short enough intact", () => {
  assert.equal(shortenCourse("Développement BlockChain", {}), "Développement BlockChain");
});

test("builds the calendar title from emoji, short name and room", () => {
  assert.equal(courseLabel("Atelier Scrum", "F207", {}), "🛠 Scrum · F207");
  assert.equal(courseLabel("Méthodologie Agile & DevOps", "", {}), "📘 Méthodologie Agile & DevOps");
});
