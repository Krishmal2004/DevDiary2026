// Display helpers shared by the repository pages.

export function timeAgo(iso) {
  if (!iso) return "never";
  const seconds = (Date.now() - new Date(iso)) / 1000;
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.floor(seconds / size), unit);
    }
  }
  return "just now";
}

// Colours GitHub's linguist uses for the most common languages.
const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Rust: "#dea584",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
  Shell: "#89e051",
  PowerShell: "#012456",
  "Jupyter Notebook": "#DA5B0B",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dockerfile: "#384d54",
  Lua: "#000080",
  R: "#198CE7",
};

export function languageColor(language) {
  return LANGUAGE_COLORS[language] || "#8b949e";
}
