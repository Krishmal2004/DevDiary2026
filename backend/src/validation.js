// Small input validators shared by the API routes.

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Due dates are either all-day ("YYYY-MM-DD") or a full timestamp, which is
// normalised to UTC ISO so string comparison in SQL orders them correctly.
// Returns undefined for invalid input.
function normalizeDueDate(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isValidDateString(value) ? value : undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

// Only http(s) links are stored, so they're safe to render as hrefs.
function normalizeUrl(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTimezone(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

module.exports = { isValidDateString, normalizeDueDate, normalizeUrl, isValidEmail, isValidTimezone };
