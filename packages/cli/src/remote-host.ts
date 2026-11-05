import { RemoteHostRegistry, RemoteHostRefusal } from "../../../apps/editor/server/remote-host-registry.ts";
import { productVersion } from "./version.ts";

export async function remoteHostCli(args: string[]): Promise<number> {
  try {
    const registry = new RemoteHostRegistry();
    const [action, ...input] = args;
    let result: unknown;
    if (action === "list" && input.length === 0) result = { outcome: "success", hosts: registry.list(), windowObserved: false };
    else if (action === "register" && input.length === 2) result = registry.register(input[0], input[1]);
    else if (action === "rename" && input.length === 2) result = registry.rename(input[0], input[1]);
    else if (action === "remove" && input.length === 1) result = registry.remove(input[0], host => registry.cliRemovalProof(host.hostId));
    else if (["connect", "status"].includes(action) && input.length === 1) result = await registry.status(input[0], productVersion);
    else throw new RemoteHostRefusal("Usage: host list | register <origin> <label> | rename <hostId> <label> | remove <hostId> | connect|status <hostId>");
    process.stdout.write(JSON.stringify(result) + "\n");
    return (result as { outcome: string }).outcome === "success" ? 0 : 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ outcome: error instanceof RemoteHostRefusal ? "refused" : "failure", saved: false, reason: (error as Error).message }) + "\n");
    return 1;
  }
}
