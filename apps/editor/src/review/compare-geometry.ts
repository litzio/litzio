import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ReadingPosition } from "../document-reading.ts";
import { regionKinds, type ReviewKind } from "./review-kinds.ts";
import type { ReviewSnapshot } from "./ReviewRenderer.tsx";

// Monotone correspondence anchors, as in the archived comparison. Reordered or
// duplicate targets cannot make scrolling reverse direction.
export function scrollAnchors(points:[number,number][]):[number,number][] {
  const result:[number,number][]=[];
  for (const point of points.sort((a,b)=>a[0]-b[0] || a[1]-b[1])) {
    const last=result.at(-1); if (!last || point[0]>last[0] && point[1]>last[1]) result.push(point);
  }
  return result;
}
export function scrollPosition(points:[number,number][],value:number,reverse=false):number {
  if (!points.length) return value;
  const from=reverse?1:0,to=reverse?0:1,index=points.findIndex(point=>point[from]>=value);
  if (!index) return Math.max(0,points[0]![to]+value-points[0]![from]);
  if (index<0) {const last=points.at(-1)!;return last[to]+value-last[from];}
  const a=points[index-1]!,b=points[index]!;
  return a[to]+(value-a[from])/(b[from]-a[from])*(b[to]-a[to]);
}
/** All endpoints use the same measured coordinates as reading highlights and PNG regions. */
type Wire = {key:string;d:string;kind:ReviewKind;selected:boolean;paperEdge:number};
export function useCompareGeometry(host:RefObject<HTMLDivElement|null>,content:RefObject<HTMLDivElement|null>,s:ReviewSnapshot,positions:ReadingPosition,sources:string[],targets:string[],valid:boolean,sync:boolean,zoom:number | "fit") {
  const [wires,setWires]=useState<Wire[]>([]);
  const suppression = useRef(new Map<HTMLElement,number>());
  useLayoutEffect(()=>{
    const root=host.current,reading=content.current;
    const left=root?.querySelector<HTMLElement>(".review-page-scroll"),right=root?.querySelector<HTMLElement>(".review-read");
    if (!root || !reading || !left || !right) return;
    let frame=0;
    const suppressed=suppression.current, kinds=regionKinds(s);
    const blocks=new Map(positions.blocks.map(block=>[block.key,block]));
    const pages=s.pages??(s.page?[s.page]:[]);
    const regions=new Map(pages.flatMap(page=>page.regions.map(region=>[region.id,{page,region}] as const)));
    const sheets=new Map(pages.map(page=>[page.pageNo,left.querySelector<HTMLElement>(`[data-page-no="${page.pageNo}"] .review-page`) ?? (!s.pages ? left.querySelector<HTMLElement>(".review-page"):null)]));
    const headingKeys=new Set(s.document.blocks.filter(block=>block.block === "heading").map(block=>JSON.stringify(block.path)));
    let anchors:[number,number][] | undefined;
    const geometry=()=>{
      const hr=root.getBoundingClientRect(),lr=left.getBoundingClientRect(),rr=right.getBoundingClientRect(),cr=reading.getBoundingClientRect();
      const measuringAnchors=!anchors, rectangles=new Map<number,DOMRect>();
      const points:[number,number][]=[[0,0]],lines=new Map<string,Wire>();
      if (valid) for (const entry of s.mapping?.entries??[]) for (const id of entry.sourceIds) {
        const source=regions.get(id); if (!source) continue;
        const sheet=sheets.get(source.page.pageNo); if (!sheet) continue;
        let pr=rectangles.get(source.page.pageNo);
        if (!pr) {pr=sheet.getBoundingClientRect();rectangles.set(source.page.pageNo,pr);}
        if (!measuringAnchors && (pr.bottom<lr.top || pr.top>lr.bottom)) continue;
        const [x1,y1,x2,y2]=source.region.bbox;
        const sy=pr.top+(source.page.origin==="TOPLEFT" ? (y1+y2)/2:source.page.height-(y1+y2)/2)/source.page.height*pr.height;
        for (const target of entry.targets) {
          const key=JSON.stringify(target.path),block=blocks.get(key); if (!block) continue;
          const ty=cr.top+block.top+Math.min(block.height/2,24);
          if (measuringAnchors) points.push([sy-lr.top+left.scrollTop,ty-rr.top+right.scrollTop]);
          if (!sheet.querySelector<HTMLImageElement>("img")?.complete || sy<lr.top || sy>lr.bottom || ty<rr.top || ty>rr.bottom) continue;
          const sx=pr.left+x2/source.page.width*pr.width,tx=cr.left+block.left;
          if (sx<lr.left || sx>lr.right || tx<rr.left || tx>rr.right) continue;
          const x=sx-hr.left,y=sy-hr.top,endX=tx-hr.left;
          // Use the first-line edge toward the source for headings. This clears the
          // depth cue without sending a wire above the gutter and back down again.
          const targetY=headingKeys.has(key) ? sy>=ty ? Math.min(rr.bottom,ty+Math.min(block.height/2,24)) : Math.max(rr.top,cr.top+block.top) : ty;
          const endY=targetY-hr.top,edge=lr.right-hr.left,bend=Math.min(32,Math.max(0,(endX-edge)/2));
          lines.set(`${id}:${key}`,{key:`${id}:${key}`,paperEdge:Math.min(pr.right,lr.right)-hr.left,kind:kinds.get(id) ?? "unmapped",selected:sources.includes(id) && targets.includes(key),d:`M${x},${y} L${edge},${y} C${edge+bend},${y} ${endX-bend},${endY} ${endX},${endY}`});
        }
      }
      if (measuringAnchors) {points.push([left.scrollHeight,right.scrollHeight]);anchors=scrollAnchors(points);}
      return {points:anchors!,lines:[...lines.values()].sort((a,b)=>Number(a.selected)-Number(b.selected))};
    };
    const refresh=()=>{frame=0;setWires(geometry().lines);};
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(refresh);};
    const scroll=(event:Event)=>{
      const from=event.target as HTMLElement;
      if (from!==left && from!==right) {schedule();return;}
      const expected=suppressed.get(from); suppressed.delete(from);
      if (sync && valid && !(expected!==undefined && Math.abs(from.scrollTop-expected)<1)) {
        const to=from===left?right:left;
        const center=from.clientHeight*.35;
        const position=scrollPosition(anchors ?? geometry().points,from.scrollTop+center,from===right)-to.clientHeight*.35;
        to.scrollTop=Math.max(0,position);suppressed.set(to,to.scrollTop);
      }
      schedule();
    };
    root.addEventListener("scroll",scroll,true);
    const invalidate=()=>{anchors=undefined;schedule();};
    const observer=new ResizeObserver(invalidate);for (const element of [root,left,right,reading]) observer.observe(element);
    if (left.firstElementChild) observer.observe(left.firstElementChild);
    root.addEventListener("load",invalidate,true);schedule();
    return ()=>{root.removeEventListener("scroll",scroll,true);root.removeEventListener("load",invalidate,true);observer.disconnect();cancelAnimationFrame(frame);};
  },[host,content,s,positions,sources,targets,valid,sync,zoom]);
  return wires;
}
