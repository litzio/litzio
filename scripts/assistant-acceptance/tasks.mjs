import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, serialize } from '../../packages/core/src/index.ts';
const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const doc = (title, body) => serialize(parse(`---\nlitzio: 1\ntitle: ${title}\n---\n\n${body}\n`));
const write = (root, name, value) => { const file = path.join(root,name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,value); };
const text = (root,name) => fs.existsSync(path.join(root,name)) ? fs.readFileSync(path.join(root,name),'utf8') : '';
const contains = (value, expected) => expected.every(s => value.includes(s));
const output = (name, tokens, extra = () => true) => ({ output: name, judge: root => contains(text(root,name), tokens) && extra(text(root,name),root) });
export const tasks = [
 { id:1, name:'기존 표·제목 수정', message:'현황.md의 제목을 납품 현황으로 바꾸고, 표에 품목은 감마, 수량은 7인 행 하나를 추가해 줘.', prepare:r=>write(r,'현황.md',doc('초기 현황','| 품목 | 수량 |\n| --- | --- |\n| 알파 | 2 |')), ...output('현황.md',['납품 현황'],s=>/\|\s*감마\s*\|\s*7\s*\|/.test(s)&&s.split('\n').filter(l=>/^\|/.test(l)).length===4) },
 { id:2, name:'용어 일괄 변경', message:'문서 세 개에 있는 예비검토라는 용어를 모두 사전검토로 바꿔 줘.', prepare:r=>[1,2,3].forEach(n=>write(r,`문서${n}.md`,doc(`문서 ${n}`,'예비검토 일정과 예비검토 결과.'))), outputs:['문서1.md','문서2.md','문서3.md'], judge:r=>[1,2,3].every(n=>text(r,`문서${n}.md`).includes('사전검토')&&!text(r,`문서${n}.md`).includes('예비검토')) },
 { id:3, name:'회의록 생성', message:'회의록.md를 만들어 줘. 제목은 출하 회의록, 논의 항목은 포장과 운송을 목록으로 넣고, 담당 표에는 민수의 포장과 지연의 운송을 넣어 줘.', prepare:()=>{}, ...output('회의록.md',['출하 회의록','포장','운송','민수','지연'],s=>/^[-*] /m.test(s)&&s.includes('|')) },
 { id:4, name:'XLSX 집계', message:'sales.xlsx를 읽고 품목별 금액 합계 표가 있는 매출요약.md를 만들어 줘.', prepare:r=>write(r,'sales.xlsx',fixture('sales.xlsx')), ...output('매출요약.md',['Alpha','Beta','360','150'],s=>s.includes('|')) },
 { id:5, name:'PPTX 추출', message:'brief.pptx의 슬라이드 제목과 핵심 항목을 발표요약.md에 정리해 줘.', prepare:r=>write(r,'brief.pptx',fixture('brief.pptx')), ...output('발표요약.md',['Launch plan','Quality gate','ORBIT-71','VERIFY-82']) },
 { id:6, name:'PDF 요구사항 추출', message:'requirements.pdf에서 shall이 들어간 요구사항 문장을 뽑아 번호가 있는 표로 요구사항.md에 정리해 줘.', prepare:r=>write(r,'requirements.pdf',fixture('requirements.pdf')), ...output('요구사항.md',['ALARM-73','STATUS-84','shall'],s=>s.includes('|')&&/\|\s*1\s*\|/.test(s)&&/\|\s*2\s*\|/.test(s)) },
 { id:7, name:'Git diff 보고', message:'repo 저장소의 가장 최근 커밋 diff를 읽고 변경 파일 목록이 들어간 리뷰.md를 만들어 줘.', prepare:r=>{ const cwd=path.join(r,'repo'); fs.mkdirSync(cwd); const git=(...a)=>execFileSync('git',a,{cwd,stdio:'pipe'}); git('init'); write(cwd,'alpha.txt','before\n'); git('add','.'); const commit=m=>git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-m',m); commit('seed'); write(cwd,'alpha.txt','after\n'); write(cwd,'beta.txt','new\n'); git('add','.'); commit('change'); }, ...output('리뷰.md',['alpha.txt','beta.txt']) },
 { id:8, name:'주제 파일 이동', message:'배터리 주제의 파일을 찾아 배터리 폴더로 옮기고, 옮긴 파일 목록을 이동목록.md로 만들어 줘.', prepare:r=>{write(r,'자료-a.txt','배터리 수명 BAT-71');write(r,'자료-b.txt','배터리 충전 BAT-82');write(r,'자료-c.txt','모터 제어 MOTOR-93');}, ...output('이동목록.md',['자료-a.txt','자료-b.txt'],(_,r)=>!fs.existsSync(path.join(r,'자료-a.txt'))&&!fs.existsSync(path.join(r,'자료-b.txt'))&&text(r,'배터리/자료-a.txt').includes('BAT-71')&&text(r,'배터리/자료-b.txt').includes('BAT-82')&&text(r,'자료-c.txt').includes('MOTOR-93')) },
 { id:9, name:'CSV 스크립트 실행', message:'sales.csv를 품목별로 집계하는 스크립트를 작성하고 실행해서 결과 표를 집계.md에 넣어 줘.', prepare:r=>write(r,'sales.csv','item,amount\nAlpha,120\nBeta,50\nAlpha,240\nBeta,100\n'), ...output('집계.md',['Alpha','Beta','360','150'],s=>s.includes('|')) },
 { id:10, name:'그림·캡션 삽입', message:'그림.md에 sample.png를 그림으로 넣고 캡션을 합성 표본으로 달아 줘.', prepare:r=>{write(r,'그림.md',doc('그림','표본을 아래에 넣습니다.'));write(r,'sample.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));}, ...output('그림.md',['합성 표본','{figure}'],(s,r)=>{ const ref=s.match(/\{figure\}\s+([^\s]+)/)?.[1]; return !!ref&&fs.existsSync(path.join(r,ref)); }) },
 { id:11, name:'수식 삽입·이스케이프', message:'수식.md에 속력은 이동 거리를 걸린 시간으로 나눈다는 분수가 들어간 블록 수식을 넣어 줘. 문장 안에는 아래첨자 0이 붙은 그리스 문자 알파가 초기 각도라는 수식도 넣어 줘.', prepare:r=>write(r,'수식.md',doc('수식','관계를 아래에 정리합니다.')), ...output('수식.md',['\\frac'],s=>!s.includes('\\\\frac')&&/\$[^$\n]*\\alpha[^$\n]*_/.test(s)&&s.includes('{math}')) },
];
