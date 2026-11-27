import type { Model } from "./model.ts";
import * as directiveRead from "./directive/read.ts";
import * as directiveWrite from "./directive/write.ts";
import * as externalRead from "./external/read.ts";
import * as externalWrite from "./external/write.ts";

export type Profile = {
  name: string;
  /** Optional model change the profile requires before writing (for example a label rename). */
  prepare?: (model: Model) => Model;
  readDocument: (source: string, options?: { requireMarker?: boolean }) => Model;
  writeDocument: (model: Model) => string;
};

export const PROFILES: Record<string, Profile> = {
  directive: { name: "directive", readDocument: directiveRead.readDocument, writeDocument: directiveWrite.writeDocument },
  external: { name: "external", readDocument: externalRead.readDocument, writeDocument: externalWrite.writeDocument },
  "external-renamed": { name: "external-renamed", prepare: externalWrite.prefixLabels, readDocument: externalRead.readDocument, writeDocument: externalWrite.writeDocument },
};
