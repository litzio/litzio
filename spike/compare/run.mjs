import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const {root}=JSON.parse(readFileSync('spike/compare/location.json','utf8')), port=5197, origin=`http://127.0.0.1:${port}`;
const evidence=[], cliFile=path.resolve('packages/cli/dist/cli.mjs');
mkdirSync(path.join(root,'state'),{recursive:true});
const child=spawn(process.execPath,[cliFile,'daemon','run','--channel','development','--port',String(port),'--root',root],{env:{...process.env,LITZIO_DATA_DIR:path.join(root,'state'),LITZIO_DAEMON_DIR:path.join(root,'state'),LITZIO_PLUGINS_SETTINGS_FILE:path.join(root,'state/plugins.json'),LITZIO_ASSISTANT_SETTINGS_FILE:path.join(root,'state/assistant.json')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const cli=args=>{let out;try{out=execFileSync(process.execPath,[cliFile,...args,'--host',origin,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:33554432});}catch(e){out=e.stdout;}const value=JSON.parse(out); evidence.push({args,value});return value;};
try {
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/document')).status)break;}catch{} await new Promise(r=>setTimeout(r,200));}
 const artifact=path.join(root,'artifact');
 cli(['plugins','scaffold',artifact,'--id','spike.nist']);
 const op=(id,effect='read')=>({id,version:1,effect,scope:'host',inputSchema:{type:'object'},outputSchema:{type:'object'}});
 const manifest={schemaVersion:1,id:'spike.nist',tier:'community',publisher:{id:'spike',name:'Spike'},name:'NIST comparison',version:'0.1.0',requiresSdk:'^0.1.0',entry:'host.js',contributes:{operations:['start','status','stop','read','propose','approve','reject','undo','probe'].map(id=>op(id,['start','propose','approve','reject','undo'].includes(id)?'write':'read')),jobs:[{id:'nist',title:'NIST',accept:['.json'],start:'start',status:'status',stop:'stop',resultKind:'native-document'}],reviews:[{id:'compare',title:'NIST comparison',...Object.fromEntries(['read','propose','approve','reject','undo'].map(id=>[id,{operation:'spike.nist.'+id,version:1}]))}]}};
 writeFileSync(path.join(artifact,'litzio-plugin.json'),JSON.stringify(manifest));copyFileSync('spike/compare/host.js',path.join(artifact,'host.js'));
 const validation=cli(['plugins','validate',artifact]); if(!validation.valid && validation.receipt?.outcome!=='success')throw Error(JSON.stringify(validation));
 cli(['plugins','register',artifact]);const p=cli(['plugins','list']).plugins.find(p=>p.id==='spike.nist');cli(['plugins','trust',p.id,'--digest',p.digest]);cli(['plugins','enable',p.id]);
 const probeFile=path.join(root,'probe.json');writeFileSync(probeFile,JSON.stringify({specifiers:['@litzio/core','@litzio/plugin-sdk/schema',new URL('../../apps/editor/server/plugins/reviews.ts',import.meta.url).href]}));cli(['operation','invoke','spike.nist.probe','--input',probeFile]);
 const inputFile=path.join(root,'job.json');writeFileSync(inputFile,JSON.stringify({job:'nist',requestId:randomUUID(),root,file:'document.json',output:'result.md'}));
 const start=cli(['plugins','start','spike.nist','--input',inputFile]);if(!start.job)throw Error(JSON.stringify(start));
 let result;for(let i=0;i<30;i++){result=cli(['plugins','status',start.job.requestId]);if(result.job.state!=='running')break;await new Promise(r=>setTimeout(r,100));}
 if(result.job.state!=='completed')throw Error(JSON.stringify(result));
 const bundle=result.job.result.bundle;writeFileSync('spike/compare/live.json',JSON.stringify({root,origin,bundle,artifact,hostPid:child.pid},null,2));
 for(let pageNo=1;pageNo<=11;pageNo++){const f=path.join(root,'read.json');writeFileSync(f,JSON.stringify({bundleRef:bundle.bundleRef,kind:'snapshot',pageNo}));const x=cli(['review','read','spike.nist','compare','--input',f,'--root',root]); if(!x.snapshot)throw Error(JSON.stringify(x)); evidence.at(-1).value={state:x.state,receipt:x.receipt,pageNo,regions:x.snapshot.page.regions.length,entries:x.snapshot.mapping.entries.length,blocks:x.snapshot.document.blocks.length,imageBytes:x.snapshot.imageUrl.length};}
 writeFileSync('spike/compare/evidence.json',JSON.stringify(evidence,null,2));
 console.log('READY '+origin+' PID '+child.pid);
 await new Promise(resolve=>{process.on('SIGINT',resolve);process.on('SIGTERM',resolve);});
} catch(e){console.error(e);process.exitCode=1;} finally {child.kill(); await new Promise(r=>child.once('exit',r));writeFileSync('spike/compare/host.log',log);writeFileSync('spike/compare/evidence.json',JSON.stringify(evidence,null,2));console.log('OWNED HOST STOPPED');}
