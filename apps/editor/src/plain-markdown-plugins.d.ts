declare module "markdown-it-footnote" { import type { PluginSimple } from "markdown-it"; const plugin: PluginSimple; export default plugin; }
declare module "markdown-it-task-lists" { import type { PluginSimple } from "markdown-it"; const plugin: PluginSimple; export default plugin; }
declare module "markdown-it-texmath" { import type { PluginWithOptions } from "markdown-it"; const plugin: PluginWithOptions<{ delimiters: string; engine: unknown }>; export default plugin; }
