import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EditableBlock } from "@litzio/core";

export type ProposalRequest = { block: EditableBlock; instruction: string };
/** Provider-neutral output. The Host, never this adapter, decides semantic validity. */
export type ProposalAdapter = (request: ProposalRequest) => Promise<string>;

export const fakeAdapter: ProposalAdapter = async ({ instruction, block }) => {
  if (instruction === "fixture:crash") process.exit(7);
  if (instruction === "fixture:timeout") await new Promise(() => setInterval(() => {}, 1000));
  if (instruction === "fixture:invalid") return "```{unsupported-proposal}\nbroken\n```";
  if (instruction === "fixture:delay") await new Promise(resolve => setTimeout(resolve, 150));
  if (block.block === "heading") return `${"#".repeat(block.level)} A clearer heading`;
  return "A clearer proposal for the selected paragraph.";
};

export const codexAdapter: ProposalAdapter = async request => {
  const directory = await mkdtemp(path.join(tmpdir(), "litzio-ai-proposal-"));
  const answer = path.join(directory, "answer.json"), schema = path.join(directory, "schema.json");
  try {
    await writeFile(schema, JSON.stringify({ type: "object", properties: { markdown: { type: "string" } }, required: ["markdown"], additionalProperties: false }));
    const prompt = `Propose an inline edit to ONE selected Litzio MyST block. Return JSON with markdown containing only the replacement block, no outer fence or frontmatter. Keep its kind and heading level. Keep references, inline formatting and meaning unless instructed otherwise. Do not use tools, read files or write documents.\nSelected block (public Core read model):\n${JSON.stringify(request.block)}\nUser instruction:\n${request.instruction}`;
    await new Promise<void>((resolve, reject) => {
      // No shell: instructions travel over stdin, not executable command text.
      const child = spawn("codex", ["exec", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral",
        "--sandbox", "read-only", "--model", "gpt-6.1-sol", "-c", 'model_reasoning_effort="low"',
        "--cd", directory, "--output-schema", schema, "--output-last-message", answer, "-"],
      { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
      let diagnostics = "";
      child.stderr.on("data", bytes => { diagnostics = (diagnostics + bytes.toString()).slice(-4000); });
      child.once("error", reject);
      child.stdin.on("error", () => {});
      child.once("close", code => code === 0 ? resolve() : reject(new Error(`Codex CLI failed (${code}): ${diagnostics}`)));
      child.stdin.end(prompt);
    });
    const result = JSON.parse(await readFile(answer, "utf8"));
    if (typeof result.markdown !== "string") throw new Error("Codex did not return replacement Markdown.");
    return result.markdown;
  } finally { await rm(directory, { recursive: true, force: true }); }
};
