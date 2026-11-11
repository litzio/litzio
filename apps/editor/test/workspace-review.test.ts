import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReviewLedger } from "@litzio/plugin-sdk";
import { pageExclusionReason } from "../src/review/workspace-review.ts";

test("page exclusion refuses an existing inserted block without excluding the remaining originals", () => {
  const ledger = {groups:[{targets:[{pages:[2],regions:[],patch:{operations:[{type:"insert",insertedKey:"insert:one"}]}}]}]} as unknown as ReviewLedger;
  const state = {ledger,snapshot:{inputs:[{key:"insert:one"}]}};
  assert.ok(pageExclusionReason(state,[1,2]));
  assert.equal(pageExclusionReason(state,[1]),undefined);
  assert.equal(pageExclusionReason({...state,snapshot:{inputs:[]}},[2]),undefined); // Undo removed the insertion.
  ledger.groups[0]!.targets[0]!.pages=[];
  assert.ok(pageExclusionReason(state,[1])); // Unlocated insertion cannot be silently omitted.
});
