import fs from "node:fs";
import path from "node:path";
import { getEditableDocument, inlineContentText, parse, serialize } from "../../packages/core/src/index.ts";
import { tasks as acceptance } from "../assistant-acceptance/tasks.mjs";
import { normalizeLatex } from "./latex.mjs";

export const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
export function write(dir, file, value) {
  const target = path.join(dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}
const native = (title, body) => serialize(parse(`---\nlitzio: 1\ntitle: ${title}\n---\n\n${body}\n`));
const doc = (file, title, body) => dir => write(dir, file, native(title, body));
const prepare = (...fixtures) => dir => fixtures.forEach(fixture => fixture(dir));
const asset = file => new URL(`./fixtures/${file}`, import.meta.url);
const image = file => dir => write(dir, file, fs.readFileSync(asset(file)));
const all = (...words) => answer => words.every(word => typeof word === "string" ? answer.includes(word) : word.test(answer));
const num = n => new RegExp(`(?<![\\d.,])${n}(?![\\d.,]\\d|\\d)`);
const from = id => acceptance.find(task => task.id === id);
const output = (file, predicate) => ({ outputs: [file], content: dir => predicate(getEditableDocument(parse(read(dir, file)))) });
const edit = (file, transform) => ({ outputs: [file], expected: (dir, base) => write(dir, file, transform(read(base, file))) });
const sourceBody = "중앙 도서관은 누수 공사 때문에 토요일에 휴관합니다.\n\n예약 도서는 북문 무인함에서 수령할 수 있습니다.";
const source = doc("안내.md", "도서관 공지", sourceBody);
const summary = all(/토요일|토요/, /휴관|문을 닫/, /무인함|무인.{0,4}보관함/);
const table = "| 항목 | 수량 |\n| --- | --- |\n| 사과 | 14 |\n| 배 | 37 |\n| 감 | 29 |";
const withTable = doc("재고.md", "재고 현황", table);
const paragraphs = doc("공지.md", "시설 공지", "북문은 오전에 개방합니다.\n\n서문은 임시로 닫습니다.\n\n안내 데스크는 정상 운영합니다.");
const terms = "예비검토 일정과 예비검토 결과를 기록합니다.\n\n**예비검토** 결과는 별도 보관합니다.";
const rows = block => block.rows.map(row => row.cells.map(cell => cell.text));
const sameRows = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const formula = String.raw`u=\frac{3r+7}{2s-5}`;
const formulaAnswer = answer => normalizeLatex(answer).replace(/\\(?:left|right)/g, "").includes(formula);
const equation = String.raw`v=\frac{d}{t}`;
const bulletDoc = (state, itemCount) => state.title === "준비 목록" && state.blocks.length === 1 &&
  state.blocks[0].block === "list" && !state.blocks[0].ordered &&
  JSON.stringify(state.blocks[0].items.map(i => inlineContentText(i.content))) === JSON.stringify(["수건", "물", "모자"].slice(0, itemCount));

export const tasks = [
  { id: "1a", name: "일반 질문", message: "윤년이 아닌 해의 2월은 며칠까지 있어?", answer: all(num(28)) },
  { id: "1b", name: "붙여 준 글 요약", message: `다음 공지를 한 문장으로 요약해 줘: ${sourceBody.replaceAll("\n", " ")}`, answer: summary },
  { id: "2a", name: "활성 문서 요약", message: "이 문서를 한 문장으로 요약해 줘.", prepare: source, activeDocument: "안내.md", answer: summary },
  { id: "2b", name: "활성 문서 표 값 조회", message: "이 문서의 재고 표에서 배 수량이 몇 개인지 알려 줘.", prepare: withTable, activeDocument: "재고.md", answer: all(num(37)) },
  { id: "2c", name: "폴더에서 낱말 검색", message: "열린 폴더 ({folder})의 문서 세 개 중에 별무늬라는 낱말이 들어간 파일 이름을 알려 줘.",
    prepare: prepare(doc("준비.md", "준비", "장비를 정리합니다."), doc("일정.md", "일정", "별무늬 장식을 설치합니다."), doc("마무리.md", "마무리", "물품을 정리합니다.")),
    answer: all("일정.md", /^(?!.*(?:준비|마무리)\.md)/s) },
  { id: "2d", name: "폴더 파일 목록", message: "열린 폴더 ({folder}) 바로 아래에 있는 파일 이름을 모두 알려 줘.",
    prepare: prepare(source, withTable, dir => write(dir, "메모.txt", "합성 메모")), answer: all("안내.md", "재고.md", "메모.txt") },
  { id: "3a", name: "붙인 수식 그림 판독", message: "붙인 그림의 수식을 LaTeX로 써 줘.", attachment: asset("formula.png"), answer: formulaAnswer },
  { id: "3b", name: "그림 파일 내용 확인", message: "이 그림 파일 ({file})을 열어 무엇이 그려져 있는지 말해 줘.",
    prepare: image("sample.png"), imageFile: "sample.png", answer: all(/파란|파랑|푸른|청색/, "원", /주황|오렌지/, /삼각형|세모/) },
  { id: "3c", name: "표 그림에서 값 조회", message: "이 그림 파일 ({file})을 열어서 표의 Delta 수량을 알려 줘.",
    prepare: image("grid.png"), imageFile: "grid.png", answer: all(num(46)) },
  { id: "4a", name: "제목과 두 문단 작성", message: "작업 폴더 ({folder})에 산책.md를 만들고 제목은 공원 산책, 첫 문단은 ‘북문에서 만나요.’, 둘째 문단은 ‘우산을 챙겨요.’로 써 줘.",
    ...output("산책.md", d => d.title === "공원 산책" && d.blocks.map(b => b.block === "paragraph" && b.text).join("\n") === "북문에서 만나요.\n우산을 챙겨요.") },
  { ...from(3), id: "4b", name: "제목·목록·표 작성",
    message: "작업 폴더 ({folder})에 회의록.md를 만들고 제목은 출하 회의록, 글머리표 목록은 포장과 운송, 담당 표는 민수의 포장과 지연의 운송으로 정리해 줘.",
    ...output("회의록.md", d => d.title === "출하 회의록" &&
    d.blocks.some(b => b.block === "list" && !b.ordered && JSON.stringify(b.items.map(i => inlineContentText(i.content))) === JSON.stringify(["포장", "운송"])) &&
    d.blocks.some(b => b.block === "table" && b.rows.length === 3 &&
      (sameRows(rows(b).slice(1), [["민수", "포장"], ["지연", "운송"]]) || sameRows(rows(b).slice(1), [["포장", "민수"], ["운송", "지연"]])))) },
  { id: "4c", name: "활성 문서 요약본 작성", message: "이 문서를 요약해서 요약.md로 저장해 줘.", prepare: source, activeDocument: "안내.md",
    ...output("요약.md", d => summary(d.blocks.filter(b => b.block === "paragraph").map(b => b.text).join(" "))) },
  { ...from(12), id: "5a", name: "활성 문서 오타 수정", ...edit("focus.md", s => s.replace("환겅", "환경")) },
  { id: "5b", name: "문서 제목 변경", message: "이 문서의 제목을 주말 시설 공지로 바꿔 줘.", prepare: paragraphs, activeDocument: "공지.md",
    ...edit("공지.md", s => s.replace("title: 시설 공지", "title: 주말 시설 공지")) },
  { id: "5c", name: "끝에 문단 추가", message: "이 문서 끝에 ‘우천 시 일정이 바뀝니다.’를 새 문단으로 추가해 줘.", prepare: paragraphs, activeDocument: "공지.md",
    ...edit("공지.md", s => s.trimEnd() + "\n\n우천 시 일정이 바뀝니다.\n") },
  { id: "5d", name: "한 문서 용어 변경", message: "이 문서의 예비검토를 모두 사전검토로 바꿔 줘.", prepare: doc("검토.md", "회의 안내", terms), activeDocument: "검토.md",
    ...edit("검토.md", s => s.replaceAll("예비검토", "사전검토")) },
  { ...from(2), id: "5e", name: "세 문서 용어 변경",
    message: "작업 폴더 ({folder})의 문서 세 개에 있는 예비검토를 모두 사전검토로 바꿔 줘.", expected(dir, base) {
    for (const file of this.outputs) write(dir, file, read(base, file).replaceAll("예비검토", "사전검토"));
  } },
  { id: "6a", name: "표에 행 추가", message: "이 문서의 표에 품목은 감마, 수량은 7인 행 하나를 추가해 줘.", prepare: from(1).prepare, activeDocument: "현황.md",
    ...edit("현황.md", s => s.replace(/\n(:::+)\s*$/, "\n| 감마 | 7 |\n$1\n")) },
  { id: "6b", name: "문단 하나 삭제", message: "이 문서에서 ‘서문은 임시로 닫습니다.’ 문단만 지워 줘.", prepare: paragraphs, activeDocument: "공지.md",
    ...edit("공지.md", s => s.replace("서문은 임시로 닫습니다.\n\n", "")) },
  { id: "6c", name: "블록 수식 삽입", message: "이 문서 끝에 속력 v를 거리 d와 시간 t로 나타내는 블록 수식을 넣어 줘.",
    prepare: from(11).prepare, activeDocument: "수식.md",
    ...output("수식.md", d => d.title === "수식" && d.blocks.length === 2 && d.blocks[0].block === "paragraph" &&
      d.blocks[0].text === "관계를 아래에 정리합니다." && d.blocks[1].block === "equation" && normalizeLatex(d.blocks[1].latex) === equation) },
  { id: "7a", name: "파일 하나 이동", message: "작업 폴더 ({folder})의 메모.txt를 그 안의 보관 폴더로 옮겨 줘.",
    prepare: prepare(dir => write(dir, "메모.txt", "합성 자료 PLAN-72\n"), dir => fs.mkdirSync(path.join(dir, "보관"))),
    moves: { "메모.txt": "보관/메모.txt" } },
  { id: "7b", name: "CSV 합계 답하기", message: "작업 폴더 ({folder})의 sales.csv를 읽어서 금액 전체 합계만 알려 줘.", prepare: from(9).prepare, answer: all(num(510)) },
  { ...from(9), id: "7c", name: "CSV 집계 표 문서 작성", script: true,
    message: "작업 폴더 ({folder})에서 sales.csv를 품목별로 집계하는 스크립트를 작성하고 실행해서 결과 표를 집계.md에 넣어 줘.",
    ...output("집계.md", d => d.blocks.some(b => b.block === "table" && [["Alpha", "360"], ["Beta", "150"]].every(expected =>
      rows(b).slice(1).some(row => expected.every(value => row.includes(value)))))) },
  { id: "8a", name: "두 문서 비교본 작성", message: "작업 폴더 ({folder})의 계획.md와 실적.md를 비교해서 품목별 차이를 비교.md에 정리해 줘.",
    prepare: prepare(doc("계획.md", "계획", "사과 40개, 배 25개를 준비합니다."), doc("실적.md", "실적", "사과 47개, 배 20개를 준비했습니다.")),
    ...output("비교.md", d => {
      const text = JSON.stringify(d.blocks);
      return all("사과", num(40), num(47), "배", num(25), num(20))(text) ||
        all("사과", num(7), "배", num(5))(text);
    }) },
  { id: "8b", name: "같은 대화에서 목록 수정", message: "작업 폴더 ({folder})에 준비.md를 만들고 제목은 준비 목록, 글머리표 항목은 수건과 물로 써 줘.",
    followup: "방금 문서에 글머리표 항목으로 모자를 하나 더해 줘.", ...output("준비.md", d => bulletDoc(d, 3)),
    intermediate: output("준비.md", d => bulletDoc(d, 2)).content },
];
