import { useRef, useState } from "react";
import type { AssistantQuestionRecord, AssistantUserInput, AssistantUserInputAnswers } from "../../shared/assistant.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { i18n } from "../i18n.ts";

export function AssistantQuestion({ question, disabled, submit }: { question: AssistantUserInput; disabled: boolean; submit(answers: AssistantUserInputAnswers): Promise<void> }) {
  const [values, setValues] = useState(() => new Map<string, string>());
  const [other, setOther] = useState(() => new Map<string, boolean>());
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const record = "status" in question ? question as AssistantQuestionRecord : undefined;
  const status = record?.status ?? "pending";
  const waiting = status === "pending";
  return <form className="assistant-question" data-testid="assistant-question" data-question-status={status} data-question-request={JSON.stringify([question.turnId, typeof question.requestId, question.requestId])} onSubmit={event => {
    event.preventDefault();
    if (!waiting || lock.current || disabled || !question.questions.every(q => values.get(q.id)?.trim())) return;
    lock.current = true; setSending(true);
    void submit(Object.fromEntries(question.questions.map(q => [q.id, { answers: [values.get(q.id)!] }]))).finally(() => { lock.current = false; setSending(false); });
  }}>
    {question.questions.map(q => <fieldset key={q.id} disabled={disabled || sending}>
      <legend>{q.header || q.question}</legend>{q.header ? <p>{q.question}</p> : null}

      {!waiting ? <p className="assistant-question-answer">{record?.answers?.[q.id]?.answers.join(" · ")}</p> : <>
      {q.options?.map((option, index) => <label className="assistant-question-option" key={index}>
        <input type="radio" name={q.id} checked={!other.get(q.id) && values.get(q.id) === option.label} onChange={() => { setOther(previous => new Map(previous).set(q.id, false)); setValues(previous => new Map(previous).set(q.id, option.label)); }} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
      {q.isOther && !!q.options?.length ? <label className="assistant-question-option"><input type="radio" name={q.id} checked={!!other.get(q.id)} onChange={() => { setOther(previous => new Map(previous).set(q.id, true)); setValues(previous => new Map(previous).set(q.id, "")); }} />{i18n.t("Write another answer")}</label> : null}
      {!q.options?.length || other.get(q.id) ? <label>{i18n.t("Your answer")}<Input className="assistant-question-input" type={q.isSecret ? "password" : "text"} autoComplete="off" value={values.get(q.id) ?? ""} onChange={event => setValues(previous => new Map(previous).set(q.id, event.target.value))} /></label> : null}
      </>}
    </fieldset>)}
    {waiting ? <Button type="submit" size="sm" disabled={disabled || sending || !question.questions.every(q => values.get(q.id)?.trim())}>{i18n.t("Submit answers")}</Button>
      : <p role="status">{i18n.t(status === "answered" ? "Answered" : status === "expired" ? "Response ended" : status === "sending" ? "Sending…" : "Answer delivery needs confirmation")}</p>}
    {record?.error ? <p role="alert">{i18n.t(record.error, { defaultValue: record.error })}</p> : null}
  </form>;
}
