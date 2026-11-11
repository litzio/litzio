import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { editorExtensions } from "../src/editor-schema.tsx";
import { toTiptapDocument } from "../src/tiptap-document.ts";
import { DOCUMENT_WRITING_TOUR } from "../src/tour/document-writing-tour.ts";
import { EMPTY_PROBE, placeCard, probeDocument, reduceTour, startTour, stepReady, type TourProbe } from "../src/tour/tour.ts";
import { loadEditableDocument, nativeSource } from "./helpers/document.ts";
import { en, ko } from "../src/locales.ts";
import { i18n } from "../src/i18n.ts";

const schema = getSchema(editorExtensions());
const docOf = (markdown: string) => schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(nativeSource(markdown))));
const probe = (patch: Partial<TourProbe>): TourProbe => ({ ...EMPTY_PROBE, ...patch });
const steps = DOCUMENT_WRITING_TOUR;
const at = (index: number) => ({ index, active: true });

test("the probe reads title, headings with text, tables and cross-references from the engine document", () => {
  assert.deepEqual(probeDocument(docOf("Plain.\n")), EMPTY_PROBE);
  const doc = docOf("# Start\n\n:::{table}\n:name: tbl\n\n| A |\n| --- |\n| 1 |\n:::\n\nSee {numref}`tbl` and {ref}`tbl`.\n");
  assert.deepEqual(probeDocument(doc, true), { title: "", titleFocused: true, headings: 1, tables: 1, references: 2 });
  const titled = doc.type.create({ ...doc.attrs, title: "My title" }, doc.content);
  assert.equal(probeDocument(titled).title, "My title");
});

test("a heading without text is not a finished heading step", () => {
  const empty = docOf("Plain.\n");
  const withEmptyHeading = schema.nodeFromJSON({ ...empty.toJSON(), content: [{ type: "heading", attrs: { level: 2 } }, ...empty.toJSON().content] });
  assert.equal(probeDocument(withEmptyHeading).headings, 0);
});

test("the title step waits for a title and for the caret to leave it", () => {
  const title = steps[0]!;
  assert.equal(stepReady(title, probe({ title: "" })), false);
  assert.equal(stepReady(title, probe({ title: "Draft", titleFocused: true })), false);
  assert.equal(stepReady(title, probe({ title: "Draft" })), true);
  assert.equal(reduceTour(startTour(), steps, { type: "probe", probe: probe({ title: "Draft", titleFocused: true }) }).index, 0);
  assert.equal(reduceTour(startTour(), steps, { type: "probe", probe: probe({ title: "Draft" }) }).index, 1);
});

test("manual steps ignore probes and Next needs the goal", () => {
  const heading = at(1);
  assert.deepEqual(reduceTour(heading, steps, { type: "probe", probe: probe({ headings: 1 }) }), heading);
  assert.deepEqual(reduceTour(heading, steps, { type: "next", probe: probe({}) }), heading);
  assert.deepEqual(reduceTour(heading, steps, { type: "next", probe: probe({ headings: 1 }) }), at(2));
  // The outline step has no goal: Next always works.
  assert.deepEqual(reduceTour(at(2), steps, { type: "next", probe: EMPTY_PROBE }), at(3));
});

test("the table step advances by itself and the last Next finishes the tour", () => {
  assert.deepEqual(reduceTour(at(3), steps, { type: "probe", probe: probe({ tables: 1 }) }), at(4));
  const last = at(steps.length - 1);
  assert.deepEqual(reduceTour(last, steps, { type: "probe", probe: probe({ references: 1 }) }), last);
  assert.equal(reduceTour(last, steps, { type: "next", probe: probe({}) }).active, true);
  assert.equal(reduceTour(last, steps, { type: "next", probe: probe({ references: 1 }) }).active, false);
});

test("exit ends the tour from any step and an ended tour stays ended", () => {
  for (let index = 0; index < steps.length; index++) assert.equal(reduceTour(at(index), steps, { type: "exit" }).active, false);
  const ended = { index: 2, active: false };
  assert.deepEqual(reduceTour(ended, steps, { type: "next", probe: EMPTY_PROBE }), ended);
});

test("the card sits beside the region and always stays inside the viewport", () => {
  const viewport = { width: 1000, height: 800 }, card = { width: 300, height: 150 };
  assert.deepEqual(placeCard({ top: 100, left: 100, width: 200, height: 40 }, card, viewport, 16), { top: 156, left: 50 });
  // No room below: above the region.
  assert.deepEqual(placeCard({ top: 700, left: 400, width: 200, height: 40 }, card, viewport, 16), { top: 534, left: 350 });
  // A tall region fills the height: beside it, to the left of a right-hand panel.
  assert.deepEqual(placeCard({ top: 0, left: 700, width: 300, height: 800 }, card, viewport, 16), { top: 325, left: 384 });
  // Nothing fits: inside the region's lower edge.
  const inside = placeCard({ top: 0, left: 0, width: 1000, height: 800 }, card, viewport, 16);
  assert.ok(inside.top >= 16 && inside.top + card.height <= 800 - 16 && inside.left >= 16 && inside.left + card.width <= 1000 - 16);
});

test("every tour string exists in both languages", async () => {
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      for (const step of steps) for (const text of [step.title(), step.body(), step.hint?.() ?? "x"]) {
        assert.ok(text.trim() && !text.startsWith("Tour: "), `${language}: ${text}`);
      }
    }
  } finally { await i18n.changeLanguage("en"); }
  for (const key of Object.keys(en).filter(key => key.startsWith("Tour: "))) assert.notEqual(ko[key as keyof typeof en], en[key as keyof typeof en], key);
});
