// Deterministic fault fixtures. This file is NOT evidence of real model success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createSpike } from '../server/interview-spike.ts';
test('failed and cancelled revisions preserve admitted answers/comments and cannot write', async () => {
  const base = mkdtempSync(path.resolve(import.meta.dirname, '../../../spike-artifacts/fault-'));
  let output: unknown; let waiting = false; let interrupted = false;
  const fixture = { async invoke(op: string, args: any) {
    if(op==='assistantConversation') {if(args.action==='interrupt') interrupted=true; return {id:'fixture-thread'};}
    return {model:'fixture',turns:[{status:waiting?'inProgress':'completed',items:[{kind:'assistant',text:JSON.stringify(output)}]}]};
  }, async close() {} };
  const api = await createSpike({base,host:fixture});
  const get = () => api.handle('GET','/state',{});
  try {
    await assert.rejects(api.handle('POST','/approve',{revision:0,approved:true}), /승인/);
    output={title:'Fixture',message:'Questions',questions:[{id:'goal',label:'Goal',hint:''},{id:'scope',label:'Scope',hint:''}]};
    await api.handle('POST','/start',{revision:0,message:'Fixture only'});
    await assert.rejects(api.handle('POST','/flow',{revision:0,answers:{goal:'A',scope:'B'}}),/최신/);
    const g={title:'Fixture flow',message:'Result',nodes:[{id:'a',label:'A',detail:'A'},{id:'b',label:'B',detail:'B'}],edges:[{source:'a',target:'b',label:''}]};
    output=g; await api.handle('POST','/flow',{revision:1,answers:{goal:'A',scope:'B'}});
    output={...g,nodes:[{id:'wrong',label:'Wrong',detail:'Wrong'},{id:'b',label:'B',detail:'B'}],edges:[{source:'wrong',target:'b',label:''}]};
    await assert.rejects(api.handle('POST','/revise',{revision:2,nodeId:'a',message:'Preserve me'}),/identity/);
    assert.deepEqual((await get()).graph,g); assert.equal((await get()).comments[0].text,'Preserve me');
    waiting=true;
    const pending=api.handle('POST','/revise',{revision:2,nodeId:'a',message:'Cancel but retain'});
    await new Promise(r=>setTimeout(r,20)); await api.handle('POST','/cancel',{});
    await assert.rejects(pending,/취소/); assert.equal(interrupted,true);
    const state=await get(); assert.deepEqual(state.answers,{goal:'A',scope:'B'}); assert.equal(state.comments.at(-1).text,'Cancel but retain'); assert.deepEqual(state.graph,g); assert.equal(state.revision,2); assert.equal(state.document,undefined);
    assert.deepEqual(readdirSync(path.join(base,'documents')),[]);
  } finally {await api.close();}
});
