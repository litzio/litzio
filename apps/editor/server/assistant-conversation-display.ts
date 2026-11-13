import { existsSync } from "node:fs";
import type { AssistantConversation, AssistantConversationItem } from "../shared/assistant.ts";

/** UI history never needs large model-facing tool payloads. Apply again at the transport boundary
 * for already-loaded conversations; provider-owned history and model results remain intact. */
export function displayToolResult(result:NonNullable<AssistantConversationItem["toolResult"]>) {
  const bytes=Buffer.byteLength(JSON.stringify(result.contentItems),"utf8");
  if(bytes<=16*1024)return result;
  // Creation cards use the small receipt, never the returned source, for Open/Undo.
  const receipts=result.contentItems.flatMap<any>(part=>{
    if(part.type!=="inputText" || !part.text)return [];
    try {const value=JSON.parse(part.text);
      if(value.workspace && value.documentRevision && (value.material || value.images))return [{workspace:value.workspace,documentRevision:value.documentRevision,contentRevision:value.contentRevision,
        ...(value.material ? {material:{pages:value.material.pages,items:value.material.items.map((item:any)=>({self_ref:item.self_ref}))}} : {runId:value.runId,images:value.images})}];
      return typeof value.path==="string" && /^[a-f0-9]{64}$/.test(value.revision) ? [{path:value.path,revision:value.revision,identity:value.identity}] : [];} catch {return [];}
  });
  return {...result,contentItems:[...receipts.map(value=>({type:"inputText",text:JSON.stringify(value)})),{type:"inputText",text:JSON.stringify({omitted:true,bytes,summary:"Tool result retained in provider history; omitted from display."})}]};
}
export function conversationForDisplay(conversation:AssistantConversation):AssistantConversation {
  let changed=false;
  const turns=conversation.turns.map(turn=>({...turn,items:turn.items.map(item=>{
    if(item.references?.length) {
      changed=true;
      item={...item,references:item.references.map(file=>({...file,unavailable:!existsSync(file.path)}))};
    }
    if(!item.toolResult)return item;
    const result=displayToolResult(item.toolResult);if(result===item.toolResult)return item;
    changed=true;return {...item,toolResult:result};
  })}));
  return changed ? {...conversation,turns} : conversation;
}
