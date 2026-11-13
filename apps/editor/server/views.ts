import { randomUUID } from "node:crypto";
import type { PluginHost } from "./plugins/plugin-host.ts";
import type { FileAccess } from "./file-access.ts";
export async function executeViewOperation(input:unknown,scope:{access:FileAccess;plugins?:PluginHost}) {
 const value=input as {action?:string;screenCode?:boolean};
 if(value?.action!=="screens" || Object.keys(value).some(key=>!["action","screenCode"].includes(key)))throw new Error("Invalid screen request");
 return {screens:scope.plugins?.viewScreens(value.screenCode!==false)??[],receipt:{requestId:randomUUID(),operation:"plugins.screens",version:1,scope:"host",outcome:"success"}};
}
