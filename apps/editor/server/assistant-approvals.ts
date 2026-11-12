import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { AssistantQuestionRecord, AssistantUserInputAnswers } from "../shared/assistant.ts";

/** Provider decisions remain provider-owned; the existing question card transports the choice. */
export function codexApproval(method: string, params: any) {
  const elicitation = method === "mcpServer/elicitation/request";
  const schema = params.requestedSchema ?? { type: "object", properties: {} };
  const validate = elicitation && params.mode !== "url" ? new AjvJsonSchemaValidator().getValidator(schema) : undefined;
  const labels = elicitation ? ["Allow once", "Reject"] : ["Allow once", ...(Array.isArray(params.availableDecisions) && !params.availableDecisions.includes("acceptForSession") ? [] : ["Allow for this session"]), "Reject"];
  const result = (answers: AssistantUserInputAnswers) => {
    const answer = answers.decision!.answers[0]!;
    if (!elicitation) return { decision: answer === "Allow once" ? "accept" : answer === "Allow for this session" ? "acceptForSession" : "decline" };
    if (answer === "Reject") return { action: "decline", content: null, _meta: null };
    const content = params.mode === "url" ? null : answer === "Allow once" ? {} : JSON.parse(answer);
    if (validate && !validate(content).valid) throw new Error("Enter JSON matching the requested form schema, or reject the request.");
    return { action: "accept", content, _meta: null };
  };
  const questions: AssistantQuestionRecord["questions"] = [{ id: "decision", header: elicitation ? "MCP request" : "Permission request",
    question: [params.message, params.command, params.cwd, params.reason, params.url, elicitation && params.mode !== "url" ? `To submit form values, choose another answer and enter JSON: ${JSON.stringify(schema)}` : null].filter(Boolean).join("\n") || "Apply file changes?",
    isOther: elicitation && params.mode !== "url", isSecret: elicitation, options: labels.map(label => ({ label, description: "" })) }];
  return { immediate: !elicitation || params.mode === "url", questions, result, cancel: elicitation ? { action: "cancel", content: null, _meta: null } : { decision: "cancel" } };
}
