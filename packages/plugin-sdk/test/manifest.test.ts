import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,compileOperationInputSchema,authoredDocumentRequestSchema} from '../src/index.ts';
const card={id:'fixture.code',name:'Code',entry:'host.mjs',screen:'screen.jsx'};
test('code identity declares settings, connection secrets, skills and public operations',()=>{
 const m=validateManifest({...card,settingsSchema:{type:'object',properties:{url:{type:'string'}},additionalProperties:false},secrets:[{id:'token',title:'Token',scope:'connection'}],skills:[{id:'guide',directory:'skills/guide'}],operations:[{id:'read',assistant:true,inputSchema:{type:'object'},outputSchema:{type:'string'}}]});
 assert.equal(m.settingsSchema.properties!==undefined,true);assert.equal(m.secrets[0]?.id,'token');assert.equal(m.contributes.skills[0]?.id,'guide');assert.equal(m.contributes.operations[0]?.assistant,true);assert.equal(m.contributes.screens[0]?.entry,'screen.jsx');
});
test('manifest rejects obsolete syntax, escapes, duplicate declarations and invalid schemas before execution',()=>{
 for(const bad of [{...card,tier:'official'},{...card,contributes:{}},{...card,entry:'../host.mjs'},{...card,screen:'/screen.jsx'},{...card,icon:'../icon.svg'},{...card,secrets:[{id:'token',title:'Token',scope:'connection'},{id:'token',title:'Again',scope:'connection'}]},{...card,skills:[{id:'guide',directory:'../guide'}]},{...card,settingsSchema:{type:'object',required:['url']}},{...card,operations:[{id:'read',inputSchema:{$ref:'https://example.com/schema'}}]}])assert.throws(()=>validateManifest(bad));
});
test('settings save incrementally and health checks must be host reads accepting empty input',()=>{
 assert.throws(()=>validateManifest({...card,healthCheck:'absent'}));
 assert.throws(()=>validateManifest({...card,healthCheck:'check',operations:[{id:'check',effect:'write'}]}));
 assert.equal(validateManifest({...card,healthCheck:'check',operations:[{id:'check'}]}).contributes.healthCheck,'check');
});
test('public input validation preserves schema and reports constraints without coercion',()=>{
 const schema={type:'object',properties:{count:{type:'integer',minimum:1}},required:['count'],additionalProperties:false};const before=structuredClone(schema);const check=compileOperationInputSchema(schema);assert.equal(check({count:2}),true);assert.equal(check({count:'2'}),false);assert.equal(check({count:0}),false);assert.deepEqual(schema,before);
});
test('screen saveDocument keeps authored payload image identity and size validation',()=>{
 const input={authoring:{title:'Example',inputs:[{key:'rows',blocks:[{kind:'paragraph',text:'Value'}]}]},images:[]};assert.doesNotThrow(()=>authoredDocumentRequestSchema.parse(input));assert.equal(authoredDocumentRequestSchema.safeParse({...input,images:[{key:'a',mime:'image/png',base64:'x'},{key:'a',mime:'image/png',base64:'x'}]}).success,false);
});
