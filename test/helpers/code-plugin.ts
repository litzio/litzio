import {existsSync,writeFileSync} from "node:fs";
import path from "node:path";
/** A minimal renderable screen for Host lifecycle fixtures; existing test screens are preserved. */
export function writeCodePluginManifest(directory:string,manifest:any){
 const screen=path.join(directory,manifest.screen??"screen.jsx");
 if(!existsSync(screen))writeFileSync(screen,"export default function Screen(){return null}",{flag:"wx"});
 writeFileSync(path.join(directory,"litzio-plugin.json"),JSON.stringify(manifest));
}
