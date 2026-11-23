import { Row, Section } from "../components/ui/row.tsx";
import { createElement, type ComponentProps } from "react";
import type { SCREEN_UI } from "@litzio/plugin-sdk";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Notice } from "../ui/primitives.tsx";
import { Status, Steps, EmptyState, Progress, Select, Chart, ScreenLayout, Slider, SummaryCard, Toolbar } from "../components/ui/screen-parts.tsx";
import { ContextMenu } from "../components/ui/context-menu.tsx";
import { ItemList } from "../components/ui/item-list.tsx";
import { DocumentView } from "./screen-document-view.tsx";
import { LinkedDocumentView } from "./screen-linked-document-view.tsx";

export const screenUI = { ContextMenu, Row, Section, Button: ScreenButton, Input, Select, Status, Steps, EmptyState, Progress, ItemList, DataTable: ScreenDataTable, Notice, Chart, ScreenLayout, Slider, SummaryCard, Toolbar, DocumentView, LinkedDocumentView } satisfies Record<keyof typeof SCREEN_UI, unknown>;

function ScreenDataTable(props: ComponentProps<typeof DataTable>) {
  return createElement("div", { className: "screen-data-table" }, createElement(DataTable, props));
}

function ScreenButton({ variant = "outline", ...props }: Omit<ComponentProps<typeof Button>, "variant"> & { variant?: ComponentProps<typeof Button>["variant"] | "secondary" }) {
  return createElement(Button, { ...props, variant: variant === "secondary" ? "outline" : variant });
}
