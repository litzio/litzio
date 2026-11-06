import {
  LayoutDashboard,
  Table,
  ChartColumn,
  FileText,
  Folder,
} from "lucide-react";
const icons = { LayoutDashboard, Table, ChartColumn, FileText, Folder };
export const viewScreenIcon = (name: string) =>
  icons[name as keyof typeof icons] ?? FileText;
