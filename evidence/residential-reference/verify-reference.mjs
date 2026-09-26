// Reproduce from repository root after npm run build. Evidence-only verifier.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {record} from '../../tools/evidence.mjs';
const dir='evidence/residential-reference';
const file=`${dir}/UKR01-generated.json`;
await writeFile(file,execFileSync('target/release/workbench-cli',['reference-residential']));
const model=JSON.parse(await readFile(file));
await writeFile(`${dir}/design-demand-review.json`,execFileSync('target/release/workbench-cli',['residential-review',file],{maxBuffer:40*1024*1024}));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:4173');
let count=0;const cases=[];
try{
 for(const caseId of ['G','Q','WX','WY','SLS','ULS','LX','LY']){
  const actual=JSON.parse(execFileSync('target/release/workbench-cli',[file,caseId],{maxBuffer:30*1024*1024}));
  const oracle=JSON.parse(execFileSync('tools/oracle-env/bin/python',['tools/oracle.py',file,caseId],{maxBuffer:30*1024*1024}));
  const wasm=await page.evaluate(async({model,caseId})=>{
   const w=await import('/pkg/workbench_wasm_api.js');await w.default();const k=new w.Kernel();
   const req=(operation,payload,expectedRevision)=>JSON.parse(k.request(JSON.stringify({protocolVersion:1,requestId:'reference',operation,payload,expectedRevision})));
   const opened=req('createProject',{project:model},null);if(opened.status!=='ok')throw Error(JSON.stringify(opened));
   const solved=req('analyse',model.loadCases.some(c=>c.id===caseId)?{caseIds:[caseId]}:{combinationIds:[caseId]},opened.revision);if(solved.status!=='ok')throw Error(JSON.stringify(solved));k.free();return solved.payload;
  },{model,caseId});
  assert.equal(actual.modelHash,wasm.modelHash);
  for(const [ids,values,ref] of [[actual.nodeIds,actual.nodeDisplacements,oracle.nodes],[actual.reactionSupportIds,actual.reactions,oracle.reactions]]){
   for(let i=0;i<ids.length;i++)for(let j=0;j<6;j++){
    const expected=ref[ids[i]][j],tol=ref===oracle.nodes?(j<3?1e-9:1e-10):1e-3;
    assert.ok(Math.abs(values[i*6+j]-expected)<=tol+1e-4*Math.abs(expected),`${caseId}/${ids[i]}/${j}`);count++;
   }
  }
  for(const m of actual.members)for(let j=0;j<12;j++){const expected=oracle.endActions[m.id][j];assert.ok(Math.abs(m.endActions[j]-expected)<=1e-3+1e-4*Math.abs(expected),`${caseId}/${m.id}/${j}`);count++;}
  for(const key of ['nodeDisplacements','reactions'])for(let i=0;i<actual[key].length;i++){
   const v=actual[key][i],tol=key==='reactions'?1e-3:i%6<3?1e-9:1e-10;assert.ok(Math.abs(v-wasm[key][i])<=tol+1e-9*Math.abs(v),`${caseId}/WASM/${key}/${i}`);count++;
  }
  for(const [label,value] of [['native',actual],['wasm',wasm],['opensees',oracle]])await writeFile(`${dir}/${caseId}-${label}.json`,JSON.stringify(value));
  cases.push({caseId,resultId:actual.resultId,numericalChecks:actual.numericalChecks});console.log(`${caseId}: native, WASM and OpenSees agree`);
 }
 await record('reference-numerical',{status:'PASS',taskId:'UKR01',testCount:count,testIds:cases.map(x=>x.caseId),cases,command:['node',`${dir}/verify-reference.mjs`],artifacts:['UKR01-generated.json','design-demand-review.json']});
}finally{await browser.close();}
