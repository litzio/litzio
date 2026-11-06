import type { CatalogView } from "@litzio/core/views-v2";
export type ViewDestination = {
  kind: "tab" | "document" | "screen";
  id: string;
  hostId: string;
  owner: string;
  root: string;
  documentPath?: string;
};
export type ViewDestinationToken = {
  destination: Readonly<ViewDestination>;
  generation: number;
  signal: AbortSignal;
};
/** App-owned delivery leases. Hidden targets remain registered; closed targets do not. */
export class ViewDestinationRegistry {
  private targets = new Map<
    string,
    {
      apply(view: CatalogView): void;
      generation: number;
      hostId?: string;
      controller?: AbortController;
    }
  >();
  register(id: string, apply: (view: CatalogView) => void) {
    this.invalidate(id);
    this.targets.set(id, { apply, generation: 0 });
  }
  begin(destination: ViewDestination): ViewDestinationToken {
    const target = this.targets.get(destination.id);
    if (!target) throw new Error("View destination is closed.");
    target.hostId = destination.hostId;
    target.controller?.abort();
    target.controller = new AbortController();
    target.generation++;
    return {
      destination: Object.freeze({ ...destination }),
      generation: target.generation,
      signal: target.controller.signal,
    };
  }
  apply(token: ViewDestinationToken, view: CatalogView): boolean {
    const target = this.targets.get(token.destination.id);
    if (
      !target ||
      token.signal.aborted ||
      target.controller?.signal !== token.signal ||
      target.generation !== token.generation
    )
      return false;
    if (view.profile !== "query" || view.owner !== token.destination.owner)
      return false;
    target.generation++;
    target.apply(view);
    return true;
  }
  invalidateHost(hostId: string) {
    for (const [id, target] of this.targets)
      if (target.hostId === hostId) this.invalidate(id);
  }
  invalidate(id: string) {
    this.targets.get(id)?.controller?.abort();
    this.targets.delete(id);
  }
}
