/**
 * Stage 4 input: synthetic documents limited to headings, paragraphs with inline formatting
 * (strong, emphasis, strikethrough, code, link, hard break), lists (bullet, numbered with start
 * and `)` delimiter, checklist, one nesting level) and simple tables. Written as MyST source that
 * Core admits; strikethrough uses the `{del}` role there.
 */
function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

const WORDS = ["measurement", "record", "value", "sample", "line", "result", "check", "limit", "range", "the", "is", "within", "of", "for",
  "측정", "기록", "값은", "범위", "안이다", "결과", "(rev. 2)", "10:30", "No. #12", "a@b.example", "50%", "x_y", "it's", "A-B", "1.5"];

export function inScopeSynthetic(size: number, seed = 20261127): string {
  const choose = random(seed + size);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(choose() * list.length)];
  const words = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
  const inline = (n: number, breaks: boolean): string => {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = choose();
      if (r < 0.55) parts.push(words(2 + Math.floor(choose() * 5)));
      else if (r < 0.65) parts.push(`**${words(2)}**`);
      else if (r < 0.75) parts.push(`*${words(2)}*`);
      else if (r < 0.82) parts.push(`\`${pick(["value", "x = 1", "cfg.limit", "a|b"])}\``);
      else if (r < 0.9) parts.push(`[${words(2)}](https://example.org/p/${Math.floor(choose() * 900)})`);
      else if (r < 0.96) parts.push(`{del}\`${pick(["old", "draft", "이전"])}\``);
      else if (breaks) parts.push("end\\\nnext");
      else parts.push(words(1));
    }
    return parts.join(" ") + ".";
  };
  const blocks: string[] = [];
  let previousList = false;
  for (let i = 0; i < size; i++) {
    const r = choose();
    if (r < 0.65) { blocks.push(inline(3 + Math.floor(choose() * 5), true)); previousList = false; }
    else if (r < 0.75) { blocks.push(`${"#".repeat(1 + Math.floor(choose() * 3))} ${inline(1 + Math.floor(choose() * 2), false)}`); previousList = false; }
    else if (r < 0.9) {
      if (previousList) { blocks.push(inline(2, false)); previousList = false; i++; if (i >= size) break; }
      const kind = pick(["bullet", "ordered", "paren", "check"] as const);
      const start = kind === "ordered" || kind === "paren" ? 1 + Math.floor(choose() * 5) : 0;
      const items = Array.from({ length: 2 + Math.floor(choose() * 3) }, (_, n) => {
        const marker = kind === "bullet" ? "*" : kind === "check" ? `* [${choose() < 0.5 ? "x" : " "}]` : `${start + n}${kind === "paren" ? ")" : "."}`;
        const indent = " ".repeat(kind === "bullet" || kind === "check" ? 2 : String(start + n).length + 2);
        const nested = choose() < 0.3 ? `\n${indent}* ${inline(1, false)}\n${indent}* ${inline(1, false)}` : "";
        return `${marker} ${inline(1 + Math.floor(choose() * 2), false)}${nested}`;
      });
      blocks.push(items.join("\n"));
      previousList = true;
      continue;
    } else {
      const columns = 2 + Math.floor(choose() * 2);
      const align = Array.from({ length: columns }, () => pick(["---", ":---", ":---:", "---:"]));
      const row = (header: boolean) => `| ${Array.from({ length: columns }, () => header ? words(1) : inline(1, false)).join(" | ")} |`;
      blocks.push([row(true), `| ${align.join(" | ")} |`, ...Array.from({ length: 10 }, () => row(false))].join("\n"));
      previousList = false;
    }
  }
  return `---\nlitzio: 1\n---\n\n${blocks.join("\n\n")}\n`;
}
