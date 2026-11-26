import { randomUUID } from "node:crypto";
import type { PluginHost } from "./plugins/plugin-host.ts";
import type { FileAccess } from "./file-access.ts";
import { matchesFileAction } from "../shared/plugin-file-actions.ts";
export async function executeViewOperation(input:unknown,scope:{access:FileAccess;plugins?:PluginHost}) {
 const value=input as {action?:string;screenCode?:boolean;path?:unknown};
 if (value?.action === "file-actions") {
   const path = value.path;
   if (Object.keys(value).some(key => !["action", "path"].includes(key)) || typeof path !== "string" || !path.trim() || /[/\\]$/.test(path) || path.includes("\0")) {
     return { error: "Expected a file path", receipt: { requestId: randomUUID(), operation: "plugins.file-actions", version: 1, scope: "host", outcome: "refused" } };
   }
   const screens = scope.plugins?.viewScreens(false) ?? [];
   const fileActions = screens.sort((a, b) => a.plugin.localeCompare(b.plugin)).flatMap(screen =>
     screen.fileActions.filter(action => matchesFileAction(action, path)).map(action => ({
       ...action, plugin: screen.plugin, screenTitle: screen.title, activation: screen.activation,
     })));
   return { fileActions, receipt: { requestId: randomUUID(), operation: "plugins.file-actions", version: 1, scope: "host", outcome: "success" } };
 }
 if(value?.action!=="screens" || Object.keys(value).some(key=>!["action","screenCode"].includes(key)))throw new Error("Invalid screen request");
 return {screens:scope.plugins?.viewScreens(value.screenCode!==false)??[],receipt:{requestId:randomUUID(),operation:"plugins.screens",version:1,scope:"host",outcome:"success"}};
}
