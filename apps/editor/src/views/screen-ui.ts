import type { SCREEN_UI } from "@litzio/plugin-sdk";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { DataTable } from "../components/DataTable.tsx";
import { Notice } from "../ui/primitives.tsx";
import { Chart, ScreenLayout, Slider, SummaryCard, Toolbar } from "../components/ui/screen-parts.tsx";

export const screenUI = { Button, Input, DataTable, Notice, Chart, ScreenLayout, Slider, SummaryCard, Toolbar } satisfies Record<keyof typeof SCREEN_UI, unknown>;
