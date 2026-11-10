import { LOCAL_HOST_ID, sameLocator } from "./host-locator.ts";
import { brand } from "../../../brand.ts";
import type { SessionSnapshot } from "./DocumentTab.tsx";

export const RECOVERY_DAYS = 10;
export const RECOVERY_DB = `${brand.storagePrefix}-recovery`;
export type RecoveryRecord = {
  id: string;
  version: number;
  hostId: string;
  path: string;
  recordedAt: number;
  /** Optional for existing v1 records; changes when dirty work follows clean state. */
  recordingGeneration?: number;
  recoveryText: string;
  snapshot: SessionSnapshot;
};
const TICKET_LIFETIME = RECOVERY_DAYS * 86400000;
const CLEAN_PREFIX = `${brand.storagePrefix}.recoveryClean.v1.`;
type Ticket = [number, string | null, number, string];
type Barrier = { generation: string; expiresAt: number; path: string; hostId: string };

// A session-local clean acknowledgement must survive a reload before IndexedDB's
// next turn. It contains no document data. New applied work clears it before writing.
function clearClean(id: string): void { localStorage.removeItem(CLEAN_PREFIX + id); }
function cleanAcknowledgements(): Map<string, string> {
  const result = new Map<string, string>();
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(CLEAN_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (value !== null && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))) result.set(key.slice(CLEAN_PREFIX.length), value);
    }
  } catch { result.clear(); /* Unavailable acknowledgements never authorize record deletion. */ }
  return result;
}

/** getRandomValues also works on a non-localhost HTTP Host (randomUUID does not). */
export function newRecoveryId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    // Older writers must not reopen the Host-scoped ticket protocol.
    const request = indexedDB.open(RECOVERY_DB, 4);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) {
        request.result.createObjectStore("records", { keyPath: "id" });
        request.result.createObjectStore("barriers");
      } else {
        // Records remain unconverted; old barriers grant no v4 permission.
        request.transaction!.objectStore("barriers").clear();
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { abandoned = true; reject(new Error("Local recovery storage is busy in another window.")); };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  }).catch(error => { connection = undefined; throw error; });
}

async function transaction<T>(run: (records: IDBObjectStore, barriers: IDBObjectStore, done: (result: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(["records", "barriers"], "readwrite");
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Local recovery transaction failed."));
    try { run(tx.objectStore("records"), tx.objectStore("barriers"), value => { result = value; }, error => { reject(error); tx.abort(); }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

function ticket(barriers: IDBObjectStore, id: string, hostId: string, done: (value: Ticket) => void): void {
  const all = barriers.get(`all:${JSON.stringify(hostId)}`);
  const session = barriers.get(["session", id]);
  session.onsuccess = () => done([Number(all.result ?? 0), (session.result as Barrier | undefined)?.generation ?? null, Date.now(), hostId]);
}

/** Tickets are captured on an applied edit, never on a later Save or timer turn.
 * IndexedDB transactions order deletion with writes across windows, without relying on messages. */
export const recoveryStorage = {
  /** File operations invalidate queued writes and move/discard matching records atomically. */
  changePath(previous: string, next: string | null, expected?: RecoveryRecord[], hostId = LOCAL_HOST_ID, descendants = false): Promise<void> {
    const matches = (locator: { hostId: string; path: string }) => sameLocator(locator, { hostId, path: previous }) ||
      descendants && locator.hostId === hostId && (locator.path.startsWith(previous + "/") || locator.path.startsWith(previous + "\\"));
    return transaction((records, barriers, done, fail) => {
      const apply = () => {
        // Permission exists before the first record. Revoke all sessions registered to this
        // path, including writers in other windows that have not reached their write turn.
        const pending = barriers.openCursor();
        pending.onsuccess = () => {
          const entry = pending.result;
          if (!entry) return;
          try {
            if (Array.isArray(entry.key) && entry.key[0] === "session" && matches(entry.value as Barrier)) entry.delete();
            entry.continue();
          } catch (error) { fail(error); }
        };
        const cursor = records.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) { done(undefined); return; }
          try {
            const record = entry.value as RecoveryRecord;
            if (matches(record)) {
              barriers.delete(["session", record.id]);
              if (next === null) entry.delete();
              else entry.update({ ...record, path: next, snapshot: { ...record.snapshot, file: { ...record.snapshot.file, path: next } } });
            }
            entry.continue();
          } catch (error) { fail(error); }
        };
      };
      if (expected === undefined) { apply(); return; }
      const read = records.getAll();
      read.onsuccess = () => {
        const matching = (read.result as RecoveryRecord[]).filter(record => sameLocator(record, { hostId, path: previous })).sort((a, b) => a.id.localeCompare(b.id));
        if (JSON.stringify(matching) !== JSON.stringify(expected)) { fail(new Error("Recovery work changed during deletion; the records were preserved.")); return; }
        apply();
      };
    });
  },
  restore(record: RecoveryRecord, id: string): Promise<void> {
    return transaction((records, barriers, done, fail) => {
      const stored = records.get(record.id);
      stored.onsuccess = () => {
        if (JSON.stringify(stored.result) !== JSON.stringify(record)) {
          fail(new Error("This recovery record changed or was deleted. Close this dialog and review the latest record."));
          return;
        }
        try {
          barriers.delete(["session", record.id]);
          records.delete(record.id);
          records.put({ ...record, id, recordingGeneration: 0 });
          done(undefined);
        } catch (error) { fail(error); }
      };
    });
  },
  async ticket(id: string, path: string, hostId = LOCAL_HOST_ID): Promise<Ticket> {
    const db = await database();
    return new Promise<Ticket>((resolve, reject) => {
      const tx = db.transaction("barriers", "readwrite");
      let result: Ticket;
      const barriers = tx.objectStore("barriers");
      const all = barriers.get(`all:${JSON.stringify(hostId)}`);
      const session = barriers.get(["session", id]);
      session.onsuccess = () => {
        try {
          const previous = session.result as Barrier | undefined;
          const issuedAt = Date.now();
          const generation = previous && sameLocator(previous, { hostId, path }) ? previous.generation : newRecoveryId();
          // A backwards clock must not shorten an earlier pending ticket's registration.
          barriers.put({ generation, path, hostId, expiresAt: Math.max(previous?.expiresAt ?? 0, issuedAt + TICKET_LIFETIME) } satisfies Barrier, ["session", id]);
          result = [Number(all.result ?? 0), generation, issuedAt, hostId];
        } catch (error) { reject(error); tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Local recovery ticket failed."));
    });
  },
  write(id: string, expected: Ticket, capture: () => RecoveryRecord | null | undefined): Promise<boolean> {
    return transaction((records, barriers, done, fail) => ticket(barriers, id, expected[3], current => {
      let written = false;
      const age = Date.now() - expected[2];
      // Clock rollback may delay expiry, but must not drop an otherwise valid edit.
      // Deletion safety comes from nonce/global equality, including after GC.
      if (age < TICKET_LIFETIME && current[0] === expected[0] &&
          current[1] !== null && current[1] === expected[1]) {
        try {
          // Capture at the actual write turn, after all earlier transactions and barriers.
          const record = capture();
          if (record) { clearClean(id); records.put(record); }
          else if (record === null) records.delete(id);
          written = record !== undefined;
        } catch (error) { fail(error); }
      }
      done(written);
    }));
  },
  delete(id?: string, hostId = LOCAL_HOST_ID): Promise<void> {
    return transaction((records, barriers, done, fail) => {
      if (id !== undefined) {
        barriers.delete(["session", id]);
        records.delete(id);
        done(undefined);
        return;
      }
      const key = `all:${JSON.stringify(hostId)}`;
      const read = barriers.get(key);
      read.onsuccess = () => {
        try {
          // Invalidate only this Host's pending tickets. Other Hosts keep their permissions.
          const sessions = barriers.openCursor();
          sessions.onsuccess = () => {
            const entry = sessions.result;
            if (!entry) return;
            if (Array.isArray(entry.key) && entry.key[0] === "session" && entry.value.hostId === hostId) entry.delete();
            entry.continue();
          };
          barriers.put(Number(read.result ?? 0) + 1, key);
          const cursor = records.openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            // Legacy unknown-Host records are discardable locally, never reassigned.
            if (entry.value.hostId === hostId || hostId === LOCAL_HOST_ID && !entry.value.hostId) entry.delete();
            entry.continue();
          };
          done(undefined);
        } catch (error) { fail(error); }
      };
    });
  },
  async list(now = Date.now()): Promise<RecoveryRecord[]> {
    let clean = new Map<string, string>();
    const kept = await transaction<RecoveryRecord[]>((records, barriers, done, fail) => {
      const cursor = barriers.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        try {
          if (Array.isArray(entry.key) && (entry.value as Barrier).expiresAt <= now) entry.delete();
          entry.continue();
        } catch (error) { fail(error); }
      };
      const read = records.getAll();
      read.onsuccess = () => {
        try {
          clean = cleanAcknowledgements();
          const kept: RecoveryRecord[] = [];
          for (const record of read.result as RecoveryRecord[]) {
            // Unscoped records cannot contribute to Host work or authorize cleanup.
            // Preserve them verbatim; do not migrate or infer a local Host.
            if (typeof record.hostId !== "string" || !record.hostId.trim()) continue;
            const expired = Number.isFinite(record.recordedAt) && now - record.recordedAt >= RECOVERY_DAYS * 86400000;
            const recordedGeneration = record.recordingGeneration;
            const cleanGeneration = clean.get(record.id);
            const acknowledged = typeof recordedGeneration === "number" && Number.isSafeInteger(recordedGeneration) &&
              recordedGeneration >= 0 && cleanGeneration !== undefined && recordedGeneration <= Number(cleanGeneration);
            if (acknowledged || expired) {
              records.delete(record.id);
              // Clean acknowledgement is the recorder's null snapshot, not an explicit
              // discard. Preserve its live ticket for a newer Save acknowledgement.
              if (expired) barriers.delete(["session", record.id]);
            }
            else kept.push(record);
          }
          const time = (record: RecoveryRecord) => Number.isFinite(record.recordedAt) ? record.recordedAt : 0;
          done(kept.sort((a, b) => time(b) - time(a)));
        } catch (error) { fail(error); }
      };
    });
    // Consume only after commit, including orphaned acknowledgements. A later dirty/
    // clean generation must survive this older cleanup completion.
    for (const [id, nonce] of clean) {
      try { if (localStorage.getItem(CLEAN_PREFIX + id) === nonce) clearClean(id); }
      catch { /* Keeping an already-clean acknowledgement is safe. */ }
    }
    return kept;
  },
};

/** Plaintext escape hatch independent of schema/canonical validation, including atom attributes. */
export function recoveryText(snapshot: SessionSnapshot): string {
  if (snapshot.kind === "text") return snapshot.text;
  // A readable salvage copy, not Markdown serialization or a document write path.
  function visit(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const node = value as { type?: string; text?: unknown; attrs?: Record<string, unknown>; content?: unknown[]; marks?: {type?: string; attrs?: Record<string, unknown>}[] };
    const type = node.type;
    const attrs = node.attrs ?? {};
    const string = (value: unknown) => typeof value === "string" ? value : "";
    const separator = type === "doc" ? "\n\n" : type === "table" || type === "bulletList" || type === "orderedList" || type === "listItem" ? "\n" : type === "tableRow" ? "\t" : "";
    let text = string(node.text) || (Array.isArray(node.content) ? node.content.map(visit).join(separator) : "");
    if (type === "doc") text = [string(attrs.title), text].filter(Boolean).join("\n\n");
    if (type === "hardBreak") text = "\n";
    if (type === "equation") text = string(attrs.latex);
    if (type === "inlineMath") text = string(attrs.value);
    if (type === "crossReference" || type === "footnoteReference") text = string(attrs.label);
    if (type === "citation" && Array.isArray(attrs.keys)) text = attrs.keys.filter(key => typeof key === "string").join(", ");
    const properties = [string(attrs.imageAlt), string(attrs.imageUrl)].filter(Boolean);
    if (properties.length) text = [text, ...properties].filter(Boolean).join("\n");
    const links = (node.marks ?? []).filter(mark => mark.type === "link").map(mark => string(mark.attrs?.href));
    return text + links.filter(Boolean).map(link => ` (${link})`).join("");
  }
  return visit(snapshot.editor.editorDocument);
}

/** One recorder per mounted document session. Recovery never gates editing, Save or closing. */
export function createRecoveryRecorder(id: string, documentPath: () => string, capture: () => SessionSnapshot | null, failed: (error: unknown) => void, succeeded: () => void = () => {}, hostId = LOCAL_HOST_ID) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  let permit: Promise<Ticket | null> | undefined;
  let queue = Promise.resolve();
  let failures = 0;
  let edited = false;
  let recordingGeneration = 0;
  let acknowledgedClean = false;
  const resumeDirty = () => {
    if (acknowledgedClean) { recordingGeneration++; acknowledgedClean = false; }
    return recordingGeneration;
  };
  const reportFailure = (error: unknown) => { failures++; failed(error); };
  const schedule = () => {
    if (timer || !permit) return;
    const current = epoch;
    timer = setTimeout(() => {
      timer = undefined;
      const allowed = permit!;
      queue = queue.then(async () => {
        const token = await allowed;
        if (!token || current !== epoch) return;
        let capturedFailures = failures;
        const written = await recoveryStorage.write(id, token, () => {
          if (current !== epoch) return undefined;
          const snapshot = capture();
          capturedFailures = failures;
          return snapshot ? { id, version: 2, hostId, recordingGeneration: resumeDirty(), path: snapshot.file.path, recordedAt: Date.now(), recoveryText: recoveryText(snapshot), snapshot } : null;
        });
        if (written && current === epoch && capturedFailures === failures) succeeded();
      }).catch(error => { if (current === epoch) reportFailure(error); });
    }, 500);
  };
  const cancel = () => { epoch++; clearTimeout(timer); timer = undefined; permit = undefined; };
  return {
    edit(dirty = true) {
      edited = true;
      try {
        if (dirty) { clearClean(id); resumeDirty(); }
        else { localStorage.setItem(CLEAN_PREFIX + id, String(recordingGeneration)); acknowledgedClean = true; }
      } catch (error) {
        // Never put dirty work behind a clean acknowledgement we could not clear.
        cancel(); reportFailure(error); return;
      }
      const current = epoch;
      permit = recoveryStorage.ticket(id, documentPath(), hostId).catch(error => { if (current === epoch) reportFailure(error); return null; });
      schedule();
    },
    checkpoint: schedule,
    discard(): Promise<boolean> {
      cancel();
      // A never-edited recorder owns neither a ticket nor a record. Restores call edit().
      if (!edited) return Promise.resolve(true);
      const current = epoch, priorFailures = failures;
      // A clean Save can be followed by reload before IndexedDB deletes the record.
      // Dirty explicit discard still needs successful deletion before hiding work.
      try { if (capture() === null) { localStorage.setItem(CLEAN_PREFIX + id, String(recordingGeneration)); acknowledgedClean = true; } }
      catch (error) { reportFailure(error); }
      return recoveryStorage.delete(id).then(() => {
        if (current === epoch && priorFailures === failures) succeeded();
        return true;
      }, error => { if (current === epoch) reportFailure(error); return false; });
    },
    cancel,
  };
}
