import path from "node:path";

/** Paths owned by a test run; provider login remains inherited separately. */
export function isolatedHostEnvironment(root: string, data = path.join(root, "data")) {
  return {
    LITZIO_DATA_DIR: data,
    LITZIO_ASSISTANT_CWD: path.join(root, "assistant"),
    LITZIO_ASSISTANT_SETTINGS_FILE: path.join(data, "assistant.json"),
    LITZIO_DAEMON_DIR: path.join(root, "daemon"),
    LITZIO_PLUGINS_SETTINGS_FILE: path.join(data, "plugins.json"),
    LITZIO_RESET_DIR: path.join(root, "reset-guard"),
  };
}
