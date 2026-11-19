import {
  LayoutDashboard,
  Table,
  ChartColumn,
  FileText,
  Folder,
  // SPIKE #1812: distinct icons for synthetic plugins.
  ClipboardCheck, ShieldCheck, Factory, Truck, Presentation, BookOpen, Ruler, Rocket, NotebookPen, CalendarDays, BookA, History,
} from "lucide-react";
const icons = { LayoutDashboard, Table, ChartColumn, FileText, Folder, ClipboardCheck, ShieldCheck, Factory, Truck, Presentation, BookOpen, Ruler, Rocket, NotebookPen, CalendarDays, BookA, History };
export const viewScreenIcon = (name: string) =>
  icons[name as keyof typeof icons] ?? FileText;
/** SPIKE #1812 (1L/1T): whether a manifest icon name is one the Editor knows. */
export const hasViewScreenIcon = (name: string | undefined) => !!name && name in icons;
