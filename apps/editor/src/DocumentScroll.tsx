import { ScrollArea } from "@base-ui/react/scroll-area";
import type { ComponentPropsWithoutRef } from "react";

/** The viewport remains the tab's native scroll owner for ProseMirror and shell consumers. */
export function DocumentScroll({ children, className = "", hidden, inert, style, onFocusCapture, onPointerDownCapture, ...props }: ComponentPropsWithoutRef<"div">) {
  return <ScrollArea.Root className="document-scroll-frame" hidden={hidden} inert={inert} style={{ ...style, position: "fixed" }}
    onFocusCapture={onFocusCapture} onPointerDownCapture={onPointerDownCapture}>
    <ScrollArea.Viewport {...props} hidden={hidden} inert={inert} style={style} className={`document-scroll ${className}`}>
      <ScrollArea.Content className="document-scroll-content" style={{ minWidth: 0 }}>{children}</ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar className="document-scrollbar" style={{ insetInlineEnd: "var(--document-scrollbar-inset, var(--shell-panel))", bottom: 0 }}>
      <ScrollArea.Thumb className="document-scrollbar-thumb" />
    </ScrollArea.Scrollbar>
  </ScrollArea.Root>;
}
