import test from 'node:test';
import assert from 'node:assert/strict';
import {writerAccountContext} from '../lib/writer-context';
test('Writer reuses owner-bound general memory in one bounded read without another model call',async()=>{
 const queries:unknown[]=[];
 const value=await writerAccountContext('owner-a',async query=>{queries.push(query);return {summary:'x'.repeat(4000),instructions:'y'.repeat(3000)};});
 assert.deepEqual(queries,[{where:{userId_slot:{userId:'owner-a',slot:'general'}},select:{summary:true,instructions:true}}]);
 const packet=JSON.parse(value);assert.equal(packet.summary.length,3000);assert.equal(packet.preferences.length,2000);
 assert.equal(await writerAccountContext('owner-b',async()=>null),'');
});
