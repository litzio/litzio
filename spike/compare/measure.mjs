import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import path from'node:path';import{createHash}from'node:crypto';
const live=JSON.parse(readFileSync('spike/compare/live.json')), {root,origin,bundle}=live, f=path.join(root,'measure.json'), records=[];
function read(input){writeFileSync(f,JSON.stringify({bundleRef:bundle.bundleRef,...input}));const t=performance.now();const value=JSON.parse(execFileSync(process.execPath,['packages/cli/dist/cli.mjs','review','read','spike.nist','compare','--input',f,'--root',root,'--host',origin,'--json'],{encoding:'utf8',windowsHide:true,maxBuffer:33554432}));records.push({input,ms:performance.now()-t,state:value.state,receipt:value.receipt,bytes:Buffer.byteLength(JSON.stringify(value))});return value;}
const m=read({kind:'mapping'}).data;
const sources=new Map();for(const e of m.entries)for(const id of e.sourceIds)sources.set(id,[...sources.get(id)||[],...e.targets.map(t=>JSON.stringify(t.path))]);
const multiTargets=[...sources.values()].filter(t=>new Set(t).size>1).length, multiSources=m.entries.filter(e=>e.sourceIds.length>1).length;
const d=JSON.parse(readFileSync(path.join(root,'document.json'))), groups=d.groups.length;
for(const file of ['document.json','result.md']){const name=path.join(root,file),bytes=readFileSync(name);try{writeFileSync(name,Buffer.concat([bytes,Buffer.from('\n')]));read({kind:'snapshot',pageNo:1});}finally{writeFileSync(name,bytes);}read({kind:'bundle'});}
const digest=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
writeFileSync('spike/compare/measurements.json',JSON.stringify({multiTargets,multiSources,groups,records,inputHash:digest('document.json'),resultHash:digest('result.md')},null,2));console.log({multiTargets,multiSources,records:records.map(r=>({ms:r.ms,state:r.state,bytes:r.bytes}))});
