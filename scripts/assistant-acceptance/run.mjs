// Manual acceptance measurement. Never imported by the product or CI.
import fs from 'node:fs';
import { format } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import { DAEMON_PROTOCOL } from '../../apps/editor/shared/daemon-version.ts';
import { once } from 'node:events';
import { tasks } from './tasks.mjs';
const checkout = fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
const openedOnly=args.includes('--opened-only');
const taskIndex=args.indexOf('--task');
const taskId=taskIndex>=0?Number(args[taskIndex+1]):undefined;
const remaining=args.filter((a,i)=>a!=='--opened-only'&&(taskIndex<0||(i!==taskIndex&&i!==taskIndex+1)));
const smoke = process.argv.includes('--smoke');
const continueRun=process.argv.includes('--continue');
const compareIndex=Math.max(process.argv.indexOf('--compare'),process.argv.indexOf('--continue'));
const previous=compareIndex>=0?JSON.parse(fs.readFileSync(process.argv[compareIndex+1],'utf8')):undefined;
if ((previous && (process.argv.length!==4 || smoke || previous.model!=='gpt-6.1-terra')) || (!previous && (remaining.some(a=>a!=='--smoke') || (taskId!==undefined&&!tasks.some(t=>t.id===taskId))))) throw new Error('Usage: pnpm exec tsx scripts/assistant-acceptance/run.mjs [--smoke | --continue results.json | --compare results.json | --task <id>] [--opened-only]');
const cliEntry=path.join(checkout,'packages/cli/dist/cli.mjs');
const buildHelp='Run pnpm --filter @litzio/cli build before acceptance measurement.';
if(!fs.existsSync(cliEntry)||!fs.existsSync(path.join(checkout,'packages/cli/dist/editor/index.html')))throw new Error('Built CLI/Host missing. '+buildHelp);
const inputs=spawnSync('git',['ls-files','-z','--cached','--others','--exclude-standard','packages','apps','plugins','community-plugins','scripts','brand.ts','pnpm-lock.yaml','package.json'],{cwd:checkout,encoding:'utf8'});
if(inputs.status!==0)throw new Error('Cannot verify build freshness. '+buildHelp);
const builtAt=fs.statSync(cliEntry).mtimeMs;
for(const input of inputs.stdout.split('\0').filter(Boolean)) {
 if(input.startsWith('scripts/assistant-acceptance/'))continue;
 const file=path.join(checkout,input);
 if(fs.existsSync(file)&&fs.statSync(file).isFile()&&fs.statSync(file).mtimeMs>builtAt)
  throw new Error('Built CLI/Host is stale: '+input+'. '+buildHelp);
}
const root = previous?.root ?? fs.mkdtempSync(path.join(os.tmpdir(),'litzio-acceptance-'));
const profile=path.join(root,'profile'), cwd=path.join(root,'assistant');
fs.mkdirSync(profile,{recursive:true}); fs.mkdirSync(cwd,{recursive:true});
// Override every Host settings escape hatch; retain CODEX_HOME and provider login.
for (const key of Object.keys(process.env)) if (/^LITZIO_.*_SETTINGS_FILE$/.test(key)) delete process.env[key];
process.env.LITZIO_DATA_DIR=profile; process.env.LITZIO_ASSISTANT_CWD=cwd;
const model=smoke?'gpt-6-luna':'gpt-6.1-terra', reasoningEffort=smoke?'low':'high';
fs.writeFileSync(path.join(profile,'assistant.json'),JSON.stringify({provider:'codex',permissionMode:'opened-folders',model,reasoningEffort,responseLanguage:'ko'}));
const hostLog=[];
const consoleOriginal={warn:console.warn,error:console.error};
for(const key of ['warn','error']) console[key]=(...args)=>{hostLog.push(format(...args));if(hostLog.length>40)hostLog.shift();consoleOriginal[key](...args);};
const errorDetail=e=>({name:e?.name,message:e?.message??String(e),code:e?.code,stack:e?.stack,cause:e?.cause?errorDetail(e.cause):undefined});
// Use the existing packaged daemon entry and its build-marker CLI selection.
const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const child=spawn(process.execPath,[cliEntry,'daemon','run','--root',root,'--port',String(port)],{cwd:checkout,env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
const exited=once(child,'exit');
let startup='';child.stdout.on('data',data=>{startup+=data;});child.stderr.on('data',data=>{hostLog.push(String(data));if(hostLog.length>40)hostLog.shift();});
const host={url:`http://127.0.0.1:${port}`,async close(){
 const health=await fetch(this.url+'/daemon/health',{headers:{'x-litzio-protocol':DAEMON_PROTOCOL},signal:AbortSignal.timeout(30_000)}).then(r=>r.json());
 if(health.pid!==child.pid)throw new Error('Owned Host identity mismatch; refusing shutdown');
 const response=await fetch(this.url+'/daemon/stop',{method:'POST',headers:{'Content-Type':'application/json',Origin:this.url,'x-litzio-protocol':DAEMON_PROTOCOL},body:JSON.stringify({...health,confirm:true}),signal:AbortSignal.timeout(30_000)});
 if(!response.ok)throw new Error('Owned Host shutdown rejected');
 await Promise.race([exited,delay(30_000,undefined,{ref:false}).then(()=>{throw new Error('Owned Host did not exit');})]);
}};
try {
 for(let n=0;!startup.includes('HTTP:');n++){
  if(child.exitCode!==null||child.signalCode!==null||n===60)throw new Error('Built Host startup failed: '+hostLog.join(''));
  await delay(500);
 }
}catch(error){if(child.exitCode===null)child.kill();throw error;}
const report=previous??{model,reasoningEffort,startedAt:new Date().toISOString(),pid:process.pid,root,url:host.url,aiCalls:0,results:[],limits:'One attempt per task/mode, 600 seconds, no approval answers; max 22 sends per full run; smoke max 1 send.'};
if(previous){report.pid=process.pid;report.url=host.url;delete report.closedAt;delete report.error;}
const scrub=s=>String(s).split(root).join('<run>').split(checkout).join('<checkout>').replaceAll(os.homedir(),'<home>');
const api=async (method,suffix='',body)=>{const res=await fetch(host.url+'/api/assistant/conversations'+suffix,{method,headers:{Origin:host.url,Connection:'close','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});const value=await res.json(); if(!res.ok)throw new Error(JSON.stringify(value));return value;};
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);
const inventory=dir=>Object.fromEntries(walk(dir).map(f=>[path.relative(dir,f).replaceAll('\\','/'),fs.readFileSync(f).toString('base64')]));
const check=file=>{const p=spawnSync(process.execPath,[cliEntry,'check',file,'--format','json'],{cwd:checkout,encoding:'utf8',timeout:30_000,windowsHide:true});return {file:path.basename(file),passed:p.status===0,detail:scrub(p.stdout+p.stderr)};};
const classify=(s,approval)=>approval||/sandbox|forbidden|permission denied|access.*denied|CreateProcessAsUserW|EPERM|읽기 전용|권한.*변경/i.test(s)?'권한·샌드박스':/not recognized|not found|No module named|CommandNotFound/i.test(s)?'환경에 프로그램 없음':/도구.*없|tool.*unavailable/i.test(s)?'도구 없음':/지침.*때문|instruction.*prohibit/i.test(s)?'지침 때문에 하지 않음':'기타';
function documentWrites(tools) {
 return [...new Set(tools.flatMap(i=>
  i.work?.kind==='edit'&&/\.md\b/i.test(i.text)?['공급자 파일 편집']:
  /create_document/.test(i.text)?['전용 Host 생성']:
  i.work?.kind==='execute'&&/\.md\b/i.test(i.text)&&/Set-Content|Add-Content|WriteAllText|Out-File|write_text|write_bytes|writeFile|write\(|apply_patch|litzio.*(?:create|insert|update|batch)/i.test(i.text)?['셸(명령·결과 대조 필요)']:[]))];
}
function save(){fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(report,null,2));const clean=s=>scrub(s??'').replaceAll('|',' / ').replaceAll('\n',' ').slice(0,600);fs.writeFileSync(path.join(root,'results.md'),`# 비서 수락 시험\n\n${model} / ${reasoningEffort}; 실제 AI 호출 ${report.aiCalls}(전송 시도 상한; 턴 확인 ${report.results.filter(r=>r.admitted).length}). 합성 자료, 과제당 1회, 이 PC, Copilot 미확인. 객관적 predicate 통과이며 문장 품질 판정이 아니다.\n\n| 과제 | 권한 | 결과 | 초 | Host/편집/셸 | 문서 쓰기 관측 | 변경 항목 | 원인 | 중단·마지막 답변 | 부산물 |\n| --- | --- | --- | ---: | --- | --- | ---: | --- | --- | --- |\n`+report.results.map(r=>`| ${r.id}. ${r.name} | ${r.permissionMode} | ${r.result} | ${r.seconds} | ${r.counts.host}/${r.counts.edit}/${r.counts.shell} | ${clean((r.documentWriteMethods??[]).join(', ')||'쓰기 관측 없음')} | ${r.fileChangeItems} | ${r.cause} | ${clean(r.stop+' '+r.lastAnswer)} | ${clean(r.byproducts.join(', '))} |`).join('\n')+'\n');}
async function run(task,permissionMode){
 const folder=path.join(root,`${task.id}-${permissionMode}`);fs.mkdirSync(folder);task.prepare(folder);const before=inventory(folder);
 const r={id:task.id,name:task.name,permissionMode,folder:path.basename(folder),message:task.message,result:'판정 불가',counts:{host:0,edit:0,shell:0},fileChangeItems:0,writeEvidence:[],approval:false,approvalRequests:0,cause:'',stop:'',lastAnswer:'',byproducts:[],checks:[]};report.results.push(r);save();
 let conversation;const start=Date.now(),submissionId=crypto.randomUUID();
 try {
  if(report.aiCalls>= (smoke?1:22))throw new Error('AI call budget exhausted');report.aiCalls++;save();
  // Submission receipt avoids an HTTP timeout hiding admission; never replay a send.
  try { conversation=(await api('POST','',{action:'send',submissionId,provider:'codex',permissionMode,model,reasoningEffort,folders:[folder],message:task.message})).conversation; } catch(error) { r.transportError=scrub(JSON.stringify(errorDetail(error))); r.hostLogTail=hostLog.map(scrub); const receipt=await api('GET','?submissionId='+submissionId); conversation=receipt.conversation; if(receipt.submission?.status==='unknown'&&!conversation)throw error; }
  while(Date.now()-start<600_000){
   const submission=await api('GET','?submissionId='+submissionId);
   if(submission.submission?.status==='rejected')throw new Error(JSON.stringify(submission));
   if(submission.conversation)conversation=submission.conversation;
   if(conversation?.id)conversation=await api('GET','?id='+encodeURIComponent(conversation.id));
   const turn=conversation?.turns.at(-1);
   if(turn?.items.some(i=>i.question?.approval&&i.question.status==='pending')){r.approval=true;r.stop='승인 대기에서 멈춤';break;}
   if(turn&&turn.status!=='inProgress'){r.stop=turn.status;break;}
   await delay(1000);
  }
  if(!r.stop)r.stop='시간 초과';
 }catch(e){r.stop=scrub(e.message);r.errorDetail=scrub(JSON.stringify(errorDetail(e)));r.hostLogTail=hostLog.map(scrub);}
 finally {
  r.seconds=+( (Date.now()-start)/1000).toFixed(1);
  // Capture before interrupt expires approval metadata.
  const items=conversation?.turns.flatMap(t=>t.items)??[];
  r.approvalRequests=items.filter(i=>i.question?.approval).length;
  r.conversation=scrub(JSON.stringify(conversation??null));r.admitted=!!conversation?.turns.length;
  r.lastAnswer=items.filter(i=>i.kind==='assistant').map(i=>i.text).join('\n').slice(-3000);
  r.tools=items.filter(i=>i.kind==='tool').map(i=>({id:i.id,text:scrub(i.text),status:i.status,work:i.work?{...i.work,detail:scrub(i.work.detail??'')}:undefined,result:i.toolResult}));
  for(const i of r.tools){const kind=i.work?.kind==='execute'?'shell':i.work?.kind==='edit'?'edit':'host';r.counts[kind]++;}
  r.documentWriteMethods=documentWrites(r.tools);
  r.fileChangeItems=items.filter(i=>i.fileChanges?.length).length;
  r.fileChanges=items.flatMap(i=>i.fileChanges??[]).map(f=>scrub(f));
  r.writeEvidence=r.tools.filter(i=>i.work?.kind==='edit'||i.work?.kind==='execute'||/create_document|import_document_image/.test(i.text)).map(i=>`${i.work?.kind??'host'}: ${i.text}`);
  if(conversation?.turns.some(t=>t.status==='inProgress')){await api('POST','',{action:'interrupt',id:conversation.id});for(let n=0;n<30;n++){const c=await api('GET','?id='+encodeURIComponent(conversation.id));if(!c.turns.some(t=>t.status==='inProgress'))break;await delay(1000);if(n===29)throw new Error('Interrupt did not settle; stop measurement');}}
  const after=inventory(folder);r.byproducts=Object.keys(after).filter(f=>!(f in before)&&!(task.outputs??[task.output]).includes(f));r.changed=Object.keys(after).filter(f=>before[f]!==after[f]);r.deleted=Object.keys(before).filter(f=>!(f in after));
  r.checks=(task.outputs??[task.output]).map(f=>check(path.join(folder,f)));
  try{r.predicate=task.judge(folder);r.result=!r.admitted?'판정 불가':r.checks.every(c=>c.passed)&&r.predicate?'완수':'미완수';}catch(e){r.result='판정 불가';r.stop+=' '+e.message;}
  if(r.result!=='완수')r.cause=r.result==='판정 불가'?(r.admitted?'판정 기준 문제':'기타'):classify(JSON.stringify(r.tools.filter(t=>t.status==='failed'))+' '+r.lastAnswer+' '+r.stop,r.approval);
  if(r.result==='미완수'&&task.output&&!fs.existsSync(path.join(folder,task.output))){r.alternativeOutputs=walk(folder).filter(f=>path.basename(f)===task.output).map(f=>({file:path.relative(folder,f),check:check(f)}));if(r.alternativeOutputs.length){r.result='판정 불가';r.cause='판정 기준 문제';}}
  r.lastAnswer=scrub(r.lastAnswer);save();console.log(`${r.id} ${permissionMode}: ${r.result}, ${r.seconds}s, ${r.cause}`);
 }
 if(/usage.limit|rate.limit|capacity.*(error|exceed|unavailable)|quota.*(exceed|exhaust)|usage_limit/i.test(r.stop+' '+r.lastAnswer+' '+JSON.stringify(r.tools.filter(t=>t.status==='failed'))))throw new Error('Provider capacity/usage error; stopping without provider change');
}
console.log('Output: '+root+'; PID: '+process.pid);
try {
 if (previous) {
  for (const r of report.results) {
   const task=tasks.find(t=>t.id===r.id);
   r.documentWriteMethods=documentWrites(r.tools);
   r.admitted=JSON.parse(r.conversation??'null')?.turns?.length>0;
   r.predicate=task.judge(path.join(root,r.folder));
   r.result=!r.admitted?'판정 불가':r.checks.every(c=>c.passed)&&r.predicate?'완수':'미완수';
   r.cause=r.result==='완수'?'':classify(JSON.stringify(r.tools.filter(t=>t.status==='failed'))+' '+r.lastAnswer+' '+r.stop,r.approval);
   if (r.result==='미완수'&&task.output&&!fs.existsSync(path.join(root,r.folder,task.output))) {
    r.alternativeOutputs=walk(path.join(root,r.folder)).filter(f=>path.basename(f)===task.output)
     .map(f=>({file:path.relative(path.join(root,r.folder),f),check:check(f)}));
    if(r.alternativeOutputs.length){r.result='판정 불가';r.cause='판정 기준 문제';}
   }
  }
  save();
  if (continueRun) {
   for (const task of tasks.filter(t=>!report.results.some(r=>r.id===t.id&&r.permissionMode==='opened-folders')))
    await run(task,'opened-folders');
  }
 } else {
  for (const task of (smoke?tasks.slice(0,1):taskId?tasks.filter(t=>t.id===taskId):tasks)) await run(task,'opened-folders');
 }
 if (!smoke && !openedOnly) {
  for (const r of [...report.results]) {
   if (r.permissionMode==='opened-folders'&&r.result==='미완수'&&r.cause==='권한·샌드박스'
    &&!report.results.some(c=>c.id===r.id&&c.permissionMode==='full-access'))
    await run(tasks.find(t=>t.id===r.id),'full-access');
  }
 }
} catch(e) {
 report.error=scrub(e.message);process.exitCode=1;
} finally {
 await host.close();
 for(const key of ['warn','error'])console[key]=consoleOriginal[key];
 report.closedAt=new Date().toISOString();save();console.log('Host closed; output: '+root);
 console.log(['완수','미완수','판정 불가'].map(result=>`${result}: ${report.results.filter(r=>r.result===result).length}`).join(' / '));
 console.table(report.results.map(r=>({과제:r.id,결과:r.result,초:r.seconds,쓰기:r.documentWriteMethods.join(', ')||'없음',승인요청:r.approvalRequests??Number(r.approval)})));
}
