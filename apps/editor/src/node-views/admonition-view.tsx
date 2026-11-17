import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { isAdmonitionVariant } from "@litzio/core";
import { i18n } from "../i18n.ts";
import { admonitionAppearance } from "../admonition-kinds.ts";

export function AdmonitionView({ node }: ReactNodeViewProps) {
  useTranslation();
  const variant = String(node.attrs.variant ?? "note");
  const appearance = admonitionAppearance(isAdmonitionVariant(variant) ? variant : "note");
  const label = isAdmonitionVariant(variant) ? appearance.label : variant;
  const Icon = appearance.icon;
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${appearance.tone}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <p className="admonition-label" contentEditable={false}><Icon aria-hidden="true" />{label}</p>
      <NodeViewContent className="admonition-body" data-testid="admonition-body" data-empty-prompt={node.content.size === 0 ? i18n.t("Enter callout text") : undefined} />
    </NodeViewWrapper>
  );
}
