import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.resolve("tmp/assistant-review");
const stem = "LSR-1.1-standards";
const baseline = path.join(dir, "baseline");
const runs = path.join(dir, "runs");
const plugin = path.join(dir, "plugin");
const read = file => JSON.parse(readFileSync(file, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const oracle = read(path.join(plugin, "pdf/test/fixtures/standards.json"));
const elements = new Map(oracle.elements.map(e => [e.id, e]));
const differences = read(new URL("./baseline-differences.json", import.meta.url));
const baselineScore = read(path.join(dir, "baseline-score.json"));
assert.equal(baselineScore.revision, differences.revision);
assert.deepEqual(baselineScore.entries.filter(e => e.status !== "correct"), differences.entries);
assert.deepEqual(baselineScore.extras, differences.extras);
assert.equal(baselineScore.entries.length, 111);
assert.equal(differences.entries.length, 31);

const items = [];
let source = readFileSync(path.join(baseline, stem, stem + ".md"), "utf8");
function replace(before, after) {
  assert.equal(source.split(before).length, 2, before);
  source = source.replace(before, () => after);
}
const visit = id => {
  const element = elements.get(id);
  assert(element);
  return element;
};
function item(id, title, instruction) {
  items.push({ id, title, page: visit(id).page, instruction });
}
const blank = "\n\n";
const code = value => "`" + value + "`";
const caption = id => {
  const relation = oracle.relations.find(r => r.type === "caption_of" && r.to === id);
  return visit(relation.from).text;
};

const heading = (id, level, location = "") => {
  const element = visit(id);
  const depth = element.heading_level ?? level;
  item(id, element.text, location + "독립 문단 " + code(element.text) + "의 글자를 유지하고 H" + depth + " 제목으로 바꾼다.");
  replace(blank + element.text + blank, blank + "#".repeat(depth) + " " + element.text + blank);
};
heading("std-participants-label");

const roster = differences.entries.filter(e => e.role === "list_item");
const oldRoster = [...new Set(roster.map(e => e.actual))].join(blank);
const newRoster = roster.map(e => "- " + e.expected).join("\n");
item(roster[0].id, "참가자 명단", "«Review participants» 바로 아래의 «" + roster[0].actual +
  "»로 시작하는 여섯 문단을 불릿 목록 하나로 교체한다. 이름 하나가 항목 하나이며 순서는 다음과 같다.\n\n" + newRoster);
replace(oldRoster, newRoster);

function tableGrid(id) {
  const { num_rows, num_cols, cells } = visit(id).table;
  const folded = cells.some(c => c.r0 === 0 && c.r1 === 2 && c.column_header);
  return Array.from({ length: num_rows - Number(folded) }, (_, row) =>
    Array.from({ length: num_cols }, (_, col) => {
      const rows = folded ? row ? [row + 1] : [0, 1] : [row];
      const covering = cells.filter(c => rows.some(r => c.r0 <= r && r < c.r1) && c.c0 <= col && col < c.c1);
      const math = covering.find(c => c.content_kind === "math");
      return math ? "$" + math.text + "$" : covering.map(c => c.text).filter(Boolean).join(" / ");
    }));
}
function grid(rows) {
  const line = row => "| " + row.join(" | ") + " |";
  return [rows[0], rows[0].map(() => "---"), ...rows.slice(1)].map(line).join("\n");
}
function fillMath(id, prefix) {
  const entry = differences.entries.find(e => e.id === id);
  const rows = tableGrid(id);
  const instructions = entry.math.map(cell => {
    const [header, rowName] = [rows[0][cell.col], rows[cell.row][0]];
    assert.equal(rows[cell.row][cell.col], "$" + cell.expected + "$");
    return "- «" + rowName + "» 행, «" + header + "» 열 = 인라인 수식 " + code(cell.expected);
  });
  item(id, caption(id), "현재 " + rows.length + "행 " + rows[0].length +
    "열(머리글 포함)과 다른 칸, 캡션, 주석은 유지한다. 다음 빈 칸만 채운다.\n\n" + instructions.join("\n"));
  for (const row of new Set(entry.math.map(cell => cell.row))) {
    const old = source.split("\n").find(line => line.startsWith(prefix(rows[row][0])));
    assert(old, id);
    const cells = old.split("|");
    for (const cell of entry.math.filter(c => c.row === row)) {
      assert.equal(cells[cell.col + 1].trim(), "");
      cells[cell.col + 1] = " " + rows[row][cell.col] + " ";
    }
    replace(old, cells.join("|"));
  }
}
fillMath("std-settings", name => "| " + name);

function equation(id, locator, index) {
  const element = visit(id);
  item(id, "독립 수식 (" + element.source_number + ")", locator + "을 수식 블록으로 바꾼다. LaTeX는 " +
    code(element.text) + "이고 화면에 번호 (" + element.source_number + ")가 한 번 표시되게 한다.");
  replace(":::{figure} ./assets/figure-00" + index + ".png\n:enumerated: false\n:alt: 수식 영역\n:::",
    ":::{math}\n:enumerator: " + element.source_number + "\n\n" + element.text + "\n:::");
}
equation("std-equation-1", "«The two expressions below are invented review metrics.» 바로 뒤 첫 번째 수식 그림", 1);
equation("std-equation-2", "같은 문단 뒤 두 그림 중 두 번째 수식 그림", 2);

const chartId = "std-chart";
const chart = visit(chartId);
const stray = differences.extras.map(e => e.text);
item(chartId, caption(chartId), "PDF의 이 그림 전체로 잘린 그림을 교체한다. 왼쪽 세로축 제목 «" + stray[0] +
  "»와 눈금 «" + stray.slice(1).join("», «") +
  "»까지 그림 안에 보이게 한다. 그림 바로 앞뒤에 흩어진 이 다섯 독립 문단을 지운다. 기존 캡션과 본문 참조는 유지한다.");
replace("./assets/figure-004.png", "./assets/figure-k2-complete.png");
for (const text of stray) replace(blank + text + blank, blank);

fillMath("std-conditional-table", name => "| " + name);
equation("std-equation-3", "«Table L.1»과 «The root index is 3.» 사이의 수식 그림", 5);

const routeA = "std-local-table-a";
const routeB = "std-local-table-b";
const captionB = visit("std-local-cap-b");
item(captionB.id, captionB.text, "두 표가 함께 찍힌 그림 바로 앞의 독립 문단 " + code(captionB.text) +
  "를 Route B 표의 캡션으로 사용한다.");
for (const id of [routeA, routeB]) {
  const name = caption(id);
  item(id, name + "의 격자", "Route A와 B가 섞인 한 장의 표 그림을 없애고 두 개의 편집 가능한 표로 나눈다. 이 표에는 «" +
    name + "» 캡션을 붙이고 아래 값을 그대로 넣는다.\n\n" + grid(tableGrid(id)));
}
const [noteA, noteB] = ["std-local-note-a", "std-local-note-b"].map(visit);
for (const [note, table] of [[noteA, routeA], [noteB, routeB]]) {
  item(note.id, caption(table) + "의 주석", "그림 아래에 합쳐진 두 주석 중 " + code(note.text) +
    " 문장을 «" + caption(table) + "» 표 바로 아래 별도 문단으로 둔다.");
}
const route = (id, note) => ":::{table} " + caption(id) + "\n:enumerated: false\n\n" +
  grid(tableGrid(id)) + "\n:::\n\n" + note.text;
replace(captionB.text + blank +
  ":::{figure} ./assets/table-006.png\n:enumerated: false\n:alt: 표 영역\n\n" + caption(routeA) + "\n:::" + blank +
  noteA.text + " " + noteB.text, route(routeA, noteA) + blank + route(routeB, noteB));

heading("std-record-title", 2, "«Annex M» 제목 바로 아래의 ");
assert.equal(items.length, 14);
const covered = new Set(items.map(i => i.id).concat(roster.map(e => e.id)));
assert.deepEqual(covered, new Set(differences.entries.map(e => e.id)));
const answer = "정답지에 없는 곳은 지금 문서가 맞다.\n\n# 고칠 곳 목록\n\n" +
  items.map(({ title, page, instruction }, i) =>
    "## " + (i + 1) + ". " + title + " (원본 PDF " + page + "쪽)\n\n" + instruction).join(blank) + "\n";
writeFileSync(path.join(dir, "고칠 곳 목록.md"), answer);
writeFileSync(path.join(dir, "answer-groups.json"), JSON.stringify(items.map(({id, title}) =>
  ({ title, ids: id === roster[0].id ? roster.map(e => e.id) : [id] })), null, 2));

// Build the control from the same corrections and remove it before any paid turn.
const load = name => import(pathToFileURL(path.join(plugin, name)).href);
const { getDocument } = await load("node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await load("node_modules/@napi-rs/canvas/index.js");
const root = mkdtempSync(path.join(os.tmpdir(), "litzio-review-control-"));
try {
  const folder = path.join(root, stem);
  cpSync(path.join(baseline, stem), folder, { recursive: true });
  const pdf = readFileSync(path.join(baseline, stem + ".pdf"));
  const engine = getDocument({ data: new Uint8Array(pdf), standardFontDataUrl:
    path.join(plugin, "node_modules/pdfjs-dist/standard_fonts").replaceAll("\\", "/") + "/" });
  try {
    const page = await (await engine.promise).getPage(chart.page);
    const [left, top, right, bottom] = chart.bbox;
    const scale = 2.5;
    const canvas = createCanvas((right - left) * scale, (bottom - top) * scale);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -left * scale, -top * scale] }).promise;
    const image = canvas.toBuffer("image/png");
    writeFileSync(path.join(folder, "assets/figure-k2-complete.png"), image);
    if (process.argv.includes("--preview-figure")) {
      writeFileSync(path.join(dir, "control-figure-preview.png"), image);
      console.log(hash(image));
      process.exitCode = 0;
    }
  } finally {
    await engine.destroy();
  }
  if (!process.argv.includes("--preview-figure")) {
    const document = path.join(folder, stem + ".md");
    writeFileSync(document, source);
    const evidence = path.join(runs, "answer-control");
    mkdirSync(evidence, { recursive: true });
    const state = path.join(evidence, "state.json");
    writeFileSync(state, JSON.stringify({ document }));
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL("./score.mjs", import.meta.url)), "answer-control"],
        { stdio: "inherit" });
      const result = read(path.join(evidence, "score.json"));
      assert.equal(result.check.validation.valid, true);
      assert.equal(result.entries.filter(e => e.status === "correct").length, 111);
      assert.deepEqual(result.extras, []);
      writeFileSync(path.join(dir, "control.json"), JSON.stringify({
        correct: 111, total: result.entries.length, damaged: result.damaged.length,
        validation: result.check.validation, revision: result.revision, answerSha256: hash(answer),
      }, null, 2));
      console.log("Control 111/111; no extra blocks.");
    } finally {
      rmSync(state);
      rmSync(path.join(evidence, "score.json"), { force: true });
    }
  }
} finally {
  rmSync(root, { recursive: true });
}
