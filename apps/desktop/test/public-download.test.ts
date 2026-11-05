import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPublicRelease } from "./packaged/public-download.ts";

test("public fixture download retries only HTTP 504, at most twice", async (t) => {
  for (const statuses of [[504, 200], [504, 504, 504], [404], [403], [500], [200]]) {
    let calls = 0;
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("fixture", { status: statuses[calls++] }));
    const response = await fetchPublicRelease("https://example.invalid/beta.yml");
    assert.equal(response.status, statuses.at(-1));
    assert.equal(calls, statuses.length);
    assert.equal(await response.text(), "fixture");
    fetchMock.mock.restore();
  }
});

test("public fixture download does not retry transport failures", async (t) => {
  const error = new Error("connection failed");
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw error; });
  await assert.rejects(fetchPublicRelease("https://example.invalid/beta.yml"), (caught) => caught === error);
  assert.equal(fetchMock.mock.callCount(), 1);
});
