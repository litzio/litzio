export function normalizeLatex(source) {
  return source.trim()
    .replace(/^`{3}(?:latex|tex)?\s*\n([\s\S]*?)\n`{3}$/i, "$1")
    .trim()
    .replace(/^\$\$([\s\S]*?)\$\$$|^\\\[([\s\S]*?)\\\]$|^\$([\s\S]*?)\$$/, "$1$2$3")
    .replace(/\s+/g, "");
}

export function reportedLatex(text) {
  const fenced = [...text.matchAll(/```(?:latex|tex)?[ \t]*\r?\n([\s\S]*?)\r?\n```/gi)].map(match => match[1]);
  return fenced.length ? fenced : [text];
}
