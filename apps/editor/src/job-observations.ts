/** UI-owned ordering per K1 request; never serialize unrelated jobs or Host work. */
export class JobObservations {
  private generations = new Map<string, number>();
  private actions = new Set<string>();
  async observe<T>(id: string, kind: "poll" | "action", work: () => Promise<T>, accept: (value: T) => void, fail: (error: unknown) => void): Promise<void> {
    if (kind === "poll" && this.actions.has(id)) return;
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    if (kind === "action") this.actions.add(id);
    try {
      const value = await work();
      if (this.generations.get(id) === generation) accept(value);
    } catch (error) {
      if (this.generations.get(id) === generation) fail(error);
    } finally {
      if (kind === "action" && this.generations.get(id) === generation) this.actions.delete(id);
    }
  }
}
