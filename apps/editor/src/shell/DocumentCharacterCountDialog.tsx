import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { countDocumentCharacters, getEditableDocument, parse, type CharacterCount } from "@litzio/core";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { messageOf } from "../document-session.ts";

export type DocumentCharacterCountHandle = {
  show(readSource: () => Promise<string>, returnFocus: HTMLElement | null): void;
};

type Result = { count: CharacterCount } | { error: string };

export function DocumentCharacterCountDialog({ ref }: { ref: Ref<DocumentCharacterCountHandle> }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState<Result | "loading" | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = useRef(0);
  useImperativeHandle(ref, () => ({
    show(readSource, target) {
      const id = ++request.current;
      returnFocus.current = target;
      setResult("loading");
      void (async () => {
        try {
          const source = await readSource();
          if (request.current === id) setResult({ count: countDocumentCharacters(getEditableDocument(parse(source))) });
        } catch (cause) {
          if (request.current === id) setResult({ error: messageOf(cause) });
        }
      })();
    },
  }), []);

  const format = new Intl.NumberFormat(i18n.resolvedLanguage);
  return <Dialog open={result !== null} onOpenChange={open => {
    if (!open) { request.current++; setResult(null); }
  }}>
    <DialogContent showCloseButton={false} finalFocus={() => returnFocus.current ?? true}>
      <DialogHeader>
        <DialogTitle>{t("Character count")}</DialogTitle>
        <DialogDescription aria-live="polite" data-testid={result && result !== "loading" ? "character-count-result" : undefined}>
          {result === "loading" ? t("Loading…") : result && ("count" in result
            ? t("{{withSpaces}} with spaces · {{withoutSpaces}} without spaces", {
                withSpaces: format.format(result.count.withSpaces),
                withoutSpaces: format.format(result.count.withoutSpaces),
              })
            : t("Could not count document characters: {{reason}}", { reason: result.error }))}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter showCloseButton />
    </DialogContent>
  </Dialog>;
}
