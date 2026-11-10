import { useEffect, useState } from "react";
import type { HostClient } from "../host-client.ts";

/** Discovery comes from the owning Host's enabled providers, never a plugin-name/suffix branch in the app. */
export function useWorkspaceExtensions(client:HostClient,root:string,epoch:unknown) {
  const [value,setValue]=useState<{client:HostClient;root:string;extensions:string[]}>();
  useEffect(()=>{
    const controller=new AbortController();
    void client.request("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"workspace-find",root}),signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error();return response.json();})
      .then(data=>{if(!controller.signal.aborted)setValue({client,root,extensions:[...new Set<string>((data.providers??[]).flatMap((provider:{accept:string[]})=>provider.accept))]});})
      .catch(()=>{});
    return()=>controller.abort();
  },[client,root,epoch]);
  return value?.client===client&&value.root===root?value.extensions:[];
}
