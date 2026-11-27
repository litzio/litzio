/**
 * The comparison model: Core's public read model (`getEditableDocument`) without the
 * snapshot-relative and derived fields, plus the parsed frontmatter object.
 *
 * Removed fields and why:
 * - `path` (blocks, captions, cells): a positional locator of the current snapshot (ADR-0003),
 *   not document meaning. Block order is kept by array position.
 * - `text` on blocks, captions and cells: display text derived from `content`.
 * - `editable`: always `true` for admitted documents.
 * Everything else (inline content trees, list format, labels, fixed numbers, numbering
 * visibility, figure content, table grid, spans, header rows, notes, captions) is compared.
 */
import { parse as parseYaml } from "yaml";
import { getEditableDocument, type Document } from "../../../packages/core/src/index.ts";

export type Inline = Record<string, unknown> & { kind: string };
export type Block = Record<string, unknown> & { block: string };
export type Model = { frontmatter: Record<string, unknown>; blocks: Block[] };

export function stripDerived(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDerived);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const hasPath = "path" in object;
  for (const [key, item] of Object.entries(object)) {
    if (key === "path" || key === "editable") continue;
    if (key === "text" && hasPath) continue;
    out[key] = stripDerived(item);
  }
  return out;
}

/** Leading YAML of a canonical native source. */
export function frontmatterText(source: string): string {
  const match = /^---\n([\s\S]*?\n)?---(?:\n|$)/.exec(source.replace(/^﻿/, ""));
  if (!match) throw new Error("no frontmatter");
  return match[1] ?? "";
}

export function coreModel(document: Document, canonicalSource: string): Model {
  const editable = getEditableDocument(document);
  return {
    frontmatter: (parseYaml(frontmatterText(canonicalSource)) ?? {}) as Record<string, unknown>,
    blocks: stripDerived(editable.blocks) as Block[],
  };
}
