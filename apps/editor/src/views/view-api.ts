import type { HostClient } from "../host-client.ts";
import type { PluginActivation } from "../../shared/plugin-activation.ts";
import type { FileActionContribution } from "@litzio/plugin-sdk";
export type ViewScreen={activation?:PluginActivation;entry:string;code?:string;codeRevision?:string;iconDigest?:string;plugin:string;id:string;title:string;icon:string;primary:boolean;fileActions?:FileActionContribution[]};
export type ViewResult={screens?:ViewScreen[]};
export async function viewRequest(client:HostClient,input:unknown,signal?:AbortSignal):Promise<ViewResult>{
 signal?.throwIfAborted();const response=await client.request("/api/plugin-screens",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal});const result=await response.json();signal?.throwIfAborted();if(!response.ok)throw new Error("Screen unavailable");return result;
}
