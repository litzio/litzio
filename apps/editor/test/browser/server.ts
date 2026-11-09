import { fork } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";

const log = process.env.LITZIO_BROWSER_SERVER_LOG;
if (log) for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = ((...args: Parameters<typeof stream.write>) => {
    appendFileSync(log, args[0]);
    return write(...args);
  }) as typeof stream.write;
}

// Readiness is emitted by this process only after its own server has bound.
// Playwright captures this URL and passes it to workers; it never probes/reuses
// an unrelated listener while the owned child is starting.
const ready = (url: string) => console.log(`Browser server: ${url} (port ${new URL(url).port}, owner ${process.pid})`);

if (process.env.LITZIO_BROWSER_HOST === "http") {
  // The public production CLI deliberately rejects port zero. Ask the OS for
  // an available ephemeral port, then let the CLI bind strictly. If another
  // process wins the gap, CLI startup fails instead of attaching to that process.
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const child = fork(path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), [
    "daemon", "run", "--channel", "development", "--port", String(port),
    "--root", "tmp/http-host-a", "--root", "tmp/http-host-b",
  ], { cwd: REPOSITORY_ROOT, execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
  child.stdout!.on("data", chunk => process.stdout.write(chunk));
  child.stderr!.on("data", chunk => process.stderr.write(chunk));
  const stop = () => { child.kill("SIGTERM"); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  child.once("error", error => { console.error(error); process.exitCode = 1; });
  child.once("exit", (code, signal) => {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  child.once("message", message => {
    if ((message as { ready?: boolean }).ready) ready(`http://127.0.0.1:${port}`);
  });
} else {
  const { createServer } = await import("vite");
  const server = await createServer({ root: path.join(REPOSITORY_ROOT, "apps/editor"), server: { host: "127.0.0.1", port: 0, strictPort: true } });
  const stop = () => { void server.close().catch(error => { console.error(error); process.exitCode = 1; }); };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  await server.listen();
  const port = (server.httpServer!.address() as { port: number }).port;
  ready(`http://127.0.0.1:${port}`);
}
