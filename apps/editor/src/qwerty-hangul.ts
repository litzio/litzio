import { convertQwertyToAlphabet, disassemble } from "es-hangul";

/**
 * Jamo a search query is retried with when the query as typed found nothing. A letters-only query is
 * Hangul typed on the 2-beolsik layout while a Korean IME was in English mode (`vy` → ㅍㅛ; case matters:
 * Shift gives double consonants and ㅒ/ㅖ). A query with Hangul splits into jamo, so a syllable still
 * being composed matches its word (수시 → ㅅㅜㅅㅣ within 수식). Other queries are not retried.
 */
export function searchJamo(query: string): string | undefined {
  if (/^[A-Za-z]+$/.test(query)) return convertQwertyToAlphabet(query);
  return /\p{Script=Hangul}/u.test(query) ? hangulJamo(query.toLowerCase()) : undefined;
}

/** Text with Hangul split into jamo, so a syllable still being typed matches its word (ㅅㅜㅅㅣ in 수식). */
export function hangulJamo(text: string): string {
  return disassemble(text);
}
