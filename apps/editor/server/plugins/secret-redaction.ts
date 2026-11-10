/** Redact only the publishing plugin's values, preserving schema keys. */
export function safePluginValue<T>(value: T, secrets: readonly string[]): T {
  if (typeof value === 'string') {
    // Longest first, in one pass, so overlaps and the marker cannot leak fragments.
    const escaped = [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)
      .map(secret => secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return (escaped.length ? value.replace(new RegExp(escaped.join('|'), 'g'), '[secret]') : value) as T;
  }
  if (Array.isArray(value)) return value.map(item => safePluginValue(item, secrets)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safePluginValue(item, secrets)])) as T;
  return value;
}

/** Refuse remaining literal secrets anywhere in JSON, without renaming schema keys. */
export function assertNoPluginSecrets(value: unknown, secrets: readonly string[]): void {
  const known = [...new Set(secrets)].filter(Boolean);
  const contains = (text: string) => known.some(secret => text.includes(secret));
  const visit = (item: unknown): boolean => {
    if (Array.isArray(item)) return item.some(visit);
    if (item && typeof item === "object") return Object.entries(item).some(([key, child]) => contains(key) || visit(child));
    return item !== undefined && contains(String(item));
  };
  if (known.length && visit(value)) throw new Error("Plugin result contains a secret");
}
