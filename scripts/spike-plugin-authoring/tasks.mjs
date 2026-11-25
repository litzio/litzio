import { writeFileSync } from "node:fs";
import path from "node:path";

const csvRequirements = [
  "열린 폴더에서 날짜·값 두 열의 CSV를 하나 고르고 다른 CSV로 바꿀 수 있다.",
  "선택한 실제 자료를 날짜순 꺾은선 그래프로 표시한다.",
  "그래프 위에서 기준선을 숫자로 입력하고 바꿀 수 있다.",
  "기준선을 그래프에 표시하고 기준을 초과한 점을 눈에 띄게 표시한다.",
  "그래프 아래에 기준을 초과한 날짜와 값을 표시한다. 기준과 같은 값은 제외한다.",
  "문서 저장 버튼을 눌러 초과 날짜와 값만 담은 새 리치오 문서를 연다.",
  "CSV를 바꾸면 이전 자료의 그래프와 초과 목록이 새 자료에 맞게 갱신된다.",
];

export const tasks = {
  1: {
    prompt: "주간 보고 모으는 거 만들어 줘.",
    requirements: [
      "선택한 폴더에서 실제 사람별 주간 보고 문서를 읽는다.",
      "화면 위에 발견한 사람별 보고 목록을 보여 준다.",
      "보고 목록 아래에 빠진 모래 팀 사람을 이름으로 보여 준다. 명단에는 가람, 다솔, 마루, 보늬, 여울이 있다.",
      "취합 문서 만들기 단추가 있고 실제로 새 리치오 문서 하나를 만든다.",
      "취합 문서는 사람 이름 가나다순으로 묶는다.",
      "각 사람의 ‘이번 주 한 일’과 ‘다음 주 할 일’ 내용만 취합한다.",
      "만든 문서를 화면에서 바로 열 수 있다.",
    ],
  },
  2: { prompt: "CSV 올리면 그래프 그려 주는 거.", requirements: csvRequirements },
  3: { prompt: "CSV 올리면 그래프 그려 주는 거 만들어 줘. " + csvRequirements.join(" "), requirements: csvRequirements },
};

export function prepare(task, folder) {
  const write = (name, contents) => writeFileSync(path.join(folder, name), contents);
  if (task === 1) {
    for (const [name, done, next] of [
      ["마루", "종이 모형 3개를 접었다.", "모형 높이를 비교한다."],
      ["가람", "색종이 5장을 분류했다.", "파란 종이를 접는다."],
      ["여울", "종이 상자 2개를 만들었다.", "상자 크기를 기록한다."],
      ["다솔", "종이 조각 4개를 정리했다.", "모서리 모양을 비교한다."],
    ]) {
      write(`주간 보고 - ${name}.md`, `# ${name} 주간 보고\n\n## 이번 주 한 일\n\n${done}\n\n## 다음 주 할 일\n\n${next}\n\n## 참고 사항\n\n이 문장은 취합에서 빠져야 한다.\n`);
    }
    return;
  }
  write("표본-가.csv", "날짜,값\n2026-01-05,31\n2026-01-02,14\n2026-01-03,20\n2026-01-04,26\n");
  write("표본-나.csv", "날짜,값\n2026-02-01,20\n2026-02-02,23\n2026-02-03,7\n");
}
