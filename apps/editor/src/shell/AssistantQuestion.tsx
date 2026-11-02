import { useRef, useState } from "react";
import type { AiUserInput, AiUserInputAnswers } from "@litzio/plugin-api/ai";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { i18n } from "../i18n.ts";

export function AssistantQuestion({ question, disabled, submit }: { question: AiUserInput; disabled: boolean; submit(answers: AiUserInputAnswers): Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  return <form className="assistant-question" data-testid="assistant-question" onSubmit={event => {
    event.preventDefault();
    if (lock.current || disabled || !question.questions.every(q => values[q.id]?.trim())) return;
    lock.current = true; setSending(true);
    void submit(Object.fromEntries(question.questions.map(q => [q.id, { answers: [values[q.id]!] }]))).finally(() => { lock.current = false; setSending(false); });
  }}>
    {question.questions.map(q => <fieldset key={q.id} disabled={disabled || sending}>
      <legend>{q.header}</legend><p>{q.question}</p>
      {q.options?.map((option, index) => <label className="assistant-question-option" key={index}>
        <input type="radio" name={q.id} checked={!other[q.id] && values[q.id] === option.label} onChange={() => { setOther(previous => ({ ...previous, [q.id]: false })); setValues(previous => ({ ...previous, [q.id]: option.label })); }} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
      {q.isOther && !!q.options?.length ? <label className="assistant-question-option"><input type="radio" name={q.id} checked={!!other[q.id]} onChange={() => { setOther(previous => ({ ...previous, [q.id]: true })); setValues(previous => ({ ...previous, [q.id]: "" })); }} />{i18n.t("Write another answer")}</label> : null}
      {!q.options?.length || other[q.id] ? <label>{i18n.t("Your answer")}<Input className="assistant-question-input" type={q.isSecret ? "password" : "text"} autoComplete="off" value={values[q.id] ?? ""} onChange={event => setValues(previous => ({ ...previous, [q.id]: event.target.value }))} /></label> : null}
    </fieldset>)}
    <Button type="submit" size="sm" disabled={disabled || sending || !question.questions.every(q => values[q.id]?.trim())}>{i18n.t("Submit answers")}</Button>
  </form>;
}
