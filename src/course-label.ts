import { readFileSync, existsSync } from "fs";
import path from "path";

const LABELS_PATH = path.join(import.meta.dirname, "..", "course-names.json");
const MAX_LABEL_LENGTH = 48;

export type CourseKind = "cours" | "atelier" | "evaluation" | "autonomie" | "vie-de-classe";

export type CourseLabels = Record<string, string>;

const KIND_EMOJI: Record<CourseKind, string> = {
  cours: "📘",
  atelier: "🛠",
  evaluation: "🎯",
  autonomie: "🏠",
  "vie-de-classe": "👥",
};

const KIND_TEXT: Record<CourseKind, string> = {
  cours: "Cours",
  atelier: "Atelier",
  evaluation: "Évaluation",
  autonomie: "Autonomie",
  "vie-de-classe": "Vie de classe",
};

const TYPE_PREFIXES = [
  /^autonomie\s*[-–:]\s*/i,
  /^classe\s+inversée\s*[-–:]\s*/i,
  /^workshop\s*[-–:]\s*/i,
  /^atelier\s*[-–:]?\s+/i,
];

// Hyperplanning mixes straight and curly apostrophes in the same feed, so an
// override keyed on one form would silently miss the other.
function normalize(course: string): string {
  return course.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

export function loadCourseLabels(): CourseLabels {
  if (!existsSync(LABELS_PATH)) return {};

  const parsed: unknown = JSON.parse(readFileSync(LABELS_PATH, "utf-8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`[course-label] ${LABELS_PATH} must contain a JSON object`);
  }

  const labels: CourseLabels = {};
  for (const [course, label] of Object.entries(parsed)) {
    if (typeof label === "string" && label.trim()) labels[normalize(course)] = label.trim();
  }
  return labels;
}

export function classifyCourse(course: string): CourseKind {
  const name = normalize(course);

  if (/^autonomie\b/i.test(name)) return "autonomie";
  if (/\b(mspr|dossier|examen|soutenance|évaluation)\b/i.test(name)) return "evaluation";
  if (/^(atelier|workshop|classe inversée)\b/i.test(name)) return "atelier";
  if (/\b(temps de vie de classe|conseil pédagogique)\b/i.test(name)) return "vie-de-classe";
  return "cours";
}

function stripTypePrefixes(name: string): string {
  let stripped = name;
  for (let i = 0; i < TYPE_PREFIXES.length; i++) {
    const shorter = stripped.replace(TYPE_PREFIXES[i], "");
    if (shorter !== stripped && shorter.length > 0) {
      stripped = shorter;
      i = -1;
    }
  }
  return stripped;
}

function truncateOnWord(name: string): string {
  if (name.length <= MAX_LABEL_LENGTH) return name;

  const cut = name.slice(0, MAX_LABEL_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s:,;·-]+$/, "")}…`;
}

export function shortenCourse(course: string, labels: CourseLabels): string {
  const name = normalize(course);

  const override = labels[name];
  if (override) return override;

  return truncateOnWord(stripTypePrefixes(name));
}

export function courseKindText(kind: CourseKind): string {
  return KIND_TEXT[kind];
}

export function courseLabel(course: string, room: string, labels: CourseLabels): string {
  const title = `${KIND_EMOJI[classifyCourse(course)]} ${shortenCourse(course, labels)}`;
  return room ? `${title} · ${room}` : title;
}
