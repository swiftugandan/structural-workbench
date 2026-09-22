import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { record } from '../../../tools/evidence.mjs';
const file='fixtures/models/W01.json', dir='evidence/M01/warehouse';
const model=JSON.parse(await readFile(file));
const actual=JSON.parse(execFileSync('target/release/workbench-cli',[file],{encoding:'utf8'}));
const oracle=JSON.parse(execFileSync('tools/oracle-env/bin/python',['tools/oracle.py',file],{encoding:'utf8'}));
let comparisons=0;
for(const [ids,values,reference] of [[actual.nodeIds,actual.nodeDisplacements,oracle.nodes],[actual.reactionSupportIds,actual.reactions,oracle.reactions]])
 for(let i=0;i<ids.length;i++)for(let j=0;j<6;j++) {
  const expected=reference[ids[i]][j], atol=reference===oracle.nodes?(j<3?1e-9:1e-10):1e-3;
  assert.ok(Math.abs(values[i*6+j]-expected)<=atol+1e-4*Math.abs(expected),`${ids[i]}/${j}`);comparisons++;
 }
for(const m of actual.members)for(let j=0;j<12;j++) {
 const expected=oracle.endActions[m.id][j];
 assert.ok(Math.abs(m.endActions[j]-expected)<=1e-3+1e-4*Math.abs(expected),`${m.id}/${j}`);comparisons++;
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const balance=[0,0,0,0,0,0], applied=[0,0,0], reactions=[0,0,0];
function add(position,action){const moment=cross(position,action);for(let j=0;j<6;j++)balance[j]+=action[j]+(j>=3?moment[j-3]:0)}
for(const l of model.loads){add(model.nodes.find(n=>n.id===l.node).position,l.values);for(let j=0;j<3;j++)applied[j]+=l.values[j]}
for(let i=0;i<actual.reactionSupportIds.length;i++) {
 const s=model.supports.find(s=>s.id===actual.reactionSupportIds[i]),v=actual.reactions.slice(i*6,i*6+6);
 add(model.nodes.find(n=>n.id===s.node).position,v);for(let j=0;j<3;j++)reactions[j]+=v[j];
}
assert.deepEqual(applied,[0,45000,-180000]);
assert.ok(balance.every(v=>Math.abs(v)<1e-3),JSON.stringify(balance));
const browser=await chromium.launch({headless:true});
let wasm;
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173');
 wasm=await page.evaluate(async model=>{
  const m=await import('/pkg/workbench_wasm_api.js');await m.default();const k=new m.Kernel();
  const req=(operation,payload,expectedRevision)=>JSON.parse(k.request(JSON.stringify({protocolVersion:1,requestId:'warehouse-validation',operation,payload,expectedRevision})));
  const opened=req('createProject',{project:model},null);if(opened.status!=='ok')throw Error(JSON.stringify(opened));
  const solved=req('analyse',{caseIds:['LC1']},opened.revision);if(solved.status!=='ok')throw Error(JSON.stringify(solved));k.free();return solved.payload;
 },model);
} finally {await browser.close()}
let wasmComparisons=0;
for(const key of ['nodeDisplacements','reactions'])for(let i=0;i<actual[key].length;i++) {
 assert.ok(Math.abs(actual[key][i]-wasm[key][i])<=(key==='reactions'?1e-3:1e-9)+1e-9*Math.abs(actual[key][i]));wasmComparisons++;
}
for(let i=0;i<actual.members.length;i++)for(let j=0;j<12;j++) {
 assert.ok(Math.abs(actual.members[i].endActions[j]-wasm.members[i].endActions[j])<=1e-3+1e-9*Math.abs(actual.members[i].endActions[j]));wasmComparisons++;
}
const maxTranslation=Math.max(...actual.nodeIds.map((_,i)=>Math.hypot(...actual.nodeDisplacements.slice(i*6,i*6+3))));
const summary={nodes:model.nodes.length,members:model.members.length,supports:model.supports.length,applied,reactions,balance,maxTranslation,oracleComparisons:comparisons,wasmComparisons,numericalChecks:actual.numericalChecks};
await writeFile(`${dir}/numerical-results.json`,JSON.stringify({summary,actual,oracle,wasm},null,2));
await record('warehouse-numerical',{status:'PASS',testCount:comparisons+wasmComparisons+6,summary,command:['node',`${dir}/validate.mjs`],artifacts:['validate.mjs','numerical-results.json']});
console.log(JSON.stringify(summary,null,2));
