// Only the explicit representative scope reduces coverage; unknown/unset scopes run all.
export function removalScenarios(scope?: string) {
  return [false, true].flatMap(silent =>
    (["empty", "user", "owner", "foreign", "helper", "environment"] as const)
      .filter(fault => silent || !["empty", "user"].includes(fault))
      .map(fault => ({ silent, fault })))
    .filter(({ silent, fault }) => scope !== "representative" ||
      (silent && ["empty", "user", "foreign"].includes(fault)));
}
