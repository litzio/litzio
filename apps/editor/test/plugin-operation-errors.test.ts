import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PluginPublicError, compileSchema } from '@litzio/plugin-sdk';
import { publicOperationError, publicInputIssues } from '../server/plugins/operation-result.ts';
import { createPluginService } from '../server/plugin-service.ts';
import { handleDocumentRequest } from '../server/document-api.ts';
import { assistantToolValue } from '../server/assistant-tool-results.ts';
import { executePluginOperationTool } from '../server/assistant-plugin-tools.ts';
import { DAEMON_PROTOCOL } from '../shared/daemon-version.ts';

const generic = 'Plugin operation failed. Check plugin settings and the target.';
test('public failure bounds, secret masking and value-free schema diagnostics', () => {
  const secret = 'synthetic-private-token';
  const safe = publicOperationError(new PluginPublicError('invalid_group', secret + '\n\u202e' + 'x'.repeat(1100)), 'write', [secret]);
  assert.equal(safe.code, 'invalid_group'); assert.equal(Array.from(safe.message!).length, 1024);
  assert.ok(safe.message!.startsWith('[secret]')); assert.ok(!/[\p{Cc}\p{Cf}]/u.test(safe.message!));
  assert.equal(publicOperationError(new Error(secret), 'read').error, generic);
  for (const error of [new PluginPublicError('bad code', 'Safe'), new PluginPublicError('valid', '\n'), new PluginPublicError(secret, 'Safe')])
    assert.equal(publicOperationError(error, 'read', [secret]).error, generic);
  const schema = {type:'object',properties:{id:{type:'string'},mode:{enum:['one','two']},nested:{type:'object',additionalProperties:{type:'integer'}}},required:['id'],additionalProperties:false};
  const validate = compileSchema(schema);
  assert.equal(validate({mode:secret,nested:{[secret]:secret},[secret]:secret}),false);
  const issues = publicInputIssues(validate.errors,schema,[]);
  assert.ok(issues.some(i=>i.path==='/id' && /missing/.test(i.reason)));
  assert.ok(issues.some(i=>i.path==='/mode' && /allowed/.test(i.reason)));
  assert.ok(!JSON.stringify(issues).includes(secret));
  const referenced = {type:'object',definitions:{fields:{type:'object',properties:{groupId:{type:'string'}},required:['groupId']}},allOf:[{$ref:'#/definitions/fields'}]};
  const referenceValidator=compileSchema(referenced);referenceValidator({groupId:123});
  assert.equal(publicInputIssues(referenceValidator.errors,referenced,[])[0].path,'/groupId');
  const fields=Array.from({length:12},(_,i)=>'field'+i);
  const many = compileSchema({type:'object',properties:Object.fromEntries(fields.map(k=>[k,{}])),required:fields}); many({});
  assert.equal(publicInputIssues(many.errors,{},[]).length,8);
});

test('scaffolded isolated plugin publishes failures through process, HTTP, CLI and assistant', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(),'litzio-public-errors-'));
  const keys = ['LITZIO_DATA_DIR','LITZIO_ASSISTANT_CWD','LITZIO_ASSISTANT_SETTINGS_FILE','LITZIO_DAEMON_DIR','LITZIO_PLUGINS_SETTINGS_FILE'];
  const previous=keys.map(key=>process.env[key]);
  for(const key of keys) process.env[key]=path.join(root,key.endsWith('FILE')?key+'.json':key);
  t.after(()=>keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}));
  const secret = 'registered-synthetic-secret';
  const service = createPluginService(undefined,path.join(root,'plugins.json'),path.join(root,'assistant'));
  // Registered secret store fixture: no user credentials and no AI provider.
  (service.host as any).secrets = {supported:true,async read(){return secret},async status(){return true},async set(){},async delete(){}};
  const server = createServer((req,res)=> {
    if(req.url==='/daemon/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocolVersion:DAEMON_PROTOCOL}));return;}
    void handleDocumentRequest(req,res,()=>{res.statusCode=404;res.end();},undefined,Infinity,undefined,undefined,{plugins:service} as any);
  });
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await service.close();});
  await service.start();
  const directory = path.join(root,'artifact');
  await service.host.invoke('scaffold',{directory,id:'fixture.public-errors'});
  const manifestFile=path.join(directory,'litzio-plugin.json');
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
  manifest.secrets=[{id:'token',title:'Token',scope:'connection',required:true}];
  manifest.operations=[{id:'check',effect:'read',assistant:true,inputSchema:{type:'object',properties:{mode:{type:'string'}},required:['mode'],additionalProperties:false},outputSchema:{type:'string'}},{id:'write',effect:'write',inputSchema:{},outputSchema:{}}];
  writeFileSync(manifestFile,JSON.stringify(manifest));
  writeFileSync(path.join(directory,'host.mjs'),`import {PluginPublicError} from '@litzio/plugin-sdk';export function activate(c){return {operations:{check:({mode})=>{if(mode==='secret')throw new PluginPublicError('safe_code',c.secrets.token);if(mode==='public')throw new PluginPublicError('invalid_group','Use a group ID from list-groups.');if(mode==='raw')throw new Error('internal-path stack-private');if(mode==='output')return 42;return 'ok'},write:()=>{throw new PluginPublicError('invalid_group','Check group ID.')}},status:()=>({available:true,message:'Ready'}),dispose(){}}}`);
  await service.host.invoke('register',{directory});
  const record=(await service.host.list())[0]!;
  await service.host.invoke('trust',{id:record.id,registrationId:record.registrationId});await service.host.invoke('enable',{id:record.id});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const invoke=async(input:unknown,action='invoke')=>{
    const response=await fetch(origin+'/api/plugins',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({action,plugin:record.id,operation:record.id+'.check',input})});
    assert.equal(response.status,200);return response.json();
  };
  for(const action of ['invoke','screen-invoke']){
    const result=await invoke({mode:'public'},action);assert.equal(result.code,'invalid_group');assert.equal(result.message,result.error);assert.equal(result.receipt.outcome,'failure');assert.equal(result.receipt.operation,record.id+'.check');
    for(const mode of ['raw','output']) {const masked=await invoke({mode},action);assert.equal(masked.error,generic);assert.ok(!JSON.stringify(masked).includes('private'));}
    const invalid=await invoke({mode:123,extra:'input-private'},action);assert.equal(invalid.errorKind,'invalid_input');assert.equal(invalid.receipt.outcome,'refused');assert.ok(invalid.inputIssues.some((i:any)=>i.path==='/mode'));assert.ok(!JSON.stringify(invalid).includes('input-private'));
  }
  const maskedSecret=await invoke({mode:'secret'});assert.equal(maskedSecret.message,'[secret]');assert.ok(!JSON.stringify(maskedSecret).includes(secret));
  const assistant=await executePluginOperationTool(service.host,{operation:record.id+'.check',input:{mode:'public'}},{} as any);
  assert.equal('code' in assistant && assistant.code,'invalid_group');assert.equal(assistant.activity.outcome,'failure');
  const published=assistantToolValue(assistant,{tool:'invoke_plugin_operation',arguments:{}} as any);
  assert.equal(published.code,'invalid_group');assert.equal(published.message,'Use a group ID from list-groups.');
  const invalidAssistant=await executePluginOperationTool(service.host,{operation:record.id+'.check',input:{}},{} as any);assert.equal(invalidAssistant.errorKind,'invalid_input');
  assert.equal((await service.host.invokeOperation(record.id+'.write',{})).receipt.outcome,'uncertain');
  const inputFile=path.join(root,'input.json');writeFileSync(inputFile,JSON.stringify({mode:'public'}));
  for(const json of [true,false]){
    try {await promisify(execFile)(process.execPath,['--import','tsx',path.resolve('../../packages/cli/src/cli.ts'),'operation','invoke',record.id+'.check','--input',inputFile,'--host',origin,...(json?['--json']:[])],{windowsHide:true});assert.fail('CLI must fail');}
    catch(error:any){assert.equal(error.code,1);if(json){assert.equal(JSON.parse(error.stdout).code,'invalid_group');assert.equal(JSON.parse(error.stdout).receipt.outcome,'failure');}else assert.match(error.stdout,/invalid_group: Use a group ID/);}
  }
});
