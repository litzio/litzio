import type { HostClient } from "../host-client.ts";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { createTemplateRequest } from "../template-api.ts";
import { messageOf } from "../document-session.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog.tsx";
import { FieldError } from "../ui/primitives.tsx";

const templateText = i18n.getFixedT(null, "templates");

export function SaveTemplateDialog({ client, path, returnFocus, onClose, onSaved }: {
  client: HostClient; path: string; returnFocus: HTMLElement | null; onClose(): void; onSaved(): void;
}) {
  useTranslation();
  const templateRequest = createTemplateRequest(client);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} initialFocus={field} finalFocus={() => returnFocus ?? true}>
      <form className="grid gap-3" onSubmit={async event => {
        event.preventDefault();
        if (pending || !name.trim()) return;
        setPending(true); setError("");
        try { await templateRequest("templates", { name: name.trim(), description: description.trim(), from: path }); onSaved(); }
        catch (cause) { setError(messageOf(cause)); }
        finally { setPending(false); }
      }}>
        <DialogHeader><DialogTitle>{i18n.t("Save as template…")}</DialogTitle>
          <DialogDescription className="break-all">{path}</DialogDescription></DialogHeader>
        <label className="form-field"><span>{i18n.t("Name")}</span>
          <Input ref={field} value={name} disabled={pending} aria-invalid={!!error} aria-describedby={error ? "template-save-error" : undefined}
            onChange={event => { setName(event.target.value); setError(""); }} /></label>
        <label className="form-field"><span>{templateText("Description")}</span>
          <Input value={description} disabled={pending} onChange={event => setDescription(event.target.value)} /></label>
        <FieldError id="template-save-error">{error}</FieldError>
        <DialogFooter><Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onClose}>{i18n.t("Cancel")}</Button>
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>{i18n.t("Save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
