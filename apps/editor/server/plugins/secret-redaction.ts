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
