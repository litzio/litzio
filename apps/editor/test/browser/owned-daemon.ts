import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import path from "node:path";
import { expect } from "@playwright/test";
import { DAEMON_PROTOCOL, type DaemonIdentity } from "../../server/daemon-protocol.ts";
import { REPOSITORY_ROOT } from "./fixtures.ts";

/** The existing production CLI lifecycle, with request-owned paths and PID/instance-bound shutdown. */
export async function startOwnedDaemon(data:string,roots:string[],requestedPort?:number) {
  let port=requestedPort;
  if(port===undefined){
    const reservation=createServer();reservation.listen(0,"127.0.0.1");await once(reservation,"listening");
    port=(reservation.address() as {port:number}).port;
    await new Promise<void>((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));
  }
  const url=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(REPOSITORY_ROOT,"packages/cli/dist/cli.mjs"),"daemon","run","--channel","development","--port",String(port),...roots.flatMap(root=>["--root",root])],{
    windowsHide:true,stdio:["ignore","pipe","pipe","ipc"],
    env:{...process.env,LITZIO_DAEMON_DIR:path.join(data,"daemon"),LITZIO_DATA_DIR:data,LITZIO_PLUGINS_SETTINGS_FILE:path.join(data,"plugins.json"),LITZIO_ASSISTANT_CWD:path.join(data,"assistant"),LITZIO_ASSISTANT_SETTINGS_FILE:path.join(data,"ai.json"),LITZIO_DESKTOP_DAEMON:"0"},
  });
  let diagnostics="";child.stdout!.on("data",value=>{diagnostics+=value;});child.stderr!.on("data",value=>{diagnostics+=value;});
  const exited=new Promise<void>(resolve=>child.once("close",()=>resolve()));
  let identity:DaemonIdentity;
  try {
    identity=await new Promise<DaemonIdentity>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Owned daemon startup not confirmed: ${diagnostics}`)),15_000);
      child.once("message",message=>{clearTimeout(timer);resolve((message as {identity:DaemonIdentity}).identity);});
      child.once("error",error=>{clearTimeout(timer);reject(error);});
      child.once("exit",code=>{clearTimeout(timer);reject(new Error(`Owned daemon exited ${code}: ${diagnostics}`));});
    });
  } catch(error){child.kill();await exited;throw error;}
  let closing:Promise<void>|undefined;
  return {url,child,identity,exited,close:()=>closing??=(async()=>{
    if(child.exitCode!==null){await exited;return;}
    const response=await fetch(url+"/daemon/stop",{method:"POST",signal:AbortSignal.timeout(15_000),headers:{Origin:url,"Content-Type":"application/json","X-Litzio-Protocol":DAEMON_PROTOCOL},body:JSON.stringify({...identity,confirm:true})});
    expect(response.status).toBe(200);await response.json();
    await expect.poll(()=>child.exitCode,{timeout:15_000,message:"Owned daemon must finish shutdown"}).not.toBeNull();await exited;
  })()};
}
