/** A Host-owned alternative to Codex's unconditional native async-question receipt. */
export const questionTool = {
  type: "function", name: "request_litzio_user_input",
  description: "Ask the user questions while continuing work. Use this instead of request_user_input_async in Litzio. Returns accepted:true only when a Litzio window viewing this conversation confirms question-card rendering; accepted:false explains display failure. Answers arrive as correlated user messages and can be selected options or free text.",
  inputSchema: { type: "object", additionalProperties: false, required: ["questions"], properties: {
    questions: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["title"], properties: {
      title: { type: "string", minLength: 1 }, options: { anyOf: [{ type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, { type: "null" }] },
    } } },
  } },
} as const;
