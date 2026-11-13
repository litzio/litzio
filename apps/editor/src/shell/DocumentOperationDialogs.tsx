import type { RefObject } from "react";
import { i18n } from "../i18n.ts";
import { splitDocumentPath } from "./document-path.ts";
import { Button } from "../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog.tsx";

export function OpenRefusalDialog({ openRefusal, setOpenRefusal, openRefusalReturnFocus, document }: {
  openRefusal: { path: string; reason: string; action: string; code?: string } | null;
  setOpenRefusal(value: null): void;
  openRefusalReturnFocus: RefObject<HTMLElement | null>;
  document: unknown;
}) {
  return (<Dialog open={openRefusal !== null} onOpenChange={(open) => { if (!open) setOpenRefusal(null); }}>
        <DialogContent showCloseButton={false} finalFocus={openRefusalReturnFocus}>
          <DialogHeader>
            <DialogTitle>{i18n.t("Cannot open document")}</DialogTitle>
            <DialogDescription render={<div />} className="grid gap-4 [overflow-wrap:anywhere]">
              <p>{i18n.t("“{{name}}” is not a supported {{product}} document.", { name: openRefusal ? splitDocumentPath(openRefusal.path).name : "" })}</p>
              {/* In plain words first; Core's exact reason and action follow as the details. */}
              {openRefusal?.code === "native-marker" ? (
                <p>{i18n.t("{{product}} edits only documents it created. To edit this text here, create a new document with + in the sidebar and paste it in. The file itself is left as it is.")}</p>
              ) : null}
              <div className="open-refusal-details">
                <p>{i18n.t("Technical details")}</p>
                <p>{openRefusal?.reason}</p>
                <p>{openRefusal?.action}</p>
              </div>
              <p>{document ? i18n.t("Your current document has not changed.") : i18n.t("No document was opened.")}</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" onClick={() => setOpenRefusal(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>);
}

export function ReloadChangesDialog({ reloadDialog, switching, setReloadDialog, fileActionsToggle, reloadFromDisk }: {
  reloadDialog: boolean; switching: boolean;
  setReloadDialog(open: boolean): void;
  fileActionsToggle: RefObject<HTMLButtonElement | null>;
  reloadFromDisk(): unknown;
}) {
  return (<Dialog open={reloadDialog} onOpenChange={(open) => { if (!switching) setReloadDialog(open); }}>
        <DialogContent showCloseButton={false} finalFocus={fileActionsToggle}>
          <DialogHeader>
            <DialogTitle>{switching ? i18n.t("Reloading…") : i18n.t("Discard local changes?")}</DialogTitle>
            <DialogDescription>{i18n.t("Reload replaces your unsaved changes and unapplied drafts with the file on disk. Keep editing to preserve them. Source lets you copy applied content first.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={switching} onClick={() => setReloadDialog(false)}>{i18n.t("Keep editing")}</Button>
            <Button variant="destructive" size="sm" disabled={switching} onClick={() => void reloadFromDisk()}>{i18n.t("Discard and reload")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>);
}
