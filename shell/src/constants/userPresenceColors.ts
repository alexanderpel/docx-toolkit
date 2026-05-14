// 24-color palette used to assign distinct cursor + chip colors to
// collaborators. Picked round-robin, so ordering doesn't carry meaning —
// just keep the values WCAG-AA legible on both light and dark backgrounds.
export const USER_PRESENCE_COLORS: readonly string[] = [
  "#E53935", "#D81B60", "#8E24AA", "#5E35B1",
  "#3949AB", "#1E88E5", "#039BE5", "#00ACC1",
  "#00897B", "#43A047", "#7CB342", "#C0CA33",
  "#FDD835", "#FFB300", "#FB8C00", "#F4511E",
  "#6D4C41", "#546E7A", "#AD1457", "#4527A0",
  "#1565C0", "#2E7D32", "#EF6C00", "#4E342E",
] as const;
