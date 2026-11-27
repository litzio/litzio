/** Explicit opt-in to publishing a caller-correctable failure. Never include secrets or internal paths. */
export class PluginPublicError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "PluginPublicError"; }
}
