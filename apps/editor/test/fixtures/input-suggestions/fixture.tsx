import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryInputs } from "../../../src/views/QueryInputs.tsx";
import { createHostClient } from "../../../src/host-client.ts";
import { TooltipProvider } from "../../../src/components/ui/tooltip.tsx";
import { Button } from "../../../src/components/ui/button.tsx";
import type { OperationQueryView } from "@litzio/core/views-v2";
import "../../../src/index.css";
import "../../../src/styles.css";
import "../../../src/views/views.css";
const client = createHostClient("");
function Fixture() {
 const [enabled,setEnabled] = useState(false), [args,setArgs] = useState<Record<string, unknown>>({zero:0,flag:false,nullable:null,empty:""});
 const [errors,setErrors] = useState<Record<string,string>>({});
 const view = {sources:{stats:{args}},form:{fields:[{component:"TextInput",field:"person",advanced:true}, ...["note","zero","flag","nullable","empty"].map(field=>({component:field==="flag"?"Checkbox":field==="zero"?"NumberInput":"TextInput",field,advanced:true}))]}} as OperationQueryView;
 return <TooltipProvider><main className="views-page"><h2>예시: 플러그인 입력 후보</h2><Button onClick={()=>setEnabled(true)}>후보 사용</Button><form className="view-query-form" onSubmit={e=>e.preventDefault()}><QueryInputs view={view} schema={{required:["person"],properties:{person:{type:"string",title:"담당자"},note:{type:"string",title:"Note"},zero:{type:"number",title:"Zero"},flag:{type:"boolean",title:"Flag"},nullable:{type:["string","null"],title:"Nullable"},empty:{type:"string",title:"Empty",enum:[""]}}}} client={client} suggestions={enabled ? {person:{operation:"fixture.people.suggest",version:1}}:undefined} errors={errors} change={(field,value,remove)=>{setErrors({});setArgs(old=>{const next={...old};if(remove)delete next[field];else next[field]=value;return next;});}}/></form><Button onClick={()=>setErrors({note:"Check note"})}>Check hidden error</Button><output>{String(args.person ?? "")}</output></main></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
