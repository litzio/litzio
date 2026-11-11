import { i18n, type MessageKey } from "./i18n.ts";

/** Display names for requirement attribute values; the stored values stay the English identifiers. */
const STATUS: Record<string, MessageKey> = { draft: "Requirement status draft", reviewed: "Requirement status reviewed", approved: "Requirement status approved", obsolete: "Requirement status obsolete" };
const TYPE: Record<string, MessageKey> = {
  functional: "Requirement type functional", performance: "Requirement type performance", interface: "Requirement type interface",
  safety: "Requirement type safety", constraint: "Requirement type constraint", information: "Requirement type information",
};
const STRENGTH: Record<string, MessageKey> = { shall: "Requirement strength shall", should: "Requirement strength should", may: "Requirement strength may" };

export const requirementStatusLabel = (value: string): string => STATUS[value] ? i18n.t(STATUS[value]) : value;
export const requirementTypeLabel = (value: string): string => TYPE[value] ? i18n.t(TYPE[value]) : value;
export const requirementStrengthLabel = (value: string): string => STRENGTH[value] ? i18n.t(STRENGTH[value]) : value;
