import { readFileSync, existsSync } from "fs";
import path from "path";

const NAMES_PATH = path.join(import.meta.dirname, "..", "course-names.json");

export type CourseNames = Record<string, string>;

export function loadCourseNames(): CourseNames {
  if (!existsSync(NAMES_PATH)) return {};

  const parsed: unknown = JSON.parse(readFileSync(NAMES_PATH, "utf-8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`[course-names] ${NAMES_PATH} must contain a JSON object`);
  }

  const names: CourseNames = {};
  for (const [code, name] of Object.entries(parsed)) {
    if (typeof name === "string" && name.trim()) names[code] = name.trim();
  }
  return names;
}

export function resolveCourseName(
  code: string,
  teacher: string,
  names: CourseNames
): string {
  const mapped = names[code];
  if (mapped) return mapped;
  return teacher ? `${code} · ${teacher}` : code;
}
