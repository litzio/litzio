import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { ASSISTANT, type AiProvider, type AssistantFileReference, type AssistantSkills } from "../../shared/assistant.ts";
import type { createAssistantRequest } from "../assistant-api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";

type Request = ReturnType<typeof createAssistantRequest>;
export type ComposerDraft = ReturnType<typeof useComposerDraft>;

/**
 * Draft text, attachments, the `/` skill picker and caret placement.
 * The caller owns this state for the panel's lifetime, so a hidden panel or another conversation keeps the draft.
 */
export function useComposerDraft({ request, open, provider }: { request: Request; open: boolean; provider: AiProvider }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [references, setReferences] = useState<AssistantFileReference[]>([]);
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const [skillCatalog, setSkillCatalog] = useState<AssistantSkills>();
  const [skillProblem, setSkillProblem] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const referenceCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (referenceCaret.current === null) return;
    // Apply selection with the controlled value, before another input can arrive.
    const position = referenceCaret.current; referenceCaret.current = null;
    input.current?.setSelectionRange(position, position);
  }, [message]);
  const addReference = (file: AssistantFileReference) => {
    setReferences(previous => {
      if (previous.some(value => samePath(value.path, file.path))) return previous;
      return [...previous, file];
    });
  };
  const reuse = (text: string) => {
    const next = message.trim() ? `${message.replace(/\s+$/, "")}\n${text}` : text;
    referenceCaret.current = next.length; setMessage(next); setMention(null);
    input.current?.focus();
  };
  const mentionOpen = mention !== null;
  useEffect(() => {
    if (!mentionOpen || !open) return;
    let alive = true;
    setSkillCatalog(undefined); setSkillProblem("");
    void request<AssistantSkills>(`${ASSISTANT.skillsRoute}?provider=${provider}`)
      .then(value => { if (alive) setSkillCatalog(value); })
      .catch(error => { if (alive) setSkillProblem(error.message); });
    return () => { alive = false; };
  }, [mentionOpen, open, provider]);
  const matches = mention ? (skillCatalog?.skills ?? []).map(skill => ({ ...skill, kind: "skill" }))
    .filter(file => `${file.displayName ?? ""} ${file.name} ${file.description}`.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase())) : [];
  useEffect(() => {
    if (mention) document.getElementById(`assistant-reference-${candidateIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [candidateIndex, mention?.query]);
  const chooseReference = (file: AssistantFileReference) => {
    addReference(file);
    if (mention) {
      const replacement = file.kind === "skill" ? `$${file.name} ` : "";
      referenceCaret.current = mention.start + replacement.length;
      setMessage(message.slice(0, mention.start) + replacement + message.slice(mention.end));
    }
    setMention(null); input.current?.focus();
  };
  const removeReference = (path: string) => {
    const skill = references.find(file => file.path === path && file.kind === "skill");
    if (skill) setMessage(value => value.split(/(\s+)/).filter(part => part !== `$${skill.name}`).join(""));
    setReferences(previous => {
      const remaining = previous.filter(file => file.path !== path && !(skill && file.kind === "skill" && file.name === skill.name));

      return remaining;
    });
  };
  const change = (value: string, end: number) => {
    setReferences(previous => {
      const remaining = previous.filter(file => file.kind !== "skill" || hasSkillToken(value, file.name));
      return remaining;
    });
    setMessage(value); const match = /(?:^|\s)\/([^\s]*)$/.exec(value.slice(0, end));
    if (match && !mentionOpen) { setSkillCatalog(undefined); setSkillProblem(""); }
    setMention(match && provider === "codex" ? { start: end - match[1].length - 1, end, query: match[1] } : null); setCandidateIndex(0);
  };
  /** Skills are a Codex feature; Copilot drafts keep files and images only. */
  const dropSkills = () => {
    setReferences(previous => previous.filter(file => file.kind !== "skill"));
    setMention(null);
  };
  const closeMention = () => setMention(null);
  const clear = () => { setMessage(""); setReferences([]); setMention(null); };
  return { input, message, references, mention, matches, skillCatalog, skillProblem, candidateIndex, setCandidateIndex,
    addReference, reuse, chooseReference, removeReference, change, dropSkills, closeMention, clear };
}

/** Attachments, the skill picker and the message field of the composer form. */
export function AssistantComposer({ draft, previews, uploading, disabled, placeholder, onSend, onPasteImages }: {
  draft: ComposerDraft; previews: Record<string, string>; uploading: boolean; disabled: boolean; placeholder: string;
  onSend(): void; onPasteImages(images: File[]): void;
}) {
  const { input, message, references, mention, matches, skillCatalog, skillProblem, candidateIndex, setCandidateIndex, chooseReference } = draft;
  return <>
    <ReferenceChips composer uploading={uploading} previews={previews} references={references} remove={draft.removeReference} />
    {mention ? <div className="assistant-reference-options" role="listbox" id="assistant-reference-options" aria-label={i18n.t("Codex skills")}>
      {matches.map((file, index) => <Button variant="ghost" size="sm" type="button" role="option" id={`assistant-reference-${index}`}
        aria-selected={candidateIndex === index} key={file.path} title={file.path} onMouseDown={event => event.preventDefault()} onClick={() => chooseReference(file)}>
        {file.displayName ?? file.name}
        <small className="type-helper">{file.kind === "skill" ? skillCatalog?.skills.find(skill => skill.path === file.path)?.description : file.path}</small>
      </Button>)}
      {!skillCatalog && !skillProblem ? <p role="status">{i18n.t("Loading skills…")}</p> : null}
      {(skillProblem || skillCatalog?.errors.length)
        ? <p role="alert">{i18n.t("Could not load some skills.")} {skillProblem || skillCatalog?.errors.map(error => `${error.path}: ${error.message}`).join("; ")}</p>
        : null}
      {!matches.length && skillCatalog ? <p>{i18n.t("No matching skills.")}</p> : null}
    </div> : null}
    <textarea onPaste={event => {
      const images = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/"))
        .map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (!images.length) return;
      event.preventDefault();
      onPasteImages(images);
    }} ref={input} aria-controls={mention ? "assistant-reference-options" : undefined} aria-expanded={mention ? true : undefined}
      aria-activedescendant={mention && matches[candidateIndex] ? `assistant-reference-${candidateIndex}` : undefined}
      aria-label={i18n.t("Message assistant")} placeholder={placeholder} value={message}
      onChange={event => draft.change(event.target.value, event.target.selectionStart)}
      disabled={disabled} onKeyDown={event => {
        if (mention && !event.nativeEvent.isComposing) {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); draft.closeMention(); return; }
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setCandidateIndex(index => matches.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0);
            return;
          }
          if (event.key === "Enter") { event.preventDefault(); if (matches[candidateIndex]) chooseReference(matches[candidateIndex]); return; }
        }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); } }} />
  </>;
}

export function ReferenceChips({ references, remove, previews, composer = false, uploading = false }: {
  references: AssistantFileReference[]; remove?(path: string): void; previews: Record<string, string>; composer?: boolean; uploading?: boolean;
}) {
  let imageNumber = 0;
  const files = references.map(file => {
    const number = file.pastedImage ? ++imageNumber : 0;
    return { file, number, name: number ? i18n.t("Image {{number}}", { number }) : file.kind === "skill" ? `$${file.name}` : file.name,
      preview: file.pastedImage ? previews[file.path] : undefined };
  });
  const thumbnails = composer ? files.filter(({ preview }) => preview) : [];
  const chips = composer ? files.filter(({ preview }) => !preview) : files;
  return <>
    {chips.length ? <span className="assistant-references">{chips.map(({ file, name, preview }) => <span className="assistant-reference type-helper" key={file.path}>
      <Tooltip><TooltipTrigger render={<span tabIndex={0} />} >
        {preview ? <img className="assistant-reference-preview" src={preview} alt="" /> : null}{name}{file.unavailable ? ` · ${i18n.t("Unavailable")}` : ""}
      </TooltipTrigger><TooltipContent className="break-all">{file.path}</TooltipContent></Tooltip>
      {remove ? <Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("Remove reference: {{name}}", { name: file.pastedImage ? name : file.name })}
        onClick={() => remove(file.path)}><X /></Button> : null}
    </span>)}</span> : null}
    {thumbnails.length || uploading ? <div className="assistant-image-previews">
      {thumbnails.map(({ file, name, number, preview }) => <Tooltip key={file.path}>
        <TooltipTrigger render={<span className="assistant-image-preview" tabIndex={0} />}>
          <img src={preview} alt={name} />
          <Button type="button" variant="outline" size="icon-sm" aria-label={i18n.t("Remove image {{number}}", { number })} onClick={() => remove?.(file.path)}><X /></Button>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>)}
      {uploading ? <span className="assistant-image-upload type-helper" role="status">
        <LoaderCircle className="animate-spin" aria-hidden="true" /><span aria-hidden="true">{i18n.t("In progress")}</span>
        <span className="sr-only">{i18n.t("Uploading images…")}</span>
      </span> : null}
    </div> : null}
  </>;
}

export function hasSkillToken(text: string, name: string) { return text.split(/\s+/).includes(`$${name}`); }

function samePath(a: string, b: string) {
  const normalize = (value: string) => /^[a-z]:|^\\\\/i.test(value) ? value.replaceAll("\\", "/").toLowerCase() : value;
  return normalize(a) === normalize(b);
}
