import { Row, Section } from "../components/ui/row.tsx";
import { createElement, type ComponentProps } from "react";
import type { SCREEN_UI, ScreenNotification } from "@litzio/plugin-sdk";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Notice } from "../ui/primitives.tsx";
import { Status, Steps, EmptyState, Progress, Select, Chart, ScreenLayout, Slider, SummaryCard, Toolbar } from "../components/ui/screen-parts.tsx";
import { ContextMenu } from "../components/ui/context-menu.tsx";
import { ItemList } from "../components/ui/item-list.tsx";
import { NotificationSource } from "../components/ui/notification-center.tsx";
import { DocumentView } from "./screen-document-view.tsx";
import { LinkedDocumentView } from "./screen-linked-document-view.tsx";

export const screenUI = { ContextMenu, Row, Section, Button: ScreenButton, Input, Select, Status, Steps, EmptyState, Progress, ItemList, DataTable: ScreenDataTable, Notice, Notifications: ScreenNotifications, Chart, ScreenLayout, Slider, SummaryCard, Toolbar, DocumentView, LinkedDocumentView } satisfies Record<keyof typeof SCREEN_UI, unknown>;

// Cards render in the window-level center outside the screen's error boundary, so only
// plain-text items are registered; anything else is dropped rather than risking the window.
function ScreenNotifications({ items }: { items: readonly ScreenNotification[] }) {
  const notifications = items
    .filter(item => typeof item?.id === "string" && item.id !== "" && typeof item.message === "string" && item.message !== ""
      && (item.severity === "warning" || item.severity === "error"))
    .map(({ id, message, severity }) => ({ id, message, severity }));
  return createElement(NotificationSource, { items: notifications });
}

function ScreenDataTable(props: ComponentProps<typeof DataTable>) {
  return createElement("div", { className: "screen-data-table" }, createElement(DataTable, props));
}

function ScreenButton({ variant = "outline", ...props }: Omit<ComponentProps<typeof Button>, "variant"> & { variant?: ComponentProps<typeof Button>["variant"] | "secondary" }) {
  return createElement(Button, { ...props, variant: variant === "secondary" ? "outline" : variant });
}
