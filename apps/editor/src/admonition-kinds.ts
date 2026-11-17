import { Info, Lightbulb, ShieldAlert, Star, TriangleAlert } from "lucide-react";
import type { AdmonitionVariant } from "@litzio/core";
import { i18n } from "./i18n.ts";

export const AUTHORABLE_ADMONITION_KINDS = ["note", "tip", "important", "warning", "danger"] as const;
type AuthorableKind = typeof AUTHORABLE_ADMONITION_KINDS[number];

const kinds = {
  note: { label: "Note", icon: Info, tone: "note" },
  tip: { label: "Tip", icon: Lightbulb, tone: "tip" },
  important: { label: "Important", icon: Star, tone: "important" },
  warning: { label: "Warning", icon: TriangleAlert, tone: "warning" },
  danger: { label: "Danger", icon: ShieldAlert, tone: "danger" },
  hint: { label: "Hint", icon: Lightbulb, tone: "tip" },
  seealso: { label: "See also", icon: Info, tone: "note" },
  attention: { label: "Attention", icon: TriangleAlert, tone: "warning" },
  caution: { label: "Caution", icon: TriangleAlert, tone: "warning" },
  error: { label: "Error", icon: ShieldAlert, tone: "danger" },
} as const satisfies Record<AdmonitionVariant, { label: string; icon: typeof Info; tone: AuthorableKind }>;

export function admonitionAppearance(variant: AdmonitionVariant) {
  const { label, icon, tone } = kinds[variant];
  return { label: i18n.t(label), icon, tone };
}

export function admonitionSearchTerms(variant: AuthorableKind) {
  const { label } = kinds[variant];
  return [label, i18n.t(label, { lng: "ko" }), "callout", "알림 상자", "admonition"];
}
