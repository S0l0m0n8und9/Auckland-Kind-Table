export function formatGuideDate(value?: string): string {
  if (!value) return "Date not recorded";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.valueOf())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: dateOnly ? "UTC" : "Pacific/Auckland",
    day: "numeric", month: "short", year: "numeric",
  }).format(date);
}
