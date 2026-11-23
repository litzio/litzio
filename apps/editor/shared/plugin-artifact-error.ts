export class PluginArtifactChangedError extends Error {
  constructor() { super("Artifact changed; reload the plugin"); }
}
