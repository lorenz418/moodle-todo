const NAMES: Record<string, string> = {
  resource: "File",
  lti: "Recording",
  url: "Link",
  folder: "Folder",
  assign: "Assignment",
  forum: "Forum",
  choice: "Survey",
  quiz: "Quiz",
  page: "Page",
};

export const KNOWN_TYPES = Object.keys(NAMES);

export function typeName(type: string): string {
  return NAMES[type] ?? type;
}
