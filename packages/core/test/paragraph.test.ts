import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parse,serialize,validateStructure,insertHardBreak,splitParagraph,mergeParagraphWithPrevious,getEditableDocument, type MystDocument} from './core-internal.ts';
import {projectInlineContent,inlineContentText,assertInlineContent,inlineContentToNodes,paragraphLeadingSpaceLength} from '../src/inline.ts';
import { writeIssueOf } from './core-internal.ts';
import { insertParagraph, updateParagraphInlineContent, insertQuote, updateQuoteInlineContent,
  insertAdmonition, updateAdmonitionInlineContent, insertList, updateList, insertFigure, updateFigure,
  insertFootnoteDefinition, updateFootnoteDefinition, replaceText, updateNodeTextAtPath,
  updateTableCell, updateTableCaption, insertTable, insertHeading, type InlineContent } from './core-internal.ts';

function stable(d: MystDocument) {
  validateStructure(d);
  const markdown=serialize(d), reparsed=parse(markdown);
  validateStructure(reparsed);
  assert.equal(serialize(reparsed),markdown);
  return reparsed;
}
function content(d: MystDocument,index=0) { return projectInlineContent(d.children[index])!; }
function text(d: MystDocument,index=0) { return inlineContentText(content(d,index)); }
test('citation-only split and merge preserve roles, key order and marks', () => {
  const atom = '**{cite:p}`Beta,Alpha,Beta`**';
  const original = parse('X{cite:p}`Beta,Alpha,Beta`');
  const split = stable(splitParagraph(original, [0], 1));
  assert.deepEqual(content(split, 1), content(parse('{cite:p}`Beta,Alpha,Beta`')));
  assert.equal(serialize(stable(mergeParagraphWithPrevious(split, [1]))), serialize(original));

  const pair = parse(`${atom}\n\n*{cite:t}\`Alpha,Gamma\`*`);
  const merged = stable(mergeParagraphWithPrevious(pair, [1]));
  assert.deepEqual(content(merged), [...content(pair), ...content(pair, 1)]);
  assert.equal(serialize(stable(splitParagraph(merged, [0], 1))), serialize(pair));
});
for(const [source,offset] of [['ABCD',2],['**ABCD**',2],['*ABCD*',2],['**A*BC*D**',2],['A**BC**D',1]] as const) {
  test(`hard break preserves marks: ${source}`,()=>{
    const original=parse(source), before=serialize(original);
    const changed=insertHardBreak(original,[0],offset);
    assert.equal(text(changed),'ABCD'.slice(0,offset)+'\n'+'ABCD'.slice(offset));
    assert.deepEqual(content(stable(changed)),content(changed));
    assert.equal(serialize(original),before);
  });
  test(`split preserves marks: ${source}`,()=>{
    const original=parse(source+'\n\n# Tail');
    const changed=splitParagraph(original,[0],offset);
    assert.equal(text(changed),'ABCD'.slice(0,offset));
    assert.equal(text(changed,1),'ABCD'.slice(offset));
    assert.equal(changed.children[2].type,'heading');
    const round=stable(changed);
    assert.deepEqual(content(round),content(changed));
    assert.deepEqual(content(round,1),content(changed,1));
    assert.equal(serialize(stable(mergeParagraphWithPrevious(changed,[1]))),serialize(original));
  });
}
test('MyST observed break representation and canonical form',()=>{
  for(const source of ['A  \nB','A\\\nB']) {
    const d=parse(source);
    assert.equal(d.children[0].children?.[1].type,'break');
    assert.deepEqual(content(d),[{kind:'text',text:'A'},{kind:'break'},{kind:'text',text:'B'}]);
    assert.equal(serialize(stable(d)),'A\\\nB\n');
  }
  assertInlineContent([{kind:'break'}]);
  assert.deepEqual(inlineContentToNodes([{kind:'break'}]),[{type:'break'}]);
});
test('UTF-16 offsets count surrogate pairs as two and a break as one',()=>{
  const d=insertHardBreak(parse('A😀BC'),[0],3);
  assert.equal(text(stable(d)),'A😀\nBC');
  const split=splitParagraph(d,[0],5);
  assert.equal(text(stable(split)),'A😀\nB');
  assert.equal(text(split,1),'C');
});
test('split existing break, nested paragraph break insertion',()=>{
  const split=splitParagraph(parse('AB\\\nCD'),[0],4);
  assert.equal(text(stable(split)),'AB\nC');
  const nested=insertHardBreak(parse('> ABCD'),[0,0],2);
  stable(nested);
  assert.equal(inlineContentText(projectInlineContent(nested.children[0].children![0])!),'AB\nCD');
});
for(const offset of [0,4,5,-1,1.5,NaN,Infinity]) {
  test(`reject invalid offset ${offset}`,()=>{
    for(const operation of [insertHardBreak,splitParagraph]) assert.throws(()=>operation(parse('ABCD'),[0],offset),/offset/);
  });
}
test('paragraph operations fail closed for paths, types and unsupported inline',()=>{
  for(const operation of [insertHardBreak,splitParagraph]) {
    // Plain links are supported inline content (see link.test.ts); these forms are not.
    for(const source of ['# Heading','See {ref}`Text <target>`.','[](#target) and text','{download}`./file.zip` text']) assert.throws(()=>operation(parse(source),[0],2));
    for(const path of [[],[99],[-1],[0.5]]) assert.throws(()=>operation(parse('ABCD'),path,2));
  }
  assert.throws(()=>splitParagraph(parse('> ABCD'),[0,0],2),/top-level/);
  assert.throws(()=>mergeParagraphWithPrevious(parse('> ABCD'),[0,0]),/top-level/);
  for(const source of ['ABCD','# Heading\n\nABCD','$$\nx=1\n$$\n\nABCD','[](#target)\n\nABCD','ABCD\n\n# Heading']) {
    assert.throws(()=>mergeParagraphWithPrevious(parse(source),[source==='ABCD'?0:1]));
  }
});
test('merge adds no space and preserves rich content and breaks',()=>{
  for(const [source,expected] of [['Hello\n\nWorld','HelloWorld'],['**Hello**\n\n**World**','HelloWorld'],['**Hello**\n\n*World*','HelloWorld'],['AB\\\nCD\n\nEF\\\nGH','AB\nCDEF\nGH']]) {
    const changed=mergeParagraphWithPrevious(parse(source),[1]);
    assert.equal(text(stable(changed)),expected);
    assert.deepEqual(content(stable(changed)),content(changed));
  }
});
test('split trims blank-line tails but rejects other unpersistable boundaries without placeholders',()=>{
  const split = stable(splitParagraph(parse('A\\\nBC'),[0],2));
  assert.equal(text(split), 'A');
  assert.equal(text(split, 1), 'BC');
  assert.equal(text(stable(splitParagraph(parse('A\\\nBC'),[0],1)),1),'\nBC');
  assert.throws(()=>splitParagraph(parse('**AB CD**'),[0],3),/round-trip/);
});

test('paragraph writes remove only blank-line tails, preserving interior content and data-bearing atoms', () => {
  const kept: InlineContent[] = [{kind:'text',text:'A'}, {kind:'break'},
    {kind:'strong',children:[{kind:'text',text:'B'}]}];
  const tail: InlineContent[] = [{kind:'text',text:' \t'}, {kind:'strong',children:[
    {kind:'break'}, {kind:'emphasis',children:[{kind:'text',text:' \n\t'}]}]}];
  const input = [...kept, ...tail], before = structuredClone(input);
  const original = parse('Original.');
  for (const changed of [insertParagraph(original, 1, input), updateParagraphInlineContent(original, [0], input)]) {
    const index = changed.children.length - 1;
    assert.deepEqual(content(stable(changed), index), kept);
  }
  assert.deepEqual(input, before);
  assert.equal(text(original), 'Original.');
  assert.equal(text(stable(updateParagraphInlineContent(original, [0], [{kind:'text',text:'A\nB\n\n \t'}]))), 'A\nB');
  for (const atom of [
    {kind:'link',url:'https://example.com',children:[{kind:'text',text:' '}]},
    {kind:'code',value:' '}, {kind:'math',value:'x'},
    {kind:'reference',role:'eq',label:'eq-a'}, {kind:'citation',role:'cite:p',keys:['A']},
  ] as InlineContent[]) {
    const expected: InlineContent[] = [{kind:'text',text:'A '}, atom];
    assert.deepEqual(content(stable(updateParagraphInlineContent(original, [0], [...expected, ...tail]))), expected);
  }
  assert.throws(() => updateParagraphInlineContent(original, [0], tail), /empty paragraph/);
  // No line break: existing space/mark restrictions still apply.
  assert.throws(() => insertParagraph(original, 1, [{kind:'strong',children:[{kind:'text',text:'B '}]}]), /round-trip/);
});

test('paragraph owners share tail normalization and retain their existing empty rules', () => {
  const base = parse('Original.');
  const kept: InlineContent[] = [{kind:'text',text:'A'}, {kind:'break'}, {kind:'text',text:'B'}];
  const input: InlineContent[] = [...kept, {kind:'break'}, {kind:'text',text:' \t'}];
  const quote = insertQuote(base, 1, input);
  const admonition = insertAdmonition(base, 1, 'note', input);
  const list = {ordered:false as const,items:[{content:input,list:{ordered:false as const,items:[{content:input}]}}]};
  const listed = insertList(base, 1, list);
  const figure = insertFigure(base, 1, {imageUrl:'',imageAlt:'',caption:input});
  const referenced = updateParagraphInlineContent(base, [0], [{kind:'text',text:'Note'}, {kind:'footnote',label:'n'}]);
  const note = insertFootnoteDefinition(referenced, 1, 'n', input);
  for (const changed of [quote, updateQuoteInlineContent(quote, [1], input),
    admonition, updateAdmonitionInlineContent(admonition, [1], input), listed, updateList(listed, [1], list),
    figure, updateFigure(figure, [1], {caption:input}), note, updateFootnoteDefinition(note, [1], input)]) {
    const markdown = serialize(stable(changed));
    assert.doesNotMatch(markdown, /B\\\n/);
    assert.match(markdown, /A\\\n/);
  }
  for (const changed of [replaceText(parse('> AB'), 'AB', 'A\n\n \t'),
    updateNodeTextAtPath(parse('> AB'), [0,0,0], 'AB', 'A\n\n \t')]) {
    assert.equal(serialize(stable(changed)), '> A\n');
  }
  const empty: InlineContent[] = [{kind:'break'}, {kind:'text',text:' \t'}];
  assert.deepEqual(stable(updateQuoteInlineContent(quote, [1], empty)).children[1].children, []);
  assert.deepEqual(stable(updateAdmonitionInlineContent(admonition, [1], empty)).children[1].children, []);
  assert.throws(() => updateFootnoteDefinition(note, [1], empty), /non-empty/);
  const table = insertTable(base, 1, [['Header'], ['Cell']]);
  assert.throws(() => updateTableCell(table, [1,1,0], input), /line breaks/);
  assert.throws(() => updateTableCaption(table, [1], input), /line breaks/);
  assert.throws(() => insertHeading(base, 1, 2, input), /line breaks/);
});
test('unrelated technical semantics survive each operation despite shifted paths',()=>{
  const original=parse(readFileSync(new URL('./fixtures/technical-document.md',import.meta.url),'utf8'));
  const index=getEditableDocument(original).blocks.findIndex(b=>b.block==='paragraph'&&b.editable);
  const preserved=original.children.filter((_,i)=>i!==index);
  for(const changed of [insertHardBreak(original,[index],2),splitParagraph(original,[index],2),mergeParagraphWithPrevious(splitParagraph(original,[index],2),[index+1])]) {
    const count=changed.children.length-original.children.length+1;
    const untouched=changed.children.filter((_,i)=>i<index||i>=index+count);
    assert.deepEqual(untouched,preserved);
    const round=stable(changed);
    const after=round.children.filter((_,i)=>i<index||i>=index+count);
    assert.equal(serialize({type:'root',children:after}),serialize({type:'root',children:preserved}));
  }
});

test("empty and whitespace-only persistent split results are rejected", () => {
  const document: MystDocument = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: " A" }] }] };
  assert.throws(() => splitParagraph(document, [0], 1), /non-empty/);
  for (const offset of [0, 2]) assert.throws(() => splitParagraph(parse("AB"), [0], offset), (error: unknown) => {
    const issue = writeIssueOf(error);
    assert.match(issue.reason, /empty paragraph/);
    assert.match(issue.action, /Enter text.*delete/);
    return true;
  });
});

test("UTF-16 offsets inside surrogate pairs fail closed before UTF-8 persistence", () => {
  for (const operation of [splitParagraph, insertHardBreak]) {
    assert.throws(() => operation(parse("A😀B"), [0], 2), /surrogate/);
  }
});

test("split explicitly preserves both nested marks on each side", () => {
  const document = splitParagraph(parse("**A*BC*D**"), [0], 2);
  assert.deepEqual(content(document), [
    { kind: "strong", children: [{ kind: "text", text: "A" }, { kind: "emphasis", children: [{ kind: "text", text: "B" }] }] },
  ]);
  assert.deepEqual(content(document, 1), [
    { kind: "strong", children: [{ kind: "emphasis", children: [{ kind: "text", text: "C" }] }, { kind: "text", text: "D" }] },
  ]);
  stable(document);
});

// #1160: source entities and semantic inputs use one normalization rule.
test('paragraph starts remove ASCII indentation and preserve other whitespace contexts', () => {
  const base = parse('Original.');
  const input: InlineContent[] = [{kind:'text',text:' \t'}, {kind:'strong',children:[{kind:'text',text:'  Alpha'}]}, {kind:'text',text:'  interior'}, {kind:'break'}, {kind:'text',text:'  next'}];
  const changed = updateParagraphInlineContent(base,[0],input);
  assert.equal(text(stable(changed)), 'Alpha  interior\n  next');
  assert.deepEqual(content(changed)[0], {kind:'strong',children:[{kind:'text',text:'Alpha'}]});
  for (const source of ['&#x20;&#x9;Alpha', '> &#x20;&#x9;Alpha', '- &#x20;&#x9;Alpha']) {
    const canonical = serialize(stable(parse(source)));
    assert.doesNotMatch(canonical, /&#(?:x20|x9);/);
    assert.match(canonical, /Alpha/);
  }
  for (const prefix of ['\u00a0', '\u2003', '\u000b', '\u000c']) {
    assert.equal(paragraphLeadingSpaceLength([{kind:'text',text:prefix+'Alpha'}]), 0);
    // Existing canonical writeability guard remains authoritative for these inputs.
  }
  for (const atom of [{kind:'code',value:'  code'}, {kind:'link',url:'https://example.com',children:[{kind:'text',text:'  link'}]}] as InlineContent[]) {
    assert.deepEqual(content(stable(updateParagraphInlineContent(base,[0],[atom]))), [atom]);
  }
  const contexts = parse('```text\n  code\n```\n\n| Header |\n| --- |\n| Cell |');
  assert.match(serialize(stable(contexts)), /  code/);
  assert.throws(() => updateTableCell(contexts,[1,1,0],[{kind:'text',text:'  Cell'}]), /whitespace/);
});
