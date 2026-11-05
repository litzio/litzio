/** Presentation fallback only; identifiers and bound values remain unchanged. */
export function readableLabel(value: string): string {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toLocaleUpperCase() + words.slice(1) : value;
}
