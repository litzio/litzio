import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { REVIEW_AUTHORING_CONTRACT, workspaceSnapshotSchema, updateReviewLedger, authorDocument,
  parse, serialize, getEditableDocument, updateNodeTextAtPath, convertBlock, removeBlock, updateTableCell,
  updateParagraphInlineContent, updateHeadingInlineContent, insertParagraph, insertHeading, insertTable,
  insertFigure, insertList, insertCodeBlock, insertEquation, updateLabel, updateEnumerator, updateEnumeration,
  updateTableCaption, updateList, updateCodeBlock, updateEquationLatex, updateFigure, inlineContentText, bodyEndIndex } from "@litzio/plugin-sdk";
import { readDoclingArchive, rewriteReview } from "./archive.js";
import { readReview, reviewItems, setProgress, comparison, originalReviewTarget } from "./review.js";
import { convertDocument } from "./document.js";

export const WORKSPACE_ADAPTER_VERSION = "docling-document-1/converter-1/mapping-2";
const hash = value => createHash("sha256").update(value).digest("hex");
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const cacheKey = snapshot => hash(JSON.stringify([snapshot.documentRevision,snapshot.adapterVersion,snapshot.authoringContract,snapshot.images]));
const metadataOf = archive => JSON.parse(archive.cacheEntries.get("current/snapshot.json").toString("utf8"));
const kindReason = "리치오 문서에 독립 블록이 없어 종류 교정을 지원하지 않습니다(블록 삽입 교정은 후속 단계)";

export function workspaceState(archive) {
  const record = readReview(archive.reviewBytes);
  let snapshot = null, cacheState = archive.cacheEntries?.size ? "invalid" : "missing";
  if (cacheState === "invalid") try {
    const {integrity,correspondence,...saved} = metadataOf(archive), source = archive.cacheEntries.get("current/document.md").toString("utf8");
    const parsed = workspaceSnapshotSchema.parse({...saved,source});
    if (hash(JSON.stringify([source,saved,correspondence])) !== integrity || hash(source) !== parsed.documentRevision ||
        parsed.contentRevision !== archive.manifest.document.sha256 || parsed.cacheKey !== cacheKey(parsed) ||
        correspondence.sourceHash !== archive.manifest.document.sha256 || correspondence.documentHash !== parsed.documentRevision) throw new Error("Mixed workspace document");
    if (new Set(parsed.images.map(image=>image.key)).size !== parsed.images.length || parsed.images.some(image=>
      !archive.manifest.images.some(original=>original.pointer===image.ref && original.sha256===image.revision && original.mimetype===image.mime))) throw new Error("Mixed workspace images");
    snapshot=parsed;
    cacheState=parsed.adapterVersion===WORKSPACE_ADAPTER_VERSION && parsed.authoringContract===REVIEW_AUTHORING_CONTRACT ? "current" : "created-version";
  } catch { /* A damaged authoritative document must never be regenerated from Docling. */ }
  const items=reviewItems(archive.document);
  if(snapshot) {
    const report=metadataOf(archive).correspondence, blocks=getEditableDocument(parse(snapshot.source)).blocks;
    const session=correctionSession(archive,snapshot,report);
    for(const item of items) {
      const mapped=report.items.find(entry=>entry.self_ref===item.self_ref);
      item.excluded=mapped?.status==="excluded";
      const block=mapped?.targets.length===1 && blocks.find(block=>same(block.path,mapped.targets[0].path));
      if(block && ["paragraph","heading"].includes(block.block) && item.kind==="texts") {
        item.text=block.text; item.label=block.block==="heading"?"section_header":"text";
        if(block.block==="heading")item.level=block.level;else delete item.level;
      }
      // Source-only items retain their evidence text; mapped items expose the saved document's values.
      if(item.kind==="texts" && mapped?.targets.length)try{item.text=session.value({type:"text",self_ref:item.self_ref});}catch{}
      if(item.cells)for(const cell of item.cells)try{cell.text=session.value({type:"cell",self_ref:item.self_ref,cell:cell.cell});}catch{}
    }
  }
  return {record:{...record,failedPages:archive.manifest.failedPages},ledger:record.ledger,items,snapshot,cacheState};
}
function save(archive,record,snapshot,correspondence) {
  snapshot=workspaceSnapshotSchema.parse({...snapshot,cacheKey:cacheKey(snapshot)});
  const {source,...saved}=snapshot;
  const metadata={...saved,correspondence,integrity:hash(JSON.stringify([source,saved,correspondence]))};
  return rewriteReview(archive,Buffer.from(JSON.stringify(record)),new Map([
    ["current/document.md",Buffer.from(source)],["current/snapshot.json",Buffer.from(JSON.stringify(metadata))],
  ]));
}
/** Adapt once when creating a new archive. Never replace an existing document. */
export async function initializeWorkspace(bytes) {
  const archive=readDoclingArchive(bytes);
  if(archive.cacheEntries.size)throw new Error("Workspace document already exists");
  const initial=await convertDocument(archive.document,archive.manifest.document.sha256);
  const images=initial.document.images.map(image=>{
    const revision=hash(Buffer.from(image.base64,"base64"));
    const original=archive.manifest.images.find(item=>item.sha256===revision && item.mimetype===image.mime);
    if(!original)throw new Error("Image is not owned by this archive");
    return {key:image.key,ref:original.pointer,revision,mime:image.mime};
  });
  const authored=await authorDocument(initial.document.authoring,Object.fromEntries(images.map(image=>[image.key,`review-asset:${image.revision}`])));
  const snapshot={source:authored.source,documentRevision:authored.documentRevision,inputs:authored.inputs,images,
    contentRevision:archive.manifest.document.sha256,adapterVersion:WORKSPACE_ADAPTER_VERSION,authoringContract:REVIEW_AUTHORING_CONTRACT};
  const report=initial.bindReport({inputs:authored.inputs,revision:authored.documentRevision});
  report.failedPages=archive.manifest.failedPages;
  return save(archive,readReview(archive.reviewBytes),snapshot,report);
}

function correctionSession(archive,snapshot,report) {
  let document=parse(snapshot.source);
  const blocks=()=>getEditableDocument(document).blocks;
  const itemFor=op=>{
    originalReviewTarget(archive.document,op);
    const item=report.items.find(item=>item.self_ref===op.self_ref);
    if(!item)throw new Error("Missing source correspondence");
    return item;
  };
  const targetBlocks=item=>item.targets.map(target=>{
    const block=blocks().find(block=>same(block.path,target.path));
    if(!block)throw new Error("Target path no longer exists");
    return block;
  });
  function validate(op) {
    const item=itemFor(op),targets=targetBlocks(item);
    const fields={text:["type","self_ref","text"],kind:["type","self_ref","kind",...(op.kind==="heading"?["level"]:[])],
      cell:["type","self_ref","cell","text"],exclude:["type","self_ref","excluded"]}[op.type];
    if(!fields || !same(Object.keys(op).sort(),fields.sort()))throw new Error("Invalid correction fields");
    const independent=targets.length===1 && ["paragraph","heading"].includes(targets[0].block) && op.self_ref.startsWith("#/texts/");
    if(op.type==="kind" && !independent)throw new Error(kindReason);
    if(op.type==="kind" && (!["paragraph","heading"].includes(op.kind) || op.kind==="heading" && (!Number.isInteger(op.level)||op.level<1||op.level>6)))throw new Error("Expected paragraph or heading 1–6");
    if(["text","cell"].includes(op.type) && (typeof op.text!=="string" || op.text.length>100000 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(op.text)))throw new Error("Expected Unicode text");
    if(op.type==="text"){
      if(!op.self_ref.startsWith("#/texts/"))throw new Error("Text correction requires an original text item");
      textTarget(item);
    }
    if(op.type==="exclude" && (op.excluded!==true || !targets.length))throw new Error("Exclude existing blocks; restore through Undo");
    if(op.type==="cell" && (!item.cells?.some(cell=>cell.index===op.cell) || !targets.some(block=>block.block==="table")))throw new Error("Cell correspondence unavailable");
    return item;
  }
  function cellPaths(item,op) {
    const cell=item.cells.find(cell=>cell.index===op.cell),table=targetBlocks(item).find(block=>block.block==="table");
    if(!cell||!table)throw new Error("Cell correspondence unavailable");
    return cell.positions.map(position=>[table.path[0],position.row,position.column]);
  }
  function textTarget(item) {
    const targets=targetBlocks(item);
    const block=targets.length===1?targets[0]:targets.find(block=>block.block==="paragraph");
    if(!block || !["paragraph","heading","code","equation","figure","list"].includes(block.block))throw new Error("No editable text correspondence");
    if(block.block==="list" && !Number.isInteger(item.listItem))throw new Error("List item correspondence unavailable");
    return block;
  }
  function textValue(item) {
    const block=textTarget(item);
    if(block.block==="code")return block.code;
    if(block.block==="equation")return block.latex;
    if(block.block==="figure")return block.caption.text;
    if(block.block==="list")return inlineContentText(block.items[item.listItem].content);
    return block.text;
  }
  function value(op) {
    const item=itemFor(op),targets=targetBlocks(item);
    if(op.type==="exclude")return {excluded:item.status==="excluded",blocks:JSON.parse(JSON.stringify(targets,(key,value)=>key==="path"?undefined:value))};
    if(op.type==="kind")return {kind:targets[0]?.block,...(targets[0]?.block==="heading"?{level:targets[0].level}:{})};
    if(op.type==="text")return textValue(item);
    if(op.type==="cell") {
      const values=cellPaths(item,op).map(path=>blocks().find(block=>block.path[0]===path[0]).rows[path[1]].cells[path[2]].text);
      if(!values.length || values.some(text=>text!==values[0]))throw new Error("Source span has different current cell values");
      return values[0];
    }
    throw new Error("Unsupported correction");
  }
  // Delete/restore shift every surviving path. Original items/regions remain as evidence.
  function shift(index,delta,restore=false) {
    const adjust=targets=>targets.flatMap(target=>!restore && target.path[0]===index?[]:[{...target,path:[target.path[0]>=index?target.path[0]+delta:target.path[0],...target.path.slice(1)]}]);
    for(const input of snapshot.inputs)input.targets=adjust(input.targets);
    for(const item of report.items){item.targets=adjust(item.targets);for(const cell of item.cells??[])cell.targets=adjust(cell.targets);}
  }
  function apply(op) {
    const item=validate(op),before=value(op),targets=targetBlocks(item);
    if(op.type==="exclude") {
      const inverse=[];
      for(const block of [...targets].sort((a,b)=>b.path[0]-a.path[0])) {
        const index=block.path[0],bindings={
          inputs:snapshot.inputs.filter(input=>input.targets.some(target=>target.path[0]===index)).map(input=>input.key),
          items:report.items.filter(item=>item.targets.some(target=>target.path[0]===index)).map(item=>({self_ref:item.self_ref,status:item.status,
            cells:(item.cells??[]).filter(cell=>cell.targets.some(target=>target.path[0]===index)).map(cell=>cell.index)})),
        };
        document=removeBlock(document,index);shift(index,-1);
        for(const binding of bindings.items){const mapped=report.items.find(item=>item.self_ref===binding.self_ref);if(!mapped.targets.length)mapped.status="excluded";}
        const nextKeys=snapshot.inputs.filter(input=>input.targets.some(target=>target.path[0]===index)).map(input=>input.key);
        inverse.unshift({operation:op,before,block,bindings,nextKeys});
      }
      return inverse;
    }
    if(op.type==="kind") {
      document=convertBlock(document,targets[0].path,op.kind==="heading"?{block:"heading",level:op.level}:{block:"paragraph"});
      item.label=op.kind==="heading"?"section_header":"text";
    } else if(op.type==="text") {
      const block=textTarget(item),content=op.text?[{kind:"text",text:op.text}]:[];
      if(block.block==="list") {
        const items=structuredClone(block.items);items[item.listItem].content=content;
        document=updateList(document,block.path,{...block,items});
      } else if(block.block==="figure")document=updateFigure(document,block.path,{caption:content});
      else if(block.block==="code")document=updateCodeBlock(document,block.path,{code:op.text});
      else if(block.block==="equation")document=updateEquationLatex(document,block.path,before,op.text);
      else document=before?updateNodeTextAtPath(document,block.path,before,op.text):
        (block.block==="heading"?updateHeadingInlineContent:updateParagraphInlineContent)(document,block.path,content);
    } else for(const path of cellPaths(item,op))document=updateTableCell(document,path,op.text);
    return [{operation:op,before,after:value(op)}];
  }
  function undo(entry) {
    if(!entry.block) {
      if(!same(value(entry.operation),entry.after))throw new Error("Undo expected value conflict");
      const operation={...entry.operation,...(entry.operation.type==="kind"?entry.before:{text:entry.before})};
      if(operation.type==="kind" && operation.kind==="paragraph")delete operation.level;
      apply(operation);return;
    }
    const next=entry.nextKeys.map(key=>snapshot.inputs.find(input=>input.key===key)?.targets[0]?.path[0]).filter(index=>index!==undefined);
    if(entry.nextKeys.length && (!next.length || next.some(index=>index!==next[0])))throw new Error("Undo neighbour conflict");
    const index=next[0]??bodyEndIndex(document),block=entry.block;
    // Restore captured content with existing Core operations. This is not a new insertion correction.
    if(block.block==="paragraph")document=insertParagraph(document,index,block.content);
    else if(block.block==="heading")document=insertHeading(document,index,block.level,block.content);
    else if(block.block==="list")document=insertList(document,index,block);
    else if(block.block==="code")document=insertCodeBlock(document,index,block);
    else if(block.block==="equation")document=insertEquation(document,index,block.latex);
    else if(block.block==="figure")document=insertFigure(document,index,{...block,caption:block.caption.content});
    else if(block.block==="table"){
      document=insertTable(document,index,block.rows.map(row=>row.cells.map(cell=>cell.content)),block.rows[0].cells.map(cell=>cell.align??null));
      if(block.caption)document=updateTableCaption(document,[index],block.caption);
    } else throw new Error("Unsupported removed block");
    if(block.label)document=updateLabel(document,[index],block.label);
    if(block.enumerator!==undefined)document=updateEnumerator(document,[index],block.enumerator);
    if(block.enumerated!==undefined)document=updateEnumeration(document,[index],block.enumerated);
    shift(index,1,true);
    const target={path:[index],documentRevision:snapshot.documentRevision,documentHash:snapshot.documentRevision};
    for(const key of entry.bindings.inputs)snapshot.inputs.find(input=>input.key===key).targets.push(target);
    for(const binding of entry.bindings.items){
      const item=report.items.find(item=>item.self_ref===binding.self_ref);item.targets.push(target);item.status=binding.status;
      for(const cellIndex of binding.cells)item.cells.find(cell=>cell.index===cellIndex).targets.push(target);
    }
  }
  return {validate,value,apply,undo,finish(){
    const source=serialize(document),revision=hash(source),current=getEditableDocument(parse(source)).blocks;
    for(const input of snapshot.inputs)for(const target of input.targets)if(!current.some(block=>same(block.path,target.path)))throw new Error("Canonical write changed target paths");
    const rebind=targets=>targets.sort((a,b)=>a.path[0]-b.path[0]).map(target=>({...target,documentRevision:revision,documentHash:revision}));
    snapshot.source=source;snapshot.documentRevision=revision;
    for(const input of snapshot.inputs)input.targets=rebind(input.targets);
    report.documentRevision=revision;report.documentHash=revision;
    for(const item of report.items){item.targets=rebind(item.targets);for(const cell of item.cells??[])cell.targets=rebind(cell.targets);}
  }};
}

/** Host owns admission, staging validation, receipts and the atomic one-file commit. */
export async function workspaceOperation(input) {
  const raw=await readFile(input.file);
  if(hash(raw)!==input.sourceRevision)throw new Error("Workspace revision changed");
  const archive=readDoclingArchive(raw),state=workspaceState(archive),record=readReview(archive.reviewBytes);
  if(input.mode==="workspace-read")return state;
  if(input.mode==="workspace-material") {
    if(!state.snapshot)throw new Error("Workspace document unavailable");
    if(input.ref){
      const binding=state.snapshot.images.find(image=>image.revision===input.ref);
      if(!binding)throw new Error("Unknown workspace image");
      const image=binding.ref.split("/").slice(1).reduce((value,key)=>value?.[key.replace(/~1/g,"/").replace(/~0/g,"~")],archive.document);
      return {mime:binding.mime,base64:image.uri.slice(image.uri.indexOf(",")+1),revision:binding.revision};
    }
    const pageNo=input.pageNo??record.lastPage??1,image=archive.document.pages[pageNo]?.image;
    if(image?.mimetype!=="image/png")throw new Error("Page image unavailable");
    const bytes=Buffer.from(image.uri.slice(image.uri.indexOf(",")+1),"base64");await writeCandidate(input,bytes);
    const material=comparison(archive,record,metadataOf(archive).correspondence,{...input,result:{revision:state.snapshot.documentRevision}});
    const ref=`page-${pageNo}`;material.pages.find(page=>page.pageNo===pageNo).imageRef=ref;
    material.images=[{ref,path:input.resultFile.path,revision:hash(bytes)}];return material;
  }
  if(input.mode!=="workspace-prepare")throw new Error("Unknown workspace operation");
  if(input.patches)return {rejection:"교정은 문제 묶음 제안과 사람 승인을 사용하세요."};
  if(!state.snapshot||state.cacheState!=="current")throw new Error("Saved document is damaged or uses another contract; never regenerate it from Docling");
  const snapshot=structuredClone(state.snapshot),report=metadataOf(archive).correspondence,session=correctionSession(archive,snapshot,report);
  if(input.change){
    if(input.change.kind==="groups-propose"){
      if(input.change.groups.some(group=>group.sourceRevision!==archive.manifest.document.sha256))throw new Error("Mixed group source revision");
      for(const group of input.change.groups)for(const target of group.targets){
        originalReviewTarget(archive.document,target.locator);
        for(const operation of target.patch.operations)try{session.validate(operation);}catch(error){return {rejection:error.message};}
      }
    }
    if(input.change.kind==="required-checks" && input.change.inventory){
      const inventory=input.change.inventory,sources=["pictures","tables"].flatMap(kind=>(archive.document[kind]??[]).map(item=>({ref:item.self_ref,kind:kind==="pictures"?"picture":"table"})));
      if(sources.length!==inventory.requiredChecks.length||sources.some(source=>inventory.requiredChecks.filter(check=>check.locator.self_ref===source.ref&&check.kind===source.kind).length!==1))throw new Error("Inventory must retain every original picture and table");
      if(inventory.complete&&(inventory.lenses.length!==7||!same([...inventory.pages].sort((a,b)=>a-b),Object.keys(archive.document.pages).map(Number).sort((a,b)=>a-b))||state.items.some(item=>!inventory.targets.includes(item.self_ref))))throw new Error("Incomplete lens/page/item inventory");
    }
    record.ledger=updateReviewLedger(record.ledger,input.change,{
      contentRevision:snapshot.contentRevision,snapshotHash:hash(JSON.stringify(state.snapshot)),current:true,
      requestId:input.requestId,revision:input.revision,at:input.at,
      apply(target){
        const operations=target.patch.operations;
        if(operations.some(op=>op.self_ref!==target.locator.self_ref||op.type==="cell"&&op.cell!==target.locator.cell))throw new Error("Correction outside reviewed locator");
        if(!same(operations.map(session.value),target.patch.expectedBefore)||!same(target.before,target.patch.expectedBefore))throw new Error("Expected before conflict");
        const inverse=[];for(const op of operations)inverse.unshift(...session.apply(op));
        if(!same(operations.map(session.value),target.patch.after))throw new Error("Expected after conflict");return inverse;
      },
      undo(target,inverse){
        if(target.patch.operations.some(op=>op.type==="exclude" && session.value(op).excluded!==true))throw new Error("Undo exclusion conflict");
        for(const entry of inverse)session.undo(entry);
      },
    });
  }
  if(input.progress)setProgress(archive.document,record,input.progress);
  session.finish();
  const changed=snapshot.documentRevision!==state.snapshot.documentRevision;
  if(changed){record.checkedPages=[];record.lastPage=null;record.ledger.approval=null;}
  const bytes=changed?save(archive,record,snapshot,report):rewriteReview(archive,Buffer.from(JSON.stringify(record)));
  await writeCandidate(input,bytes);
  return changed?{snapshot:workspaceState(readDoclingArchive(bytes)).snapshot}:{preserveSnapshot:true};
}
async function writeCandidate(input,bytes){
  if(bytes.length>input.resultFile.maxBytes)throw new Error("Workspace exceeds Host limit");
  await writeFile(input.resultFile.path,bytes,{flag:"r+"});
}
