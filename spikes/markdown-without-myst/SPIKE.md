# MyST 없이 CommonMark·GFM과 리치오 확장으로 문서 의미 담기

- 브랜치 `spike/markdown-without-myst`, 태그 `spike/2026-11-27-markdown-without-myst`
- 기준: `origin/master` 223eec40, Windows, Node 24.22.3, Rust 1.100.0(`stable-x86_64-pc-windows-gnu`, 이 PC에 이미 있던 사용자 범위 툴체인)
- 기존 Core·Editor·CLI·lockfile은 바꾸지 않았다. 의존성은 이 폴더의 `package.json`·`Cargo.toml`에만 있다.

## 질문

1. remark(micromark/mdast) + GFM·수식·지시문·머리말 확장으로 지금 Core가 다루는 문서 의미를 잃지 않고 읽고 다시 쓸 수 있는가? 담을 수 없는 것과 새로 정할 표기는 무엇인가?
2. 읽기·쓰기 속도는 지금 MyST 경로와 비교해 얼마나 다른가?
3. markdown-rs(Rust)가 같은 문서를 같은 mdast로 읽는가? Rust 쪽에 없는 확장은 무엇인가?
4. (조건부, 추가 범위) 제목·문단·인라인 서식·목록·단순 표만으로 Rust 부분 파이프라인(markdown-rs 읽기 → 리치오 의미 모델 → 정규 Markdown 쓰기)을 만들고 네 경로를 잰다.

진행 중 소유자 방향이 추가됐다. 확장 문법은 새로 만들지 않고 외부 도구와 호환되는 기존 관례로 "프로필"을 구성한다. 그래서 두 프로필을 만들어 같은 자료로 쟀다.

| 프로필 | 구성 | 파서 확장 |
| --- | --- | --- |
| **directive** | CommonMark + GFM 일부 + `$` 수식 + YAML 머리말 + remark-directive(`:::`, `::`, `:name[]`) | 기존 remark 플러그인만. 지시문 이름·속성의 의미는 리치오가 정함 |
| **external** (소유자 방향) | CommonMark + GFM 일부 + `$` 수식 + YAML 머리말. GitHub alerts, Pandoc 속성·fenced div·인용, Quarto `@` 상호참조, 원시 HTML 표는 **mdast + 원문 위치에 대한 후처리**로 인식 | 새 micromark 확장 없음 |

두 프로필 모두 GFM 자동 링크(`www.x`, 맨 URL)와 한 물결표 취소선을 끈다. Core가 linkify를 끄고 있고, 켜 두면 본문 URL 글자가 링크로 바뀌어 의미가 달라졌다(실측 1건).

## 만든 것

```
spikes/markdown-without-myst/
  src/model.ts            비교 모델(Core getEditableDocument에서 위치·파생 필드만 뺀 것 + 머리말 객체)
  src/directive/          directive 프로필: format(파서·쓰기 설정), read(mdast→모델), write(모델→mdast→Markdown), html-grid
  src/external/           external 프로필: format, read(후처리), write, prefixLabels(Quarto 접두사 이름 바꾸기)
  src/roundtrip.ts        질문 1 코퍼스 왕복         src/fuzz.ts      Core 연산 무작위 편집 퍼징
  src/generic.ts          저장소 .md 참고 측정       src/coverage.ts  코퍼스가 다루는 기능 수
  src/bench.ts            질문 2 JS 속도             src/rust-parity.ts  질문 3 JS·Rust mdast 비교
  src/one.ts, show.ts, fuzz-detail.ts   문서 하나 왕복·출력 보기, 퍼징 차이 유형 표본(디버그용)
  src/stage4/             4단계 합성 문서·네 경로 측정·이스케이프 규칙 덤프
  rust/                   markdown-rs 1.0.0 mdast 덤프(bin/mdast), 4단계 파이프라인(lib, bin/pipeline, WASM 내보내기)
  fixtures/feature-matrix.myst.md   코퍼스에 없던 기능을 모은 합성 MyST 문서
  results/                측정 결과 JSON
```

### 같다고 보는 기준

Core가 읽은 문서 A의 공개 읽기 모델(`getEditableDocument`)과 새 형식으로 쓴 뒤 다시 읽은 B의 모델을 비교한다.

- 뺀 필드: `path`(스냅샷 위치, ADR-0003상 의미가 아님. 블록 순서는 배열 순서로 비교), 블록·캡션·칸의 `text`(content에서 만든 표시 글자), `editable`(항상 true).
- 나머지는 모두 비교한다: 인라인 내용 트리(마크 중첩 순서까지), 목록 형식(start·style·delimiter·checklist·checked), 라벨, 고정 번호, 번호 숨김, 그림 내용 종류·주소·대체 글·Mermaid 원문, 표 격자·정렬·병합 범위·머리글 행·칸 블록·캡션·주석, 머리말 YAML을 읽은 객체.
- 객체 키 순서는 무시한다(정렬한 JSON으로 비교).
- 통과 조건: A와 B가 같고, B를 다시 쓴 바이트가 처음 쓴 바이트와 같다(정규 쓰기의 안정성).
- 쓸 수 없는 블록(프로필이 표기를 갖지 않음)은 그 블록만 빼고 나머지를 계속 비교하며, 빠진 블록은 이유별로 센다.

## 실행 방법

```
pnpm install --frozen-lockfile        # 저장소 루트(lockfile 변경 없음)
cd spikes/markdown-without-myst && npm ci
cd rust && cargo +stable-x86_64-pc-windows-gnu build --release \
        && cargo +stable-x86_64-pc-windows-gnu build --release --lib --target wasm32-unknown-unknown
cd .. && ./run-all.sh <임시 폴더>      # 모든 측정, results/*.json 갱신
```

MSVC 빌드 도구가 없어 기본 `x86_64-pc-windows-msvc` 타깃은 링크하지 못했다. 이미 설치돼 있던 gnu 툴체인(자체 포함 mingw 링커)을 썼고, WASM은 `rustup target add wasm32-unknown-unknown`(사용자 범위)만 추가했다. wasm-bindgen 없이 `alloc`·`out_ptr` 내보내기로 문자열을 주고받는다.

## 결과

### 질문 1. 의미 보존

**측정 자료** (모두 저장소에 있거나 합성):

| 자료 | 문서 수 | 내용 |
| --- | --- | --- |
| 네이티브 문서 | 39 (Core 수용 38) | Core 저장 바이트 회귀 데이터의 픽스처 33개, 그 밖에 추적되는 네이티브 문서(샘플 en/ko, 병합 칸 표 픽스처 등), Core 테스트의 ADR-0024 병합 칸 사례, 이 스파이크의 `feature-matrix`(코퍼스에 없던 위·아래 첨자, 취소선, 목록 스타일·`)` 구분자, 체크 목록, 알림 10종, 빈 알림·인용·수식, 고정 번호, 번호 숨김, 공백 있는 라벨 등) |
| 생성 사례 | 987 | #1845·#1846 바이트 회귀의 줄 시작 문법(`:::`, `(lab)=`, `+++`, `%`, `$5`, `@kim` 등) × 문맥 13종 |
| 합성 큰 문서 | 3 | #1983 스파이크와 같은 혼합(문단 65%, 제목, 목록, 10행 표, 수식, 그림, 미주) 300·2,300·5,000블록 |
| 편집 퍼징 | 10,000 | 기능 문서와 Core 기술 문서 픽스처에 Core 연산으로 무작위 편집 1~3회(까다로운 기호, 중첩 서식, 링크, 수식, 코드, 라벨, 고정 번호, 캡션, 목록). Core 정규 쓰기가 받아들인 9,850건만 센다 |

코퍼스가 다룬 기능 수(Core 읽기 모델 기준)는 다음과 같다.

- 블록: 문단 861, 제목 179, 표 149(병합 칸 2), 목록 151, 그림 93(Mermaid 3), 미주 86, 알림 84, 인용 65, 수식 34, 대상 7, 코드 6.
- 인라인: 강조·굵게 266, 링크 113, 미주 호출 90, 아래 첨자 68, 수식 52, 인용 33, 상호참조 37.
- 위 첨자, 취소선, 체크 목록, 목록 스타일, 고정 번호, 번호 숨김은 기능 문서와 퍼징으로만 다뤘다.

**결과**

| 프로필 | 네이티브 38 | 생성 987 | 합성 3 | 퍼징(Core 수용 9,850) |
| --- | --- | --- | --- | --- |
| directive | **38 일치** | **987 일치** | **3 일치** | **9,849 일치**, 1 읽기 거부(빈 체크 항목) |
| external | 33 일치, 5 차이(인용 역할), 쓸 수 없는 블록 6(4문서) | 987 일치 | 3 일치 | 4,756 일치. 차이·거부는 아래 |
| external + Quarto 접두사 이름 바꾸기 | 33 일치, 5 차이(인용 역할), 쓸 수 없는 블록 4(2문서) | 987 일치 | 3 일치 | 4,712 일치. 차이·거부는 아래 |

"일치"는 위 비교 기준을 통과하고 두 번째 쓰기의 바이트도 같다는 뜻이다. 퍼징의 두 기본 문서 중 하나(기능 문서)에는 external이 표기를 갖지 않는 `caution` 알림과 여러 키 서술형 인용이 있다. 그래서 external 퍼징의 문서 단위 비율은 이 구성의 영향을 크게 받는다. 비율보다 아래 유형을 본다.

external 퍼징의 내역(이름 바꾸기 포함 실행):

| 유형 | 수 | 성격 |
| --- | --- | --- |
| `{cite}`를 `@key`로 써서 `cite:t`로 돌아옴 | 4,660문서 | 관례 한계: Pandoc에는 서술형·괄호형 두 가지만 있다 |
| 여러 키 서술형 인용(`{cite:t}`a,b``)을 쓸 수 없음 | 블록 5,007 | 관례 한계 |
| `caution` 알림을 쓸 수 없음 | 블록 4,850 | 관례 한계: GitHub `CAUTION`은 리치오 `danger`(위험)에 쓴다 |
| `@` 인용·참조가 글자 바로 뒤(`H@a`) | 블록 141 | 관례 한계: Pandoc은 단어 안의 `@`를 인용으로 읽지 않는다 |
| 그 밖의 의미 차이 | 395문서 | **후처리 구현 결함**: 원문 위치로 글자를 다시 자를 때 끝 글자 누락, 한 줄 수식·알림 표식 인식 실패 등. 관례 문제는 아니다 |
| 읽기 거부 | 83문서 | **후처리 구현 결함**: `fig-alt` 값에 `}`가 있으면 속성 파싱 실패 등 |

접두사 이름 바꾸기가 없는 external에서는 라벨에 Quarto 접두사(`fig-`, `tbl-`, `eq-`, `sec-`)가 없어 참조를 쓸 수 없는 블록이 10,482개 더 나왔다.

directive 프로필의 퍼징 거부 1건은 체크 항목이 비어 있고 하위 목록만 가진 경우다. GFM은 `* [x]`만 있는 줄을 체크 항목으로 읽지 않는다(remark·markdown-rs 모두 그렇다). Core는 빈 체크 항목(`*   [ ]`)을 허용한다. external도 같은 문제를 가진다. 해결하려면 "체크 목록 안에서 `[ ]`·`[x]`만 있는 문단은 빈 체크 항목"이라는 후처리 규칙이 필요하다.

**의미 유형별 보존과 표기**

| 리치오 의미 | directive 프로필 표기 | external 프로필 표기(정규형) | directive | external |
| --- | --- | --- | --- | --- |
| 문서 설정·메타데이터 | YAML 머리말 | 같음 | 보존 | 보존 |
| 제목, 문단, 굵게·기울임·코드·링크·줄바꿈 | CommonMark | 같음 | 보존 | 보존 |
| 취소선 | `~~x~~` | 같음 | 보존 | 보존 |
| 아래·위 첨자 | `:sub[x]`, `:sup[x]` | `<sub>x</sub>`, `<sup>x</sup>` | 보존 | 보존 |
| 목록, 시작 번호, `)` 구분자 | CommonMark(구분자는 원문 위치에서 읽음) | 같음 | 보존 | 보존 |
| 목록 번호 스타일 | `::list{style="lower-alpha"}` 줄 | `::: {.lower-alpha}` div로 감쌈 | 보존 | 보존(새 클래스 이름) |
| 같은 종류 목록 두 개가 붙음 | `::list` 경계 | `<!-- end list -->` | 보존 | 보존 |
| 체크 목록 | GFM task | 같음 | 보존(빈 항목 제외) | 보존(빈 항목 제외) |
| 표(칸 줄바꿈) | GFM 표, 칸 안 `<br>` | 같음 | 보존 | 보존 |
| 표 캡션·라벨·고정 번호·번호 숨김 | `:::table{#id enumerator="T-1" enumerated="false"}` + 캡션 문단 + 표 | 표 뒤 `: 캡션 {#tbl-x enumerator="T-1" .unnumbered}` | 보존 | 보존 |
| 표 주석 | 같은 지시문 안 표 뒤 문단 | `::: {#tbl-x}` div 안 캡션 줄 뒤 문단 | 보존 | 보존 |
| 병합 칸 표 | 지시문 안 ADR-0024 HTML 부분집합(`data-myst` 대신 `data-litzio` span) | 원시 HTML 뼈대 + 빈 줄로 감싼 Markdown 칸 내용 | 보존 | 보존 |
| 그림(이미지·Mermaid·빈 그림), 캡션, 대체 글, 라벨, 번호 | `:::figure{#id}` + `![alt](src)` 또는 ```` ```mermaid ```` + 캡션 문단 | `::: {#fig-x}` + `![](src){fig-alt="…"}` 또는 ```` ```mermaid ```` + 캡션 문단 | 보존 | 보존 |
| 수식, 라벨, 고정 번호 | `$$` 블록, 여는 줄 메타 `$${#id enumerator="7a"}` | 라벨이 없으면 `$$` 블록, 한 줄이면 `$$x$$ {#eq-x}`(Quarto), 여러 줄·빈 수식은 `::: {#eq-x}` div | 보존 | 보존 |
| 인라인 수식 | `$x$`, 바로 붙은 두 번째 수식은 `:math[x]` | `$x$`, 붙은 수식·코드 사이에 `<!---->` | 보존 | 보존 |
| 미주 | GFM 각주 `[^id]` | 같음 | 보존 | 보존 |
| 상호참조 `{eq}`/`{numref}`/`{ref}` | `:eq[label]`, `:numref[label]`, `:ref[label]` | `@eq-x`, `@fig-x`/`@tbl-x`, `@sec-x`(역할은 접두사에서) | 보존 | 접두사 있는 라벨만 |
| 구역 대상 `(label)=` | `::target{#label}` | `## 제목 {#sec-x}`(제목 앞일 때만) | 보존 | 제목 앞만 |
| 인용 `{cite}`/`{cite:t}`/`{cite:p}` | `:cite[a]`, `:cite-t[a,b]`, `:cite-p[a,b]` | `@a`(서술형), `[@a; @b]`(괄호형) | 보존 | `{cite}`·여러 키 서술형 손실 |
| 알림 상자 | `:::note` 등 10종 | `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]`, 위험은 `[!CAUTION]`. 보존만 하는 종류는 `[!ATTENTION]` `[!ERROR]` `[!HINT]` `[!SEEALSO]`(Obsidian식 사용자 종류) | 보존 | `caution`만 손실 |
| 코드, 인용문, 구분선 | CommonMark | 같음 | 보존 | 보존 |

**새로 정해야 하는 표기**

- directive 프로필: 지시문 이름과 속성은 모두 리치오 규칙이다. `table`, `figure`, `target`, `list`, `sub`, `sup`, `math`, `eq`, `numref`, `ref`, `cite`, `cite-t`, `cite-p`, 알림 10종, 수식 메타 `{#id enumerator=…}`가 해당한다. 문법 틀만 remark-directive라는 기존 것이다.
- external 프로필: 외부 관례로 담을 수 없어 새 규칙이 꼭 필요한 항목은 다음과 같다.
  1. `{cite}` 기본 역할과 여러 키 서술형 인용: Pandoc에 대응하는 형식이 없다. 역할을 하나로 합치거나(문서 안에서는 둘 다 `[n]`으로 보인다) 새 표기를 정해야 한다.
  2. 라벨 규칙: `@` 상호참조는 Quarto 접두사로 역할을 정하므로 라벨에 접두사가 필요하다. 지금 라벨은 공백·`.`·한글을 허용하고, 문장부호로 끝나는 라벨은 Pandoc 키에서 잘린다. 라벨 규칙을 바꾸거나(이번 이름 바꾸기처럼) 새 표기를 정해야 한다.
  3. 제목 앞이 아닌 구역 대상.
  4. `caution` 알림: GitHub `CAUTION`이 리치오 `danger`와 짝이라 남는 이름이 없다. 보존만 하는 종류이므로 새 형식에서 없애는 것도 선택지다.
  5. 목록 번호 스타일: CommonMark·GFM에는 없다. Pandoc의 `a)` 표기는 다른 파서들이 목록으로 읽지 않는다. 이번에는 div 클래스로 우회했다.
  6. 고정 번호(`enumerator`)와 그림·표 번호 숨김(`.unnumbered`)의 의미: Pandoc 속성 틀을 쓰지만 키와 의미는 리치오 규칙이다.
  7. 표 주석: div 안에서 캡션 줄 뒤에 오는 문단이라는 규칙.
  8. 여러 줄·빈 수식의 라벨: Quarto의 `$$ … $$ {#eq-x}`는 remark-math와 markdown-rs가 문서 끝까지 수식으로 읽어 쓸 수 없다. div로 우회했다.
  9. 빈 체크 항목(두 프로필 공통).

**external 프로필 표: 관례·도구·파서 지원**

| 리치오 의미 | 고른 관례 | 알아보는 도구 | JS 파서 | markdown-rs |
| --- | --- | --- | --- | --- |
| 문서 설정 | YAML 머리말 | GitHub, VS Code, Obsidian, Pandoc, Quarto | remark-frontmatter | 있음 |
| 표·체크 목록·취소선 | GFM | GitHub, VS Code, Obsidian, Pandoc, Quarto | 기존 micromark GFM 확장(자동 링크 제외) | 있음 |
| 미주 | GFM 각주 | GitHub, VS Code(확장), Obsidian, Pandoc, Quarto | 기존 확장 | 있음 |
| 수식 | `$`, `$$` | GitHub, VS Code, Obsidian, Pandoc, Quarto | remark-math | 있음 |
| 다이어그램 | ```` ```mermaid ```` | GitHub, Obsidian, VS Code(확장) | 기본 코드 블록 | 있음 |
| 알림 상자 | GitHub alerts, Obsidian 사용자 종류 | GitHub, Obsidian(VS Code·Pandoc은 인용문으로 표시) | 후처리(직접 만듦) | 후처리 가능 |
| 아래·위 첨자 | HTML `<sub>`·`<sup>` | GitHub, VS Code, Obsidian, Pandoc(HTML 출력) | 후처리(직접) | 후처리 가능 |
| 그림·캡션·라벨 | Quarto figure div, `fig-alt` | Quarto, Pandoc(div·속성 유지) | 후처리(직접) | 후처리 가능 |
| 표 캡션·라벨 | Pandoc `: 캡션 {#tbl-x}` | Pandoc, Quarto | 후처리(직접) | 후처리 가능 |
| 수식 라벨 | Quarto `$$x$$ {#eq-x}` | Quarto | 후처리(직접) | 후처리 가능 |
| 상호참조 | Quarto `@fig-x` 등 | Quarto | 후처리(직접, 원문 위치 필요) | 후처리 가능(아래 주의점) |
| 인용 | Pandoc `[@a; @b]`, `@a` | Pandoc, Quarto | 후처리(직접) | 후처리 가능 |
| 구역 라벨 | Pandoc 제목 속성 `{#sec-x}` | Pandoc, Quarto | 후처리(직접) | 후처리 가능 |
| 구역(div) | Pandoc fenced div | Pandoc, Quarto | 후처리(직접) | 후처리 가능 |
| 병합 칸 표 | 원시 HTML `<table>` + Markdown 칸 | GitHub, VS Code, Pandoc | 후처리(직접) | 후처리 가능 |

구역(div)은 Pandoc fenced div를 골랐다. remark-directive 문법(`:::name{…}`)을 알아보는 곳은 remark 계열과 Docusaurus 정도이고, Pandoc·Quarto는 이를 그림·표 구역으로 쓰지 않는다. GitHub·VS Code·Obsidian에서는 두 문법 모두 그냥 글자로 보인다.

병합 칸 표는 ADR-0024 부분집합과 다르게 썼다. ADR-0024는 칸 안을 인라인 HTML과 `data-myst` span으로 쓰지만, 여기서는 칸 안을 Markdown으로 둬서 수식·참조·미주·인용이 일반 표기 그대로 남는다. 대신 칸마다 빈 줄이 필요해 원문이 길어진다.

**쓰기에서 찾은 기존 라이브러리 문제** (모두 어댑터에서 우회했다):

- mdast-util-directive 3.2.1:
  - 앞 글자가 이스케이프되면(`\$:sub`) `:` 이스케이프를 빼먹어, 다시 읽을 때 지시문이 된다.
  - 지시문 라벨 안에서는 phrasing 이스케이프를 하지 않아, 백틱이 든 캡션이 코드로 바뀐다.
  - 모든 `:문자`를 이스케이프해 `10\:30`처럼 읽기 어려워진다. 이 범위는 좁혔다.
- micromark-extension-directive 4.0.0: 이름 안에 탭을 받아들인다(`:x\t{b}`).
- mdast-util-to-markdown: 붙은 순서 목록 사이에서 구분자를 `.`/`)`로 번갈아 바꿔 의미가 달라진다. 붙은 인라인 수식 `$a$$b$`를 구분하지 않는다.
- mdast-util-gfm-task-list-item: 문단이 없는 체크 항목에는 체크 상자를 쓰지 않는다.
- mdast에는 순서 목록 구분자와 인라인 수식의 `$` 개수가 없다. 원문 위치로 읽었다.

**일반 마크다운 참고** (질문 1의 기준은 아님): 저장소 추적 `.md` 217개 중 Core(표식을 붙여 읽음)는 186개, directive·external 읽기(표식 요구 없음)는 각각 187개를 받아들였다. 거부 사유는 HTML 7~8, 문단 밖 이미지 13, 참조식 링크 2, 중첩 7 등이다. 지금 일반 마크다운을 열지 못하는 문제(11-25 실측 175/203)는 형식보다 지원 계약이 좁은 데서 온다는 기존 판단과 어긋나지 않는다. 새 형식이 이 문제를 풀지는 않는다. 이 측정의 새 읽기는 머리말 키를 검증하지 않으므로 Core보다 느슨하다.

### 질문 2. 속도 (JS, 한 번 처리 비용)

#1983 합성 혼합 문서로, 한 Node 프로세스에서 9회 실행한 중앙값(ms)이다. 다른 측정이 돌지 않을 때 쟀다.

| 2,300블록 / 5,000블록 | MyST(Core) | directive | external |
| --- | --- | --- | --- |
| 읽기: 파서만 | 126 / 324 (MyST 파서 + Core 변환) | 180 / 440 (remark) | 165 / 391 |
| 읽기: 모델까지 | 공개 `parse` 436 / 1,004 (수용 검사·쓰기 사전 확인 포함) | 184 / 449 | 162 / 419 |
| 읽기 모델 투영 | 4 / 8 | 위에 포함 | 위에 포함 |
| 쓰기 | 공개 `serialize` 295 / 695 (다시 읽어 지문 비교 포함) | 48 / 108 | 49 / 108 |
| 검증 포함 쓰기 (쓰기 + 다시 읽기 + 모델 비교) | 위와 같음 | 259 / 584 | 247 / 572 |

- remark 파서는 MyST(markdown-it) 파서보다 1.2~1.4배 느리다.
- 쓰기만 보면 remark가 약 6배 빠르다. 다만 Core 쓰기에는 다시 읽기 검증이 들어 있다. 같은 검증을 넣으면 0.8~0.9배로 비슷해진다.
- Core 공개 `parse`가 느린 이유는 형식이 아니라, 열 때 하는 정규 쓰기 사전 확인이다.

### 질문 3. markdown-rs(Rust) 일치

markdown-rs 1.0.0을 JS와 같은 구성(CommonMark, 자동 링크·한 물결표를 뺀 GFM, 수식, 머리말)으로 설정했다. 같은 문서를 JS와 Rust로 읽어 mdast를 비교했다(위치와 `data`는 제외).

| 문서 | 수 | 구조 일치 | 비고 |
| --- | --- | --- | --- |
| directive 형식으로 쓴 코퍼스 | 1,028 | 791 | 차이 237건은 모두 지시문이다. **markdown-rs에는 지시문 구성 요소가 없다** |
| external 형식으로 쓴 코퍼스 | 1,024 | **1,023** | 1건은 markdown-rs 버그(아래) |
| 저장소 `.md` 원문 | 217 | 208 | 제목 버그 6, 표 이어짐 1, 목록 spread 2 |

- markdown-rs 1.0.0은 `# #foo`를 `foo`로 읽는다(CommonMark에서는 `#foo`). 저장소 문서의 `## #1201 …` 같은 제목이 모두 달라졌다. 쓰기에서 제목 첫 `#`를 이스케이프하면 피할 수 있다.
- 표 바로 다음 줄이 `#1994:`처럼 `#`로 시작하면 remark는 표 행으로, markdown-rs는 표 밖으로 읽는다.
- Rust에 없는 확장은 지시문(remark-directive)과 외부 관례 후처리 전부다. 후처리는 CommonMark·GFM mdast와 원문 위치만 쓰므로 Rust로 옮길 수 있다.
- 위치 규칙이 다르다.
  - JS는 UTF-16, Rust는 UTF-8 바이트 단위다.
  - markdown-rs는 목록·목록 항목·각주 정의의 끝에 줄바꿈을 포함한다.
  - 텍스트가 이스케이프로 시작하면 markdown-rs는 백슬래시 뒤에서 위치를 시작한다(`\# h`의 텍스트가 2열부터). external 후처리는 `\@kim`과 `@kim`을 원문에서 구분하므로, Rust로 옮길 때는 시작 위치 바로 앞 글자도 봐야 한다.
  - ASCII 문서 중 위치까지 같은 것은 external 958개 중 816개였다.

### 4단계. Rust 부분 파이프라인

질문 1에서 directive 프로필은 의미를 잃지 않았고, external 프로필의 손실도 이름 붙일 수 있는 몇 유형으로 좁혀졌다. 조건을 충족한다고 보고 진행했다.

범위:
- 포함: 제목, 문단과 인라인 서식(굵게·기울임·취소선·코드·링크·줄바꿈), 목록(글머리·번호·시작·`)`·체크·한 단계 중첩), 단순 표.
- 제외: 위·아래 첨자, 목록 스타일, 병합 칸, 수식, 미주, 참조.
- 문서: 같은 범위의 합성 2,300·5,000블록(문단 65%, 제목 10%, 목록 15%, 10행 표 10%, 한글·`@`·`#`·`|`가 섞인 글자).

구현:
- 읽기는 markdown-rs `to_mdast`, mdast에서 리치오 모델로의 변환은 직접 짰다.
- 쓰기도 직접 짰다. mdast-util-to-markdown 2.2.4의 이스케이프(`safe`)와 강조 인코딩을 옮겼고, 실제로 적용되는 규칙 98개는 JS에서 덤프해 그대로 쓴다.
- 강조 기호 재선택 탐색(guess/fix), setext 제목, 자동 링크 퍼센트 인코딩은 옮기지 않았다. 위치 계산은 UTF-16이 아닌 글자 단위다. 그래서 이 코퍼스 밖의 입력에서는 JS와 다른 바이트가 나올 수 있다. 그 범위는 재지 않았다.

| ms, 9회 중앙값, 2,300 / 5,000블록 | 읽기 | 의미 변환 | 쓰기 | 검증 포함 쓰기 |
| --- | --- | --- | --- | --- |
| ① MyST 경로(Core, JS) | 327 / 736 | 20 / 42 | 1,116 / 2,563 (검증 포함) | 같음 |
| ② remark 경로(JS) | 506 / 1,344 | 21 / 40 | 259 / 601 | 868 / 2,151 |
| ③ Rust 실행 파일 | 350 / 1,431 | 3 / 17 | 65 / 145 | 399 / 1,557 |
| ④ Node에서 WASM | 300 / 1,271 | 14 / 32 | 89 / 190 | 408 / 1,450 |

④의 의미 변환에는 Rust 모델을 JSON으로 만들어 JS로 복사하고 `JSON.parse`하는 비용까지 들어 있다. ④의 쓰기에는 JS 쪽 `JSON.stringify`와 문자열 복사가 들어 있다.

- 바이트: ②와 ③, ②와 ④의 출력 Markdown이 두 크기 모두 **바이트 단위로 같았다**.
- 모델: ①=②, ②=③, ②=④ 모두 같았다.
- 읽기 + 의미 변환 + 검증 포함 쓰기 합계는 다음과 같다.
  - 2,300블록: ① 1,463, ② 1,395, ③ 752, ④ 722
  - 5,000블록: ① 3,341, ② 3,535, ③ 3,005, ④ 2,753

해석:
- **Rust의 이득은 쓰기와 의미 변환에 있다.** 쓰기는 remark JS보다 약 4배 빠르다.
- **읽기는 이득이 거의 없다.** markdown-rs는 remark JS와 비슷하거나 약간 빠르고, 지금 MyST(markdown-it) 읽기보다는 빠르지 않다.
- 5,000블록에서 markdown-rs 읽기는 바이트가 2.2배일 때 시간이 약 4.1배 늘었다. 원인은 조사하지 않았다.
- 다른 Rust 파서(pulldown-cmark, comrak 등)는 mdast를 내지 않아 재지 않았다.
- 지금 저장 지연(2,300블록에서 2~5.5초)의 큰 부분은 같은 문서를 여러 번 파싱·복제하는 구조이고, #1983에서 고치고 있다. 그래서 위 표는 한 번 처리하는 비용만 비교했다.
- 그 기준으로 Rust(WASM 포함)는 2,300블록에서 지금 경로의 약 절반(1.46초 → 0.72초)이지만, 5,000블록에서는 약 18% 줄어드는 데 그쳤다.

## 검증하지 않은 것과 한계

- 비교는 Core 공개 읽기 모델 기준이다. 머리말 YAML의 주석·키 순서 같은 바이트 보존은 비교하지 않았다. 두 프로필 모두 머리말은 YAML 그대로이고, `numbering` 같은 키의 의미는 리치오가 계속 정의해야 한다.
- 새 읽기는 Core의 수용 규칙을 모두 옮기지 않았다. 머리말 키 검증, 라벨 규칙, 인용 키 규칙, 유니코드 검사, 고정 번호 모순 검사가 빠져 있다. 그래서 측정은 "Core가 받아들인 문서를 새 형식이 담는가"에 한정된다.
- GFM 각주는 라벨을 대소문자 구분 없이 맞추고, Core는 정확히 맞춘다. 대소문자만 다른 라벨 두 개는 시험하지 않았다.
- external의 남은 퍼징 차이(395문서)와 읽기 거부(83문서)는 후처리 구현 결함으로 분류했지만, 모두 고치지는 않았다.
  - 마지막 측정 뒤에 결함 하나를 고쳤다(대괄호 인용이 단어 바로 뒤에 오는 경우). 그 뒤 10,000건 퍼징은 다시 돌리지 않았고, 2,000건 표본으로 남은 유형만 확인했다.
- 원문 위치 기반 후처리는 깨지기 쉽다는 것이 확인됐다. 제품으로 만든다면 JS의 micromark 확장과 markdown-rs 쪽 구현을 함께 만들어야 한다. markdown-rs에는 사용자 확장 지점이 없어 포크나 상류 기여가 필요하다.
- 편집기·CLI·비서·Host·플러그인 쪽은 실행하지 않았다. 속도는 Windows 한 대에서 Node 한 프로세스로 쟀고, 파일 I/O·HTTP·브라우저는 포함하지 않았다.
- Rust는 gnu 툴체인 1.100.0으로 빌드했다. MSVC 빌드 도구가 없어 msvc 타깃(이 PC의 cargo 1.96.1)으로는 재지 못했다.

## 현재 결정과 어긋나는 점

이 스파이크는 Core를 바꾸지 않았다. 전환한다면 아래가 바뀐다.

- [ADR-0002](../../docs/adr/0002-document-persistence-semantic-ownership.md): MyST를 영구 모델로 고정하지 않으므로 교체 자체는 결정과 어긋나지 않는다. "보존할 수 없으면 쓰기를 거부한다"는 새 쓰기에도 필요하다. 스파이크의 검증 포함 쓰기가 그 형태다.
- [ADR-0006](../../docs/adr/0006-native-document-boundary.md)과 [Native document support](../../docs/design/document-support-v1.md): 표식 `litzio: 1`, 지원 문법, 정규 표기가 모두 MyST 기준이다. 표식 버전과 정규형 전체를 새로 정해야 한다.
- [ADR-0023](../../docs/adr/0023-table-inline-breaks-and-notes.md)·[ADR-0024](../../docs/adr/0024-complex-tables.md): 표 주석은 `{table}` 지시문 안의 MyST legend이고, 병합 칸 HTML은 `data-myst` span을 쓴다. external 프로필에서는 둘 다 다른 표기다.
- [ADR-0008](../../docs/adr/0008-citations-and-bibliography.md)(동결): external 프로필은 인용 역할 하나(`{cite}`)와 여러 키 서술형 인용을 담지 못한다.
- 상호참조·번호 계약(section references, heading numbering, footnotes, figure authoring, table caption): 대상 `(label)=`, 역할 표기, 라벨 규칙이 MyST 기준이다.
- [Parser security](../../docs/design/parser-security-v1.md)와 [dependency patches](../../docs/contributing/dependency-patches.md): MyST·markdown-it 쪽 패치 6개는 사라지지만, 이번에 찾은 remark 쪽 문제에 대한 새 우회가 생긴다.
- 2026-11-20 조사의 "MyST 유지" 결론: 이번 스파이크는 그때 보지 않은 remark 선택지를 쟀다. 결론은 소유자가 정한다.

## 추천 결론

**미정.** 결론을 내리려면 두 가지가 먼저 정해져야 한다.
- MyST를 걷어낼 이유가 속도인지, 파서 의존·패치 같은 유지비인지, 외부 도구 호환인지.
- external 관례의 한계(인용 역할, 라벨 접두사, `caution`, 구역 대상 위치)를 받아들일지.

에이전트 추천:

1. **속도만으로는 전환하지 않는다.** remark 읽기는 MyST보다 느리고, markdown-rs도 MyST 읽기보다 빠르지 않다. 쓰기는 빨라지지만 저장 지연의 큰 부분은 #1983이 다루는 반복 파싱 구조다.
2. **다른 이유로 걷어낸다면 섞는 안이 현실적이다.** 의미를 잃지 않는다고 확인된 것은 directive 프로필뿐이다. external 관례만으로는 인용 역할·라벨 등에서 의미를 줄이거나 리치오 규칙을 바꿔야 한다.
   - 1:1로 담기고 널리 표시되는 관례는 그대로 쓴다: GFM 표·체크·각주·취소선, `$` 수식, `<sub>`·`<sup>`, Mermaid 코드 블록, GitHub alerts 5종, YAML 머리말.
   - 나머지(그림·표 구역, 상호참조, 인용, 목록 스타일, 대상)는 리치오 표기로 둔다.
   - 구역 문법을 remark-directive로 할지 Pandoc div로 할지는 정해야 한다. remark-directive는 JS 플러그인이 있지만 Rust에는 없다. Pandoc div는 외부 호환이 넓지만 JS와 Rust 모두 직접 만들어야 한다.
3. **Rust는 지금 전환의 근거가 되지 않는다.** Rust Core를 원한다면, 읽기에 markdown-rs가 아닌 더 빠른 파서를 쓸 수 있는지 먼저 따로 잰다.

**전환할 때의 비용과 위험** (추정, 실행하지 않음):

| 대상 | 규모·내용 |
| --- | --- |
| Core MyST 경계 | `packages/core/src/myst/` 3,741줄(Core 소스 8,120줄 중)을 새로 쓴다. 이 경계를 가져오는 Core 파일이 11개 더 있고, `myst-*` 패키지를 직접 가져오는 파일이 13개다. #1983 국소 쓰기는 MyST 위치에 기대고 있어 다시 맞춰야 한다 |
| Core 테스트·픽스처 | 테스트 7,283줄 중 MyST 문법이 든 줄 약 314줄, 픽스처 `.md` 34개, 저장 바이트 회귀 JSON(생성 사례 987건)을 새 형식으로 다시 만든다 |
| 의존성 | `myst-parser`, `myst-to-md`, `myst-transforms`, `myst-common`, `myst-frontmatter`와 패치 6개를 없애고, remark 계열과 새 우회를 넣는다 |
| 편집기·CLI·SDK | 편집기는 Core 읽기 모델과 연산만 써서 영향이 작다(MyST 문법이 든 개발용 예제 1개). CLI와 플러그인 SDK 소스에는 MyST 문법이 없다 |
| 비서 지시문 | `litzio-guide/SKILL.md`에 MyST 그림 예시가 1곳 있다. 비서의 문서 표기 안내를 새 표기로 바꾼다 |
| 템플릿·샘플 | 샘플 en/ko, 편집기 기본 문서, 기본 템플릿 2종을 다시 만든다 |
| 플러그인이 만드는 문서 | litzio/plugins는 확인하지 않았다. Core `authorDocument`를 거친다면 영향이 작고, MyST 원문을 직접 만든다면 고쳐야 한다 |
| 계약 문서 | ADR-0006·0023·0024, 문서 지원·표·그림·참조·번호·각주·인용·파서 보안 계약, 의존성 패치 문서 |
| 이미 저장된 문서 | 개발 단계라 호환을 요구하지 않는다(AGENTS.md). 필요하면 "Core MyST 읽기 → 새 형식 쓰기" 변환은 이 스파이크의 왕복 경로로 거의 갖춰져 있다 |

단계 나누기 예시:
1. 프로필과 표식 버전을 정한다(소유자).
2. Core 안에 새 읽기·쓰기를 MyST 경계와 나란히 두고, 기존 코퍼스와 퍼징으로 두 경로를 대조한다.
3. 정규 쓰기를 새 형식으로 바꾸고 픽스처와 바이트 회귀를 다시 만든다.
4. 샘플·템플릿·비서 지시문·계약 문서를 고친다.
5. MyST 의존성과 패치를 지운다.

규모는 Core 경계를 다시 쓰는 데만 수 주로 본다. 근거는 이번 어댑터에서도 의미 보존을 맞추는 예외 처리가 측정 끝까지 계속 나왔다는 점이다.

## 코드 위치

- 태그 `spike/2026-11-27-markdown-without-myst`, 브랜치 `spike/markdown-without-myst`.
