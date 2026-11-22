import { convertQwertyToAlphabet, disassemble } from "es-hangul";

/**
 * Jamo for a query typed on the 2-beolsik layout while a Korean IME was in English mode
 * (`vy` → ㅍㅛ). Case matters: Shift gives double consonants and ㅒ/ㅖ. Only letters convert;
 * searches use this when the query as typed found nothing.
 */
export function qwertyHangulJamo(query: string): string | undefined {
  return /^[A-Za-z]+$/.test(query) ? convertQwertyToAlphabet(query) : undefined;
}

/** Text with Hangul split into jamo, so a syllable still being typed matches its word (ㅅㅜㅅㅣ in 수식). */
export function hangulJamo(text: string): string {
  return disassemble(text);
}
