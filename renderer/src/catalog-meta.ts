// Shared presets for catalog item management.

// Preset menu categories for the cafe. The Add/Edit form also allows a custom value.
export const CATEGORIES = [
  "Smoothies",
  "Acai Bowls",
  "Coffee",
  "Breakfast",
  "Wraps",
  "Bowls",
  "Salads",
  "Sides",
  "Add-ons",
] as const;

// Curated palette — each reads well as a button background with white text on the
// dark register UI. The first entry is the default when no color is chosen.
export const DEFAULT_COLOR = "#16a34a"; // leafy green
export const COLORS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Green", hex: DEFAULT_COLOR },
  { name: "Leaf", hex: "#15803d" },
  { name: "Lime", hex: "#65a30d" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Sky", hex: "#0369a1" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Honey", hex: "#f59e0b" },
  { name: "Amber", hex: "#d97706" },
  { name: "Coffee", hex: "#92400e" },
  { name: "Berry", hex: "#be185d" },
];
