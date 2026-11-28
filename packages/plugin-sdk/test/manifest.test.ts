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
test('file actions validate the screen and unambiguous default opens', () => {
 const action = { id: 'convert', label: ' Convert ', extensions: ['.pdf', '.docx'] };
 assert.deepEqual(validateManifest(card).contributes.fileActions, []);
 assert.deepEqual(validateManifest({...card, fileActions: [action]}).contributes.fileActions, [
   {...action, label: 'Convert', icon: 'FileText', screenId: 'main', openByDefault: false},
 ]);
 for (const change of [
   {extensions: []}, {extensions: ['docx']}, {extensions: ['.PDF']}, {extensions: ['.pdf', '.pdf']},
   {screenId: 'missing'}, {label: ' '}, {icon: 'icon.svg'}, {condition: '*.pdf'},
 ]) assert.throws(() => validateManifest({...card, fileActions: [{...action, ...change}]}));
 assert.throws(() => validateManifest({...card, fileActions: [action, action]}), /Duplicate identity/);
 const primary = {...action, openByDefault: true};
 const other = {...primary, id: 'inspect', extensions: ['.pdf']};
 assert.throws(() => validateManifest({...card, fileActions: [primary, other]}), /one default file action/);
 assert.equal(validateManifest({...card, fileActions: [primary, {...other, openByDefault: false}]}).contributes.fileActions.length, 2);
});
test('public input validation preserves schema and reports constraints without coercion',()=>{
 const schema={type:'object',properties:{count:{type:'integer',minimum:1}},required:['count'],additionalProperties:false};const before=structuredClone(schema);const check=compileOperationInputSchema(schema);assert.equal(check({count:2}),true);assert.equal(check({count:'2'}),false);assert.equal(check({count:0}),false);assert.deepEqual(schema,before);
});
test('screen saveDocument keeps authored payload image identity and size validation',()=>{
 const input={authoring:{title:'Example',inputs:[{key:'rows',blocks:[{kind:'paragraph',text:'Value'}]}]},images:[]};assert.doesNotThrow(()=>authoredDocumentRequestSchema.parse(input));assert.equal(authoredDocumentRequestSchema.safeParse({...input,images:[{key:'a',mime:'image/png',base64:'x'},{key:'a',mime:'image/png',base64:'x'}]}).success,false);
});

test('SDK authoring and machine nodes carry optional looseness through nested lists', async () => {
  const nested = { ordered: true, loose: true, items: ['First', 'Second'].map(text => ({ content: [{ kind: 'text', text }] })) };
  const input = { authoring: { inputs: [{ key: 'lists', blocks: [
    { kind: 'list', ordered: false, loose: true, items: [
      { content: [{ kind: 'text', text: 'Outer' }], list: nested }, 'Next',
    ] },
    { kind: 'list', ordered: true, items: ['Tight'] },
  ] }] }, images: [] };
  const { authoring } = authoredDocumentRequestSchema.parse(input);
  const { source } = await sdk.authorDocument(authoring);
  const nodes = sdk.machineNodes(sdk.getEditableDocument(sdk.parse(source)));
  assert.equal(nodes[0].loose, true);
  assert.equal((nodes[0].items as { list?: { loose?: boolean } }[])[0].list?.loose, true);
  assert.equal(nodes[1].loose, undefined);
});

test('SDK exposes document title and admonition operations', () => {
  let doc = sdk.parse('---\nlitzio: 1\n---\n\nBody.\n');
  doc = sdk.updateDocumentTitle(doc, 'Report');
  doc = sdk.insertAdmonition(doc, 1, 'note', [{kind:'text', text:'Read this'}]);
  doc = sdk.updateAdmonitionVariant(doc, [1], 'tip');
  doc = sdk.updateAdmonitionInlineContent(doc, [1], [{kind:'strong', children:[{kind:'text',text:'Notice'}]}]);
  const source = sdk.serialize(doc);
  assert.match(source, /title: Report/);
  assert.match(source, /> \[!TIP\]\n> \*\*Notice\*\*/);
  assert.deepEqual(sdk.getEditableDocument(sdk.parse(source)), sdk.getEditableDocument(doc));
});

import * as sdk from '../src/index.ts';

test('SDK document authoring and machine nodes retain raw code fence info', async () => {
  const meta = '  title=&quot;setup.sh&quot;  ';
  const { authoring } = authoredDocumentRequestSchema.parse({ authoring: { inputs: [{ key: 'setup', blocks: [
    { kind: 'code', language: 'sh', code: 'npm i', meta },
    { kind: 'code', language: 'sh', code: 'npm test' },
  ] }] } });
  const { source } = await sdk.authorDocument(authoring);
  const [withInfo, withoutInfo] = sdk.machineNodes(sdk.getEditableDocument(sdk.parse(source)));
  assert.ok(source.includes('```sh' + meta + '\n'));
  assert.equal(withInfo.meta, meta);
  assert.equal(Object.hasOwn(withoutInfo, 'meta'), false);
});

test('SDK exposes table note operations', () => {
  let doc = sdk.insertTable(sdk.parse('---\nlitzio: 1\n---\n\nBody.\n'), 1, [['A', 'B'], ['1', '2']]);
  doc = sdk.insertTableNote(doc, [1], 0, [{kind:'text', text:'First'}]);
  doc = sdk.insertTableNote(doc, [1], 1, [{kind:'text', text:'Second'}]);
  doc = sdk.updateTableNote(doc, [1], 0, [{kind:'text', text:'Revised'}]);
  doc = sdk.moveTableNote(doc, [1], 1, 0);
  doc = sdk.removeTableNote(doc, [1], 1);
  const table = sdk.getEditableDocument(doc).blocks.find(block => block.block === 'table');
  assert.equal(table?.block, 'table');
  assert.deepEqual(table?.block === 'table' && table.notes?.map(note => sdk.inlineContentText(note)), ['Second']);
  assert.throws(() => sdk.removeTableNote(doc, [1], 1));
});

test('documentViewChange gives the changed blocks with the changed document read model', () => {
  const before = sdk.parse('---\nlitzio: 1\n---\n\n# Title\n\nFirst half\n\nsecond half.\n\nKept paragraph.\n\nLast paragraph.\n');
  const merged = sdk.mergeParagraphWithPrevious(before, [3]);
  const change = sdk.documentViewChange(before, merged);
  // Kept and Last move up one place; their content is unchanged, so they are not part of the change.
  assert.deepEqual([change.from, change.removed], [1, 2]);
  assert.deepEqual(change.blocks.map(block => block.block === 'paragraph' && block.text), ['First halfsecond half.']);
  assert.deepEqual(change.blocks[0]?.path, [2]);
  assert.deepEqual(change.document, {title: null, status: null, headingNumbering: null, referenceTemplates: null});
  const titled = sdk.documentViewChange(before, sdk.updateDocumentTitle(before, 'Report'));
  assert.deepEqual([titled.from, titled.removed, titled.blocks.length, titled.document.title], [5, 0, 0, 'Report']);
  assert.deepEqual(sdk.documentViewChange(before, before).blocks, []);
});
