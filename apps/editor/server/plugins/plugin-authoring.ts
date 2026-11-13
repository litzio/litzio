import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {accessPath,canonicalFilePath,LOCAL_FILE_ACCESS,type FileAccess} from "../file-access.ts";
import {validateManifest} from "@litzio/plugin-sdk";
import {authoringTemplate} from "./authoring-templates.ts";
export function scaffoldPlugin(directory:string,id:string,access:FileAccess=LOCAL_FILE_ACCESS,creationScope:FileAccess=LOCAL_FILE_ACCESS,template:"greet"|"screen"|"chart"="greet",expectedDirectory?:string){
 if(!["greet","screen","chart"].includes(template))throw new Error("Unknown plugin template");
 const example=template==="greet"?undefined:authoringTemplate(id,template);
 const card={id,name:example?"측정값":"인사말 예제",icon:example?"ChartColumn":"LayoutDashboard",entry:"host.mjs",screen:"screen.jsx",operations:example?[]:[{id:"greet",assistant:true,inputSchema:{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false},outputSchema:{type:"object",properties:{greeting:{type:"string"}},required:["greeting"],additionalProperties:false}}]};
 validateManifest(card);
  if (!path.isAbsolute(directory)) throw new Error("Use an absolute directory on the target Host");
  // Require a new directory; no pre-existing files are ever overwritten.
  directory = accessPath(accessPath(directory, access, true), creationScope, true);
  const expected = expectedDirectory ?? path.join(canonicalFilePath(path.dirname(directory)), path.basename(directory));
  const checkDirectory = () => {
    if (path.relative(expected, canonicalFilePath(directory)) !== "") throw new Error("Plugin scaffold directory changed; inspect created files before retrying");
  };
  mkdirSync(directory);
  checkDirectory();

 const files:Record<string,string>={"litzio-plugin.json":JSON.stringify(card,null,2)+"\n","host.mjs":example?.source??`import {SDK_VERSION} from '@litzio/plugin-sdk';
export function activate(context){return {operations:{greet:({name})=>({greeting:"Hello, "+name+"!"})},status:()=>({available:true,message:"Ready (SDK "+SDK_VERSION+")"}),dispose(){}}}
`,"screen.jsx":example?.screen??`export default function Screen({ui}){return <ui.Notice>Ready</ui.Notice>}`};
 for(const [name,content]of Object.entries(files)){writeFileSync(path.join(directory,name),content,{flag:"wx"});checkDirectory();}
 return {id,directory,files:Object.keys(files)};
}
