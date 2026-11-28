import { createMystParser } from "myst-parser";
import type { VFile } from "vfile";
import { DocumentWriteError } from "../write-error.ts";
import { installedRule } from "./tokenizer-rule.ts";
import type { MystDocument, MystNode } from "./tree.ts";

type Definition = { label: string; line?: number; used: boolean };
const sourceLink = "(source link definition)";
const unusedDefinitions = new WeakMap<MystDocument, Definition>();

/** Reference definitions enter the tokenizer's environment and disappear from the AST.
 * Carry the identity of the definition only as far as the surviving link node. */
export function parseLinkDefinitions(text: string, file: VFile, options: Parameters<typeof createMystParser>[0]) {
  const definitions: Definition[] = [];
  const scopes = new WeakMap<object, Map<string, number>>();
  const links = new WeakMap<object, number>();
  let rootSource: string | undefined;
  let lookup: ((label: string) => void) | undefined;

  function observe<T>(run: () => T, onLookup?: typeof lookup): T {
    const previous = lookup;
    lookup = onLookup;
    try { return run(); }
    finally { lookup = previous; }
  }

  const parse = createMystParser({ ...options, mdast: { handlers: {
    link: { type: "link", getAttrs: token => {
      const definition = links.get(token);
      return { url: token.attrGet("href"), title: token.attrGet("title") ?? undefined,
        ...(definition === undefined ? {} : { [sourceLink]: definition }) };
    } },
  } } }, tokenizer => {
    tokenizer.core.ruler.before("block", "reference_source_scope", state => { rootSource ??= state.src; });
    const definitionRule = installedRule(tokenizer.block.ruler, "reference");
    tokenizer.block.ruler.at("reference", (state, start, end, silent) => {
      if (silent) return observe(() => definitionRule(state, start, end, silent));
      const env = state.env;
      let scope = scopes.get(env);
      const previousReferences = env.references;
      if (!scope) {
        scope = new Map();
        env.references = new Proxy(previousReferences ?? {}, {
          get(target, key, receiver) {
            if (typeof key === "string") lookup?.(key);
            return Reflect.get(target, key, receiver);
          },
        });
      }
      let label: string | undefined;
      const matched = observe(() => definitionRule(state, start, end, silent), key => { label = key; });
      if (matched && label !== undefined) {
        if (!scope.has(label)) scope.set(label, definitions.length);
        scopes.set(env, scope);
        definitions.push({ label, line: state.src === rootSource ? start + 1 : undefined, used: false });
      } else if (!scopes.has(env)) {
        if (previousReferences === undefined) delete env.references;
        else env.references = previousReferences;
      }
      return matched;
    });
    const linkRule = installedRule(tokenizer.inline.ruler, "link");
    tokenizer.inline.ruler.at("link", (state, silent) => {
      if (silent) return observe(() => linkRule(state, silent));
      let id: number | undefined;
      const start = state.tokens.length;
      const matched = observe(() => linkRule(state, silent), label => { id = scopes.get(state.env)?.get(label); });
      if (matched && id !== undefined) {
        const token = state.tokens.slice(start).find(token => token.type === "link_open");
        if (token) links.set(token, id);
      }
      return matched;
    });
    // Image alt text and reference images do not contribute a supported link node.
    const imageRule = installedRule(tokenizer.inline.ruler, "image");
    tokenizer.inline.ruler.at("image", (state, silent) => observe(() => imageRule(state, silent)));
  });

  const document = parse(text, file);
  function visit(node: MystNode): void {
    const id = node[sourceLink];
    if (typeof id === "number") {
      if (node.type === "link") definitions[id]!.used = true;
      delete node[sourceLink];
    }
    node.children?.forEach(visit);
  }
  visit(document);
  const unused = definitions.find(definition => !definition.used);
  if (unused) unusedDefinitions.set(document, unused);
  return document;
}

export function assertUsedLinkDefinitions(document: MystDocument): void {
  const unused = unusedDefinitions.get(document);
  if (unused) throw new DocumentWriteError(`Unused link reference definition [${unused.label}] would be lost on save`, {
    code: "invalid-reference", line: unused.line,
    action: "Keep editing as text, or use the definition in a link before opening as a structured document.",
  });
}
