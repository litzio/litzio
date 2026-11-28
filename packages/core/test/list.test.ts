import assert from "node:assert/strict";
import test from "node:test";
import * as core from "@litzio/core";
import { semanticFingerprint } from "../src/myst/fingerprint.ts";
import {
  getEditableDocument,
  insertList,
  parse,
  serialize,
  updateList,
  type InlineContent,
  type ListContent,
} from "./core-internal.ts";

const text = (value: string): InlineContent[] => [{ kind: "text", text: value }];

const inlineOnlyItems: { source: string; content: InlineContent[]; definitions?: string }[] = [
  { source: "{cite}`Alpha`", content: [{ kind: "citation", role: "cite", keys: ["Alpha"] }] },
  { source: "{cite:t}`Alpha`", content: [{ kind: "citation", role: "cite:t", keys: ["Alpha"] }] },
  { source: "{cite:p}`Alpha`", content: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] },
  { source: "{cite:p}`Alpha,Beta`", content: [{ kind: "citation", role: "cite:p", keys: ["Alpha", "Beta"] }] },
  { source: "**{cite:p}`Alpha`**", content: [{ kind: "strong", children: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] }] },
  { source: "[^note]", content: [{ kind: "footnote", label: "note" }], definitions: "\n[^note]: Note.\n" },
];

test("native lists admit citation-only and footnote-only items, including nested lists", () => {
  for (const { source, content, definitions = "" } of inlineOnlyItems) {
    const document = core.parse(`---\nlitzio: 1\n---\n\n- ${source}\n  - ${source}\n${definitions}`);
    const list: ListContent = { ordered: false, items: [{ content, list: { ordered: false, items: [{ content }] } }] };
    assert.deepEqual(core.getEditableDocument(document).blocks[0], { block: "list", path: [1], ...list });
    const markdown = core.serialize(core.updateList(document, [1], list));
    assert.deepEqual(core.getEditableDocument(core.parse(markdown)), core.getEditableDocument(document));
    assert.equal(core.serialize(core.parse(markdown)), markdown);
  }
});

test("removing list text preserves the remaining citation or footnote through native Save and reopen", () => {
  for (const { source, content, definitions = "" } of inlineOnlyItems) {
    const document = core.parse(`---\nlitzio: 1\n---\n\n- X${source}\n${definitions}`);
    const list: ListContent = { ordered: false, items: [{ content }] };
    const markdown = core.serialize(core.updateList(document, [1], list));
    const reparsed = core.parse(markdown);
    assert.deepEqual(core.getEditableDocument(reparsed).blocks[0], { block: "list", path: [1], ...list });
    assert.equal(core.serialize(reparsed), markdown);
  }
});

test("list operations allow new endnote references before definitions are supplied", () => {
  const document = core.parse("---\nlitzio: 1\n---\n\n- Original.\n\nAfter.\n");
  const original = core.serialize(document);
  const list: ListContent = { ordered: false, items: [
    { content: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] },
    { content: text("Outer"), list: { ordered: false, items: [{ content: [{ kind: "footnote", label: "new" }] }] } },
  ] };
  for (const insert of [false, true]) {
    const updated = insert ? core.insertList(document, 3, list) : core.updateList(document, [1], list);
    assert.match(core.canonicalWriteError(updated) ?? "", /has no definition/);
    assert.throws(() => core.serialize(updated), /has no definition/);
    const complete = core.insertFootnoteDefinition(updated, insert ? 4 : 3, "new", text("Note."));
    const markdown = core.serialize(complete);
    const reopened = core.parse(markdown);
    const block = core.getEditableDocument(reopened).blocks.find(block => block.path[0] === (insert ? 3 : 1));
    assert.deepEqual(block, { block: "list", path: [insert ? 3 : 1], ...list });
    assert.equal(core.serialize(reopened), markdown);
    assert.equal(core.serialize(document), original);
  }
});

const nestedList: ListContent = {
  ordered: false,
  items: [
    {
      content: [
        { kind: "text", text: "Check " },
        { kind: "strong", children: text("limits") },
        { kind: "text", text: " for " },
        { kind: "math", value: "I_{max}" },
        { kind: "text", text: " in " },
        { kind: "link", url: "https://example.com/manual", children: text("the manual") },
      ],
      list: { ordered: true, start: 1, items: [{ content: text("Measure") }, { content: text("Compare") }] },
    },
    { content: text("Record the result") },
  ],
};

test("Markdown bullet and numbered lists project as editable List v1 content", () => {
  const blocks = getEditableDocument(parse("- A *b*\n\n  3. inner\n- C\n\n7. seven\n8. eight\n")).blocks;

  assert.deepEqual(blocks, [
    {
      block: "list", path: [0], ordered: false, loose: true, items: [
        {
          content: [{ kind: "text", text: "A " }, { kind: "emphasis", children: text("b") }],
          list: { ordered: true, start: 3, items: [{ content: text("inner") }] },
        },
        { content: text("C") },
      ],
    },
    { block: "list", path: [1], ordered: true, start: 7, items: [{ content: text("seven") }, { content: text("eight") }] },
  ]);
});


test("public Core inserts a nested list with rich items and stable canonical Markdown", () => {
  const document = parse("Intro.\n\nAfter.\n");
  const markdown = serialize(insertList(document, 1, nestedList));
  const reparsed = parse(markdown);
  const blocks = getEditableDocument(reparsed).blocks;

  assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "list", "paragraph"]);
  assert.deepEqual(blocks[1], { block: "list", path: [1], ...nestedList });
  assert.equal(serialize(reparsed), markdown);
  assert.deepEqual(
    getEditableDocument(parse(serialize(insertList(document, 1, { ordered: true, items: [{ content: text("x") }] })))).blocks[1],
    { block: "list", path: [1], ordered: true, start: 1, items: [{ content: text("x") }] },
  );
});

test("public Core replaces a list's kind, numbering, items and nesting without touching other blocks", () => {
  const document = parse("# Steps\n\n- Old one\n  - Old nested\n- Old two\n\nClosing paragraph.\n");
  const next: ListContent = { ordered: true, start: 4, items: [{ content: text("New") }, { content: text("Items"), list: { ordered: false, items: [{ content: text("deep") }] } }] };
  const markdown = serialize(updateList(document, [1], next));
  const reparsed = parse(markdown);
  const blocks = getEditableDocument(reparsed).blocks;

  assert.deepEqual(blocks[1], { block: "list", path: [1], ...next });
  assert.deepEqual(blocks[0], { block: "heading", path: [0], level: 1, text: "Steps", content: [{ kind: "text", text: "Steps" }], editable: true });
  assert.equal(blocks[2]?.block === "paragraph" && blocks[2].text, "Closing paragraph.");
  assert.equal(serialize(reparsed), markdown);
});

test("public Core rejects invalid list edits without mutating the source", () => {
  const document = parse("Intro.\n\n- a\n");
  const before = serialize(document);
  const item = { content: text("b") };
  const invalid = [
    () => insertList(document, 1, { ordered: false, items: [] }),
    () => insertList(document, 1, { ordered: false, start: 2, items: [item] }),
    () => insertList(document, 1, { ordered: true, start: -1, items: [item] }),
    () => insertList(document, 1, { ordered: false, items: [{ content: text("a\n\nb") }] }),
    () => insertList(document, 5, { ordered: false, items: [item] }),
    () => updateList(document, [1], { ordered: false, items: [{ content: text("b"), list: { ordered: false, items: [] } }] }),
    () => updateList(document, [0], { ordered: false, items: [item] }),
    () => updateList(document, [1, 0], { ordered: false, items: [item] }),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
  const task = parse("1. [x] task\n");
  assert.throws(() => updateList(task, [0], { ordered: false, items: [item] }), /not editable/);
});

test("native adjacent lists retain boundaries, numbering, nesting and content on canonical reopen", () => {
  const lists: ListContent[] = [
    { ordered: true, start: 0, items: [{ content: text("Zero") }, { content: text("Next") }] },
    { ordered: true, start: 7, items: [{ content: [{ kind: "strong", children: text("Seven") }], list: nestedList }] },
    { ordered: false, items: [{ content: [] }, { content: text("Bullet"), list: nestedList }] },
  ];
  for (const first of lists) for (const second of lists) {
    // Three siblings also exercise switching back to the original marker.
    const expected = [first, second, first];
    let document = core.createDocument();
    for (const [index, list] of expected.entries()) document = core.insertList(document, index + 1, list);
    const markdown = core.serialize(document);
    assert.doesNotMatch(markdown, /<!--/);
    assert.deepEqual(core.getEditableDocument(core.parse(markdown)).blocks,
      expected.map((list, index) => ({ block: "list", path: [index + 1], ...list })));
    assert.equal(core.serialize(document), markdown);
    assert.equal(core.serialize(core.parse(markdown)), markdown);
  }
});

test("canonical writer preserves adjacent list siblings inside a list item without HTML", () => {
  // Multiple nested siblings are outside List v1 admission; the internal writer
  // must still preserve their full semantics rather than introduce HTML nodes.
  for (const markers of [["1.", "7)", "0."], ["*", "-", "*"], ["1.", "*", "7."]]) {
    const document = parse(`* Parent\n\n${markers.map((marker, index) => `  ${marker} Child ${index}`).join("\n\n")}\n`);
    const markdown = serialize(document);
    assert.doesNotMatch(markdown, /<!--/);
    assert.equal(parse(markdown).children[0].children?.[0].children?.filter(node => node.type === "list").length, 3);
    assert.equal(serialize(parse(markdown)), markdown);
    assert.throws(() => core.parse(`---\nlitzio: 1\n---\n\n${markdown}`), /unsupported|not supported/i);
  }
});

test("adjacent checklist and bullet lists keep separate boundaries with or without blank lines", () => {
  const header = "---\nlitzio: 1\n---\n\n";
  const siblings = ["- [ ] First\n  - Nested bullet", "* Second\n  - [x] Nested task", "- [x] Third"];
  const expected = [
    { block: "list", path: [1], ordered: false, checklist: true, items: [{ checked: false, content: text("First"),
      list: { ordered: false, items: [{ content: text("Nested bullet") }] } }] },
    { block: "list", path: [2], ordered: false, items: [{ content: text("Second"),
      list: { ordered: false, checklist: true, items: [{ checked: true, content: text("Nested task") }] } }] },
    { block: "list", path: [3], ordered: false, checklist: true, items: [{ checked: true, content: text("Third") }] },
  ];
  for (const beforeMiddle of ["\n", "\n\n"]) for (const afterMiddle of ["\n", "\n\n"]) {
    const original = core.parse(header + siblings[0] + beforeMiddle + siblings[1] + afterMiddle + siblings[2] + "\n");
    assert.deepEqual(core.getEditableDocument(original).blocks, expected);
    const markdown = core.serialize(original);
    assert.equal(markdown, header + siblings.join("\n\n") + "\n");
    const reopened = core.parse(markdown);
    assert.deepEqual(core.getEditableDocument(reopened).blocks, expected);
    assert.equal(core.serialize(reopened), markdown);
  }
});

test("all ordered formats preserve style, delimiter, starts, nesting and adjacent boundaries", () => {
  for (const style of core.LIST_STYLES) for (const delimiter of [".", ")"] as const) {
    const nested: ListContent = { ordered: true, start: 4, style: "upper-roman", delimiter: ")", items: [{ content: text("Nested") }] };
    const list: ListContent = { ordered: true, start: 3, style, delimiter, items: [{ content: text("First"), list: nested }, { content: [] }] };
    let document = core.insertList(core.createDocument(), 1, list);
    document = core.insertList(document, 2, { ordered: true, start: 7, delimiter, items: [{ content: text("Default style") }] });
    document = core.insertList(document, 3, list);
    const before = core.getEditableDocument(document);
    const markdown = core.serialize(document);
    assert.doesNotMatch(markdown, /<!--/);
    assert.match(markdown, /\{style=decimal\}/, "default style separates same-delimiter siblings");
    assert.deepEqual(core.getEditableDocument(core.parse(markdown)), before);
    assert.equal(core.serialize(core.parse(markdown)), markdown);
    const updated = core.updateList(document, [2], { ...list, start: 9 });
    const block = core.getEditableDocument(core.parse(core.serialize(updated))).blocks[1];
    assert.ok(block.block === "list");
    assert.equal(block.style ?? "decimal", style);
    assert.equal(block.delimiter ?? ".", delimiter);
    assert.equal(block.start, 9);
  }
});

test("ordered format validation refuses invalid input and every format field remains semantic", () => {
  const list: ListContent = { ordered: true, items: [{ content: text("Item") }] };
  const document = core.insertList(core.createDocument(), 1, list);
  const before = core.serialize(document);
  for (const invalid of [{ ...list, style: "armenian" }, { ...list, delimiter: ":" },
    { ...list, ordered: false, style: "decimal" }, { ...list, ordered: false, delimiter: "." }]) {
    assert.throws(() => core.updateList(document, [1], invalid as ListContent), /style and delimiter/);
    assert.equal(core.serialize(document), before);
  }
  const raw = parse("{style=lower-alpha}\n3) Item\n");
  assert.equal(raw.children[0].style, "lower-alpha");
  assert.equal(raw.children[0].delimiter, ")");
  // The complete fingerprint must refuse a field the writer cannot preserve.
  raw.children[0].delimiter = ":";
  assert.throws(() => serialize(raw), /serializer failed|semantic|bulletOrdered/);
});

test("list style parsing preserves literal attributes and container boundaries", () => {
  const cases = [
    ["inline text", "Use {style=lower-alpha} literally.\n"],
    ["before prose", "{style=lower-alpha}\nOrdinary paragraph.\n"],
    ["before heading", "{style=lower-alpha}\n# Heading\n"],
    ["before bullet list", "{style=lower-alpha}\n- Item\n"],
    ["unknown style", "{style=unknown}\n1) Item\n"],
    ["unknown attribute", "{style=lower-alpha class=extra}\n1) Item\n"],
    ["duplicate attribute", "{style=lower-alpha style=upper-alpha}\n1) Item\n"],
    ["quote to outer list", "> {style=lower-alpha}\n\n1) Outside\n"],
    ["outer attribute to quoted list", "{style=lower-alpha}\n> 1) Quoted\n"],
    ["list item to outer list", "- Parent\n  {style=lower-alpha}\n\n1) Outside\n"],
  ];
  for (const [name, source] of cases) {
    // Escaping the opening brace explicitly declares the expected literal text.
    // Compare all semantic fields so swallowing text or moving it across a container fails.
    const expected = semanticFingerprint(parse(source.replaceAll("{style=", "\\{style=")));
    const document = parse(source);
    assert.deepEqual(semanticFingerprint(document), expected, name);
    const markdown = serialize(document);
    const reopened = parse(markdown);
    assert.deepEqual(semanticFingerprint(reopened), expected, name);
    assert.equal(serialize(reopened), markdown, name);
  }
});

test("checklists read, write canonically and keep check states and content through reopen", () => {
  // Alternative spellings (`-`, `[X]`) normalize to one canonical form; an empty
  // item is its checkbox alone. Nesting works in both directions under the existing list rules.
  const source = "---\nlitzio: 1\n---\n\n- [X] **Done**\n- [ ]\n  - [x] nested\n  - [ ]\n- [ ] has bullets\n  - plain\n\n1. step\n   - [ ] inside numbered\n";
  const canonical = source.replace("[X]", "[x]");
  // The parse boundary reads the checkbox; native admission accepts the same tree.
  assert.deepEqual(parse(source).children[1].children!.map(item => item.checked), [true, false, false]);
  const document = core.parse(source);
  const checklist: ListContent = { ordered: false, checklist: true, items: [
    { content: [{ kind: "strong", children: text("Done") }], checked: true },
    { content: [], checked: false, list: { ordered: false, checklist: true, items: [{ content: text("nested"), checked: true }, { content: [], checked: false }] } },
    { content: text("has bullets"), checked: false, list: { ordered: false, items: [{ content: text("plain") }] } },
  ] };
  assert.deepEqual(core.getEditableDocument(document).blocks[0], { block: "list", path: [1], ...checklist });
  assert.deepEqual(core.getEditableDocument(document).blocks[1], { block: "list", path: [2], ordered: true, start: 1,
    items: [{ content: text("step"), list: { ordered: false, checklist: true, items: [{ content: text("inside numbered"), checked: false }] } }] });
  const markdown = core.serialize(document);
  assert.equal(markdown, canonical);
  assert.deepEqual(core.getEditableDocument(core.parse(markdown)), core.getEditableDocument(document));
  assert.equal(core.serialize(core.parse(markdown)), markdown);
  // Spaces after the checkbox are not content; canonical write removes them.
  assert.equal(core.serialize(core.parse("---\nlitzio: 1\n---\n\n+ [ ]   spaced\n")), "---\nlitzio: 1\n---\n\n- [ ] spaced\n");
});

test("canonical Markdown keeps looseness at each list level and is stable on the second save", () => {
  const header = "---\nlitzio: 1\n---\n\n";
  for (const [body, saved] of [
    ["- a\n\n  - b\n", "- a\n\n  - b\n"],
    ["- a\n\n  1) b\n", "- a\n\n  1) b\n"],
    ["- a\n\n  2. b\n", "- a\n\n  2. b\n"],
    ["- a\n\n  -\n", "- a\n\n  -\n"],
    ["- a\n\n- b\n- c\n", "- a\n\n- b\n\n- c\n"],
    ["- a\n- [b][ref]\n\n  [ref]: https://example.com\n", "- a\n\n- [b](https://example.com)\n"],
    ["- a\n  - b\n\n  - c\n- d\n", "- a\n  - b\n\n  - c\n- d\n"],
    ["2) a\n\n3) b\n\n1. c\n2. d\n", "2) a\n\n3) b\n\n1. c\n2. d\n"],
    ["- [ ] a\n- [x] b\n  - c\n\n  - d\n", "- [ ] a\n- [x] b\n  - c\n\n  - d\n"],
  ]) {
    const original = core.parse(header + body);
    const reopened = core.parse(header + saved);
    assert.deepEqual(core.getEditableDocument(reopened), core.getEditableDocument(original));
    assert.equal(core.serialize(original), header + saved);
    assert.equal(core.serialize(reopened), header + saved);
  }
});

test("whole-list edits preserve the looseness of each surviving destination", () => {
  const header = "---\nlitzio: 1\n---\n\n";
  const document = core.parse(header + "- a\n  - b\n\n  - c\n- d\n  - e\n  - f\n");
  const [list] = core.getEditableDocument(document).blocks;
  assert.equal(list.block, "list");
  if (list.block !== "list") return;
  const [first, second] = list.items;
  assert.equal(first.list?.loose, true);
  assert.equal(second.list?.loose, undefined);
  const withAddedItem = core.updateList(document, [1], { ...list, items: [
    { ...first, list: { ...first.list!, items: [...first.list!.items, { content: text("added") }] } }, second,
  ] });
  assert.equal(core.serialize(withAddedItem), header + "- a\n  - b\n\n  - c\n\n  - added\n- d\n  - e\n  - f\n");
  const movedUp = { ...list, items: [first, { content: text("g") }] };
  assert.equal(core.serialize(core.updateList(document, [1], movedUp)), header + "- a\n  - b\n\n  - c\n- g\n");
  assert.equal(core.serialize(core.updateList(document, [1], { ...list, items: [second] })), header + "- d\n  - e\n  - f\n");
  const indented = { ...list, items: [{ ...first, list: { ...first.list!, items: [...first.list!.items, second] } }] };
  assert.equal(core.serialize(core.updateList(document, [1], indented)), header + "- a\n  - b\n\n  - c\n\n  - d\n    - e\n    - f\n");
  const outdented = { ...list, loose: true, items: [{ ...first, list: undefined }, ...first.list!.items] };
  assert.equal(core.serialize(core.updateList(document, [1], outdented)), header + "- a\n\n- b\n\n- c\n");
  assert.equal(core.serialize(core.updateList(document, [1], { ...list, loose: true, items: [{ content: text("alone") }] })),
    header + "- alone\n");
});

test("checkbox shapes outside the checklist contract are refused with their reason", () => {
  for (const [body, reason] of [
    ["1. [x] one\n2. [ ] two\n", /not in numbered lists/],
    ["- [ ] a\n- b\n", /mixes items with and without checkboxes/],
    ["- [ ] a\n  - [x] b\n  - c\n", /mixes items with and without checkboxes/],
    ["- a\n  1. [ ] b\n", /not in numbered lists/],
    ["- [ ] a\n\n- [x] b\n", /must not be separated by blank lines/],
  ] as const) {
    // parse() still reads what the Markdown says; native admission names the refused shape.
    assert.ok(parse(body).children.length > 0);
    assert.throws(() => core.parse(`---\nlitzio: 1\n---\n\n${body}`), (error: any) =>
      error instanceof core.NativeDocumentError && error.location.code === "native-content" && reason.test(error.message), body);
  }
  // Escaped brackets stay text in an ordinary bullet list.
  assert.deepEqual(core.getEditableDocument(core.parse("---\nlitzio: 1\n---\n\n- \\[ ] text\n")).blocks[0],
    { block: "list", path: [1], ordered: false, items: [{ content: text("[ ] text") }] });
});

test("insert and update lists accept checklists; check states default to unchecked and belong only to checklists", () => {
  const document = core.parse("---\nlitzio: 1\n---\n\nIntro.\n");
  const inserted = core.insertList(document, 2, { ordered: false, checklist: true, items: [{ content: text("todo") }, { content: text("done"), checked: true }] });
  assert.equal(core.serialize(inserted), "---\nlitzio: 1\n---\n\nIntro.\n\n- [ ] todo\n- [x] done\n");
  // Switching kind is a whole-list update, like bullets and numbers.
  const numbered = core.updateList(inserted, [2], { ordered: true, items: [{ content: text("todo") }, { content: text("done") }] });
  assert.equal(core.serialize(numbered), "---\nlitzio: 1\n---\n\nIntro.\n\n1. todo\n2. done\n");
  const back = core.updateList(numbered, [2], { ordered: false, checklist: true, items: [{ content: text("todo"), checked: true }, { content: [] }] });
  assert.equal(core.serialize(back), "---\nlitzio: 1\n---\n\nIntro.\n\n- [x] todo\n- [ ]\n");
  const before = core.serialize(inserted);
  for (const [list, reason] of [
    [{ ordered: true, checklist: true, items: [{ content: text("a") }] }, /numbered lists have no checkboxes/],
    [{ ordered: false, items: [{ content: text("a"), checked: true }] }, /only checklist items have a check state/],
    [{ ordered: false, checklist: true, items: [{ content: text("a"), checked: "yes" }] }, /checked must be true or false/],
    [{ ordered: false, items: [{ content: text("a"), list: { ordered: false, items: [{ content: text("b"), checked: false }] } }] }, /only checklist items/],
  ] as const) {
    assert.throws(() => core.updateList(inserted, [2], list as unknown as ListContent), reason);
    assert.equal(core.serialize(inserted), before);
  }
});

test("updateListItemChecked changes one checklist item and leaves every other byte", () => {
  const source = "---\nlitzio: 1\n---\n\n# Plan\n\n- [ ] first\n  - [ ] nested\n  - [x] nested done\n- [x] second\n\n* plain\n\nAfter.\n";
  const document = core.parse(source);
  const checked = core.updateListItemChecked(document, [2], [0, 0], true);
  assert.equal(core.serialize(checked), source.replace("[ ] nested\n", "[x] nested\n"));
  const unchecked = core.updateListItemChecked(checked, [2], [1], false);
  assert.equal(core.serialize(unchecked), source.replace("[ ] nested\n", "[x] nested\n").replace("[x] second", "[ ] second"));
  assert.equal(core.serialize(core.parse(core.serialize(unchecked))), core.serialize(unchecked));
  assert.equal(core.serialize(document), source);
  for (const [run, reason] of [
    [() => core.updateListItemChecked(document, [3], [0], true), /not a checklist item/],
    [() => core.updateListItemChecked(document, [2], [2], true), /no list item at \[2\]/],
    [() => core.updateListItemChecked(document, [2], [1, 0], true), /no list item at \[1,0\]/],
    [() => core.updateListItemChecked(document, [1], [0], true), /not editable/],
    [() => core.updateListItemChecked(document, [2], [], true), /item indexes/],
    [() => core.updateListItemChecked(document, [2], [0], "true" as unknown as boolean), /true or false/],
  ] as const) {
    assert.throws(run, reason);
    assert.equal(core.serialize(document), source);
  }
});
