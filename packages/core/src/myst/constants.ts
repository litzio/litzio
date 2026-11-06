/**
 * Marks the code block MyST makes from front matter. The fingerprint treats every
 * node field as semantic, so metadata cannot silently become a YAML code fence.
 * Unterminated or unrecognized delimiters remain unwritable. The parenthesized name is not a MyST field.
 */
export const FRONT_MATTER_FIELD = "(front matter)";
