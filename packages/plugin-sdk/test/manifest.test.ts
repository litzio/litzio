import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,compileOperationInputSchema,authoredDocumentRequestSchema} from '../src/index.ts';
const card={id:'fixture.code',name:'Code',entry:'host.mjs',screen:'screen.jsx'};
test('code identity declares settings, connection secrets, skills and public operations',()=>{
 const m=validateManifest({...card,settingsSchema:{type:'object',properties:{url:{type:'string'}},additionalProperties:false},secrets:[{id:'token',title:'Token',scope:'connection'}],skills:[{id:'guide',directory:'skills/guide'}],operations:[{id:'read',assistant:true,inputSchema:{type:'object'},outputSchema:{type:'string'}}]});
 assert.equal(m.settingsSchema.properties!==undefined,true);assert.equal(m.secrets[0]?.id,'token');assert.equal(m.contributes.skills[0]?.id,'guide');assert.equal(m.contributes.operations[0]?.assistant,true);assert.equal(m.contributes.screens[0]?.entry,'screen.jsx');
 assert.equal(validateManifest(card).version,undefined);
 assert.equal(validateManifest({...card,version:'November preview'}).version,'November preview');
 for(const repository of ['https://github.com/acme/tools','https://github.com/acme/tools.git/','https://github.com/acme/tools/tree/main/plugins/alpha','https://github.com/acme/tools/tree/feat/x/plugins/alpha'])assert.equal(validateManifest({...card,repository}).repository,repository);
 for(const repository of ['http://github.com/acme/tools','https://gitlab.com/acme/tools','https://github.com/acme','https://github.com/acme/tools/blob/main/a','https://github.com/acme/tools/tree','https://github.com/acme/tools/tree/main/../x','https://token@github.com/acme/tools','https://github.com/acme/tools?ref=main'])assert.throws(()=>validateManifest({...card,repository}),/public GitHub address/,repository);
});
test('manifest rejects obsolete syntax, escapes, duplicate declarations and invalid schemas before execution',()=>{
 for(const version of ['', '  ', '1\n2', '1\r2', '1\u20282', 1])assert.throws(()=>validateManifest({...card,version}));
 for(const icon of ['icon.svg','icon.SVG','icons/icon.png','icons/icon.PNG'])assert.equal(validateManifest({...card,icon}).icon,icon);
 for(const icon of ['icon.webp','icon.WEBP','icon.jpg','icon.gif','icon'])assert.throws(()=>validateManifest({...card,icon}),/Invalid icon path/);
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

test('SDK exposes document title and admonition operations', () => {
  let doc = sdk.parse('---\nlitzio: 1\n---\n\nBody.\n');
  doc = sdk.updateDocumentTitle(doc, 'Report');
  doc = sdk.insertAdmonition(doc, 1, 'note', [{kind:'text', text:'Read this'}]);
  doc = sdk.updateAdmonitionVariant(doc, [1], 'tip');
  doc = sdk.updateAdmonitionInlineContent(doc, [1], [{kind:'strong', children:[{kind:'text',text:'Notice'}]}]);
  const source = sdk.serialize(doc);
  assert.match(source, /title: Report/);
  assert.match(source, /:::.*tip/);
  assert.match(source, /\*\*Notice\*\*/);
});

import * as sdk from '../src/index.ts';
