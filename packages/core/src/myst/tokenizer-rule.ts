/** An installed rule, captured through the public ruler API (without depending on
 * its function name or copying its algorithm). */
export function installedRule<Rule>(ruler: { getRules(chain: string): Rule[]; disable(name: string): unknown; enable(name: string): unknown },
  name: string): Rule {
  const rules = ruler.getRules("");
  ruler.disable(name);
  const otherRules = new Set(ruler.getRules(""));
  ruler.enable(name);
  return rules.find(rule => !otherRules.has(rule))!;
}
