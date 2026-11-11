const NAMES: Record<string, [singular: string, plural: string]> = {
  resource: ["File", "Files"],
  lti: ["Recording", "Recordings"],
  url: ["Link", "Links"],
  folder: ["Folder", "Folders"],
  assign: ["Assignment", "Assignments"],
  forum: ["Forum", "Forums"],
  choice: ["Survey", "Surveys"],
  quiz: ["Quiz", "Quizzes"],
  page: ["Page", "Pages"],
};

export const KNOWN_TYPES = Object.keys(NAMES);

export function typeName(type: string): string {
  return NAMES[type]?.[0] ?? type;
}

export function typeNamePlural(type: string): string {
  return NAMES[type]?.[1] ?? `${type} items`;
}
