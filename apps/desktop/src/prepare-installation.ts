// NSIS invokes this before replacement/removal, independently of optional CLI cleanup.
import { writeFileSync } from "node:fs";
import { installationPort, prepareInstallation } from "./installation-lifecycle.ts";

if (process.platform !== "win32" || process.argv[2] !== "--prepare-installation") throw new Error("Windows installer entry point only.");
void prepareInstallation(installationPort(process.execPath)).catch(error => {
  if (process.argv[3]) writeFileSync(process.argv[3], `${error.message}\r\n`, "utf16le");
  process.exitCode = 1;
});
