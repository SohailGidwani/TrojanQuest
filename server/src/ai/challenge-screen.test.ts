import test from 'node:test';
import assert from 'node:assert/strict';
import { screenChallenge } from './service.js';
import { Ollama } from './ollama.js';
const input = { title:'Study route',blurb:'Stay on public paths',author:'student' as const,days:3,stops:[],reward:{name:'Book',lore:'Study',art:'book' as const,rarity:'rare' as const} };
test('challenge screening returns advisory passed/flagged verdicts with all text treated as data', async()=>{
  for(const safe of [true,false]) {
    const model=new Ollama({fetch:async(_url, options)=>{
      const body=JSON.parse(String(options?.body));assert.match(body.messages[0].content,/untrusted/);assert.match(body.messages[0].content,/Human review/);
      assert.equal(JSON.parse(body.messages[1].content).title,input.title);
      return Response.json({message:{content:JSON.stringify({safe,reason:'Fixture screen'})}});
    }});
    assert.equal((await screenChallenge(input,model)).status,safe?'passed':'flagged');
  }
});
test('unavailable or malformed screening never masquerades as approval',async()=>{
  for(const content of ['bad-json',JSON.stringify({safe:true,reason:''})]) {
    const result=await screenChallenge(input,new Ollama({fetch:async()=>Response.json({message:{content}})}));
    assert.equal(result.status,'unavailable');
  }
});
