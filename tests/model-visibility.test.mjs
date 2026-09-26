import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleEntities } from '../web/model-visibility.js';
const project = { members:[{id:'a',start:'n1',end:'n2'},{id:'b',start:'n2',end:'n3'}],nodes:[{id:'n1'},{id:'n2'},{id:'n3'}],supports:[{id:'s',node:'n1'}],structure:{storeys:[{id:'l1'},{id:'l2'}],physicalMembers:[{id:'p1',storeyId:'l1',analyticalMemberIds:['a']},{id:'p2',storeyId:'l2',analyticalMemberIds:['b']}],layers:[{id:'layer',members:[{kind:'physicalMember',id:'p1'}]}]}};
test('scope intersects authored storey/layer and isolation; shared endpoints remain visible',()=>{
 assert.deepEqual([...visibleEntities(project,{storey:'l1'})].sort(),['a','n1','n2','s']);
 assert.equal(visibleEntities(project,{storey:'l2',layer:'layer'}).size,0);
 assert.deepEqual([...visibleEntities(project,{isolated:new Set(['s'])})].sort(),['n1','s']);
 assert(!visibleEntities(project,{hidden:new Set(['a'])}).has('a'));
 assert(visibleEntities(project,{hidden:new Set(['a'])}).has('n2'));
 assert(!visibleEntities(project,{hidden:new Set(['n2'])}).has('n2'));
});
