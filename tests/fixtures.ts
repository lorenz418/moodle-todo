import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES_DIR = join(__dirname, "..", "examples");

export const PAGES = {
  nano: "Kurs: Nanotechnologie | TUM.html",
  matsci: "Kurs: Material Science I (for MSE) | TUM.html",
  odes: "Course: Modeling and Simulation with ODEs [MA9803] | TUM.html",
  mpd: "Kurs: Methods of Product Development - 0249955018 | TUM.html",
  thermoHome: "Kurs: Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoNotes: "Abschnitt: Lecture notes | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoOct13: "Abschnitt: Oct 13, 14 | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoOct27: "Abschnitt: Oct 27 | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  numHome: "Kurs: Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numAufzeichnungen: "Abschnitt: Aufzeichnungen | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numVorlesung: "Abschnitt: Vorlesung | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numUebung: "Abschnitt: Übung | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  dashboard: "Meine Startseite | TUM.html",
} as const;

export type PageKey = keyof typeof PAGES;

const cache = new Map<string, string>();

export function readExample(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const wanted = name.normalize("NFC");
  const actual = readdirSync(EXAMPLES_DIR).find((f) => f.normalize("NFC") === wanted);
  if (!actual) throw new Error(`Example file not found: ${name}`);
  const html = readFileSync(join(EXAMPLES_DIR, actual), "utf8");
  cache.set(name, html);
  return html;
}

export function loadPage(key: PageKey): Document {
  return new DOMParser().parseFromString(readExample(PAGES[key]), "text/html");
}
