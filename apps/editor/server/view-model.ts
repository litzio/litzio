import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { viewCatalog, validateView } from "@litzio/core";
const directory = path.resolve(process.env.LITZIO_VIEW_EVIDENCE ?? "tmp/dynamic-ui/evidence");
fs.mkdirSync(directory, { recursive: true });
const scratch = path.join(directory, "../model-cwd"); fs.mkdirSync(scratch, { recursive: true });
export const requests = ["폴더별 문서 수를 표만으로 보여줘. 열은 folder, documents만.", "폴더별 문서 수를 표와 막대 차트로 보여줘. 표 열은 folder, documents만.", "beta 폴더만 제목(heading) 수를 표로 보여줘. 열은 folder, headings. headings 내림차순으로 정렬해.", "폴더별 authorEmail을 표로 보여줘. 지원하지 않으면 unsupported에 이유를 쓰고 view는 null로 해."];
export const instruction = `You propose Litzio views. No tools, no files, no commands. Return ONLY JSON {"view": <spec or null>, "unsupported": <string or null>}. Never invent fields. No markdown fences. Catalog and read operation schema: ${JSON.stringify(viewCatalog)}. Open folder context: alpha and beta; local, no secrets. Only schema metadata is exposed, no document contents. `;
export async function call(model: string, id: string, prompt: string) {
  const output = path.join(directory, `${model}-${id}.txt`), started = Date.now();
  return await new Promise<any>((resolve, reject) => {
    const bin = process.env.LITZIO_CODEX_BIN ?? "codex.exe";
    const child = spawn(bin, ["exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "-C", scratch, "-s", "read-only", "-m", model, "-c", 'model_reasoning_effort="low"', "--json", "-o", output, "-"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let log = "", err = "";
    child.stdout.on("data", b => log += b); child.stderr.on("data", b => err += b);
    const timer = setTimeout(() => child.kill(), 90000);
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timer); fs.writeFileSync(path.join(directory, `${model}-${id}.jsonl`), log);
      let proposal: any, error: string | null = null;
      try { if (code !== 0) throw new Error(`exit ${code}: ${err.slice(-400)}`); proposal = JSON.parse(fs.readFileSync(output, "utf8")); if (proposal.view) validateView(proposal.view); else if (!proposal.unsupported) throw new Error("Missing proposal or refusal"); }
      catch (e) { error = String(e); }
      const events = log.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      resolve({ proposal, error, ms: Date.now() - started, usage: events.reverse().find(e => e.type === "turn.completed")?.usage, commands: events.filter(e => e.item?.type === "command_execution").length });
    }); child.stdin.end(prompt);
  });
}
