import { isTargetIdentifierNode, normalizeLabel } from "myst-common";
import { basicTransformations, enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
import { resolveLabelReference } from "../label.ts";
import type { NodePath } from "../document.ts";
import { DocumentWriteError } from "../write-error.ts";
import { cloneDocument, getNode, type MystDocument, type MystNode } from "./tree.ts";

/** The identifier MyST resolves references against, or undefined when the label names nothing. */
export function labelIdentifier(label: string): string | undefined {
  return normalizeLabel(label)?.identifier || undefined;
}

/**
 * Nodes carrying each reference target identifier, as MyST's target enumeration
 * sees them. `(label)=` targets are not yet attached to their block
 * after parsing, so their label is normalized here the same way.
 */
function targetIdentifierNodes(root: MystNode): Map<string, MystNode[]> {
  const identifiers = new Map<string, MystNode[]>();
  const visit = (node: MystNode) => {
    const identifier = node.type === "mystTarget"
      ? typeof node.label === "string" ? labelIdentifier(node.label) : undefined
      : isTargetIdentifierNode(node) && typeof node.identifier === "string" ? node.identifier : undefined;
    if (identifier) {
      const nodes = identifiers.get(identifier) ?? [];
      nodes.push(node);
      identifiers.set(identifier, nodes);
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return identifiers;
}

/** A label may keep its own target, but must not take any other target's identifier. */
export function assertLabelAvailable(document: MystDocument, label: string, except?: NodePath): void {
  labelAvailability(document)(label, except);
}

/**
 * `assertLabelAvailable` for many labels of one unchanged document: the target index is built
 * once, so checking every label costs one index plus a lookup per label.
 */
export function labelAvailability(document: MystDocument): (label: string, except?: NodePath) => void {
  let index: { targets: ReturnType<typeof referenceTargetIndex>; raw: Map<string, MystNode[]> } | undefined;
  return (label, except) => {
    const identifier = labelIdentifier(label);
    if (!identifier) return; // Syntax/addressability validation belongs to the caller.
    const current = except ? getNode(document, except) : undefined;
    // Parsed targets attach to the following block during MyST enumeration.
    const targetPath = current?.type === "mystTarget" && except?.length === 1 &&
      document.children[except[0] + 1] ? [except[0] + 1] : except;
    const targetKey = targetPath?.join(".");
    index ??= { targets: referenceTargetIndex(document), raw: targetIdentifierNodes(document) };
    const { targets, raw } = index;
    const reason = targets.lookup(identifier)?.reason;
    if (reason) throw new DocumentWriteError(reason, { code: "invalid-label", action: "Choose a label whose normalized identifier is not an Object.prototype property." });
    // Keep raw targets too: unattached or overridden explicit labels must remain reserved.
    if ((raw.get(identifier) ?? []).some(node => node !== current) ||
        targets.candidates(identifier).some(node => !targetKey || targets.path(node)?.join(".") !== targetKey)) {
      throw new DocumentWriteError(`label ${JSON.stringify(label)} already names another target (including implicit heading IDs)`, { code: "label-conflict",
        action: "Choose a label not used by another target, including an unlabeled heading's automatic ID.",
      });
    }
  };
}

/**
 * Refuse a paste whose explicit labels repeat another explicit label: a label of a block the
 * paste adds against `others` (the document's other Figure/Table/Equation and section labels)
 * and against each other. Such a pair fails Save in any application order. Implicit heading
 * IDs are left to Save, and duplicates among `others` alone never refuse the paste.
 */
export function assertPastedLabelsAvailable(pasted: readonly string[], others: readonly string[]): void {
  // A label that normalizes to nothing (e.g. only quotes) compares as the empty identifier, so
  // two of them are refused here, as before, rather than pasted for Save to refuse.
  const key = (label: string) => labelIdentifier(label) ?? "";
  const taken = new Set(others.map(key));
  for (const label of pasted) {
    const identifier = key(label);
    if (taken.has(identifier)) {
      throw new DocumentWriteError(`label ${JSON.stringify(label)} already names another target`, { code: "label-conflict",
        action: "Choose a label not used by another target." });
    }
    taken.add(identifier);
  }
}

/**
 * MyST's one-page reference targets: labeled blocks, `(label)=` targets and implicit
 * heading IDs. Lookup uses MyST's resolver; candidates retain duplicates for fail-closed
 * edits, and paths locate resolved nodes in the original snapshot. Transforms run on a clone.
 */
export function referenceTargetIndex(document: MystDocument) {
  const tree = cloneDocument(document);
  // Keep snapshot locators outside the tree: transforms must not see invented attributes.
  const paths = new Map<MystNode, number[]>();
  const remember = (node: MystNode, path: number[]) => {
    paths.set(node, path);
    node.children?.forEach((child, index) => remember(child, [...path, index]));
  };
  remember(tree, []);
  const file = new VFile();
  basicTransformations(tree as never, file);
  const state = new ReferenceState("document.md", { vfile: file });
  enumerateTargetsTransform(tree as never, { state });
  // MyST chooses the first duplicate. Writes must also see the discarded candidates.
  const candidates = new Map<string, MystNode[]>();
  const visit = (node: MystNode) => {
    if (isTargetIdentifierNode(node) && typeof node.identifier === "string" && node.identifier) {
      const nodes = candidates.get(node.identifier) ?? [];
      nodes.push(node);
      candidates.set(node.identifier, nodes);
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return {
    // Inherited values make MyST throw, even if a normalized fallback target exists.
    // Return a failure (not a miss) so raw fragment lookup cannot skip that failure.
    lookup: (identifier: string): ReferenceLookup => {
      if (Object.hasOwn(state.targets, identifier)) return { target: state.getTarget(identifier) };
      if (identifier in state.targets) return {
        reason: `MyST target lookup for ${JSON.stringify(identifier)} hits an inherited Object.prototype property and cannot process references`,
      };
      return undefined;
    },
    candidates: (identifier: string) => candidates.get(identifier) ?? [],
    path: (node: MystNode) => paths.get(node),
  };
}

type ReferenceLookup =
  | { target: ReturnType<ReferenceState["getTarget"]>; reason?: never }
  | { target?: never; reason: string }
  | undefined;

/** Shared role/link lookup order, including MyST's raw-then-normalized fragment lookup. */
export function resolveReference<T>(node: MystNode, lookup: (identifier: string) => T | undefined): T | undefined {
  if (node.type === "crossReference" && typeof node.label === "string") {
    return resolveLabelReference({ label: node.label, ...(typeof node.identifier === "string" ? { identifier: node.identifier } : {}) }, lookup);
  }
  if (node.type === "link" && typeof node.url === "string" && node.url.startsWith("#")) {
    return resolveLabelReference({ url: node.url }, lookup);
  }
  return undefined;
}
