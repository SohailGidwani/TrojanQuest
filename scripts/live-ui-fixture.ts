/** Explicit loopback-only browser fixture. No .env, Supabase client or hosted writes. */
import express from 'express';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBackendRouter } from '../server/src/routes/index.js';
import { aiErrorHandler } from '../server/src/ai/router.js';
import { ApiError } from '../server/src/ai/contracts.js';
import { demoSpots } from '../client/src/components/mock.js';
import type { Catch, Challenge, Friend, QuestParty, Spot, StickerDefinition } from '../shared/types.js';
if (!process.argv.includes('--local-fixture')) throw Error('This test-only server requires --local-fixture.');
const student='11111111-1111-4111-8111-111111111111',reviewer='22222222-2222-4222-8222-222222222222',cid='33333333-3333-4333-8333-333333333333';
const read = async (name:string)=>JSON.parse(await readFile(new URL('../content/'+name,import.meta.url),'utf8'));
const spots:Spot[]=demoSpots,stickers:StickerDefinition[]=(await read('stickers.json')).stickers;
const bovard=spots.find(s=>/bovard/i.test(s.name))!;
const route={id:'fixture-route',title:'Fixture campus route',blurb:'Local integration test only',spot_ids:[bovard.id,'leavey','doheny'],reward_sticker_key:'star'};
const profiles:Record<string,Friend>={ [student]:{user_id:student,display_name:'Fixture Student',friend_code:'TQSTUDENT'},[reviewer]:{user_id:reviewer,display_name:'Fixture Reviewer',friend_code:'TQREVIEWER'} };
const catches:Record<string,Catch[]>={ [student]:[{id:'visit',source:'spot',source_id:bovard.id,variant:'day',caught_at:new Date().toISOString()}],[reviewer]:[{id:'reviewer-visit',source:'spot',source_id:bovard.id,variant:'day',caught_at:new Date().toISOString()}] };
const accepted:Record<string,Record<string,string>>={ [student]:{},[reviewer]:{} }, parties=new Map<string,QuestParty>(),events:string[]=[];
let challenges:Challenge[]=[];
const party=(u:string,q:string)=>{const k=u+q;if(!parties.has(k))parties.set(k,{owner_id:u,quest_id:q,members:[]});return parties.get(k)!;};
const get=(id:string)=>{const c=challenges.find(c=>c.id===id);if(!c)throw new ApiError(404,'Missing');return c;};
const accept=async(u:string,q:string)=>{events.push('accept');accepted[u][q]??=new Date().toISOString();return{quest_id:q,accepted_at:accepted[u][q],already_accepted:false};};
const app=express();app.get('/api/health',(_req,res)=>res.json({mode:'authenticated'}));app.get('/api/quests',(_req,res)=>res.json([route]));
app.use('/api',createBackendRouter({authenticate:async token=>{if(token==='fixture-student')return student;if(token==='fixture-reviewer')return reviewer;throw new ApiError(401,'Fixture session required');},
  screenChallenge:async()=>({status:'passed',reason:'Local fixture verdict, not a real AI decision'}),
  store:{spots:async()=>spots,popups:async()=>[],orgDrops:async()=>[],catches:async u=>catches[u]},
  stickers:{list:async()=>stickers} as never,
  social:{profile:async u=>profiles[u],saveProfile:async(u,p)=>profiles[u]={...profiles[u],...p},list:async u=>Object.values(profiles).filter(p=>p.user_id!==u),add:async()=>profiles[reviewer],catches:async(_u,f)=>catches[f]},
  quests:{list:async u=>Object.entries(accepted[u]).map(([quest_id,accepted_at])=>({quest_id,accepted_at})),accept},
  parties:{read:async(u,q)=>party(u,q),invite:async(u,q,f)=>{events.push('invite');const p=party(u,q);p.members.push({user_id:f,display_name:profiles[f].display_name,status:'invited'});return p;},remove:async(u,q,f)=>{events.push('remove');const p=party(u,q);p.members=p.members.filter(m=>m.user_id!==f);return p;},incoming:async u=>[...parties.values()].flatMap(p=>p.members.some(m=>m.user_id===u&&m.status==='invited')?[{quest_id:p.quest_id,quest_title:'Fixture campus route',from:profiles[p.owner_id],invited_at:new Date().toISOString()}]:[]),respond:async(u,q,o,yes)=>{events.push(yes?'join':'decline');const p=party(o,q);p.members.find(m=>m.user_id===u)!.status=yes?'joined':'declined';if(yes)await accept(u,q);return p;}},
  rewards:{complete:async(u,q)=>{events.push('complete');const challenge=q.startsWith('cq-')?get(q.slice(3)):null;if(challenge&&challenge.status!=='live')throw new ApiError(410,'Not live');if(!accepted[u][q])throw new ApiError(409,'Accept first');let saved=catches[u].find(c=>c.source==='quest'&&c.source_id===q);const already_completed=!!saved;if(!saved){saved={id:'reward-'+u+q,source:'quest',source_id:q,variant:'special',caught_at:new Date().toISOString(),rarity:'rare',copies:1,party_size:0};catches[u].push(saved);}return{quest_id:q,already_completed,catch:saved,sticker:{key:challenge?q+'-reward':'star',name:'Fixture reward',source:'quest',variant:'special',rarity:'rare',tags:[],art:'star'}};}},
  challenges:{list:async(u,review)=>{if(review&&u!==reviewer)throw new ApiError(403,'Reviewer required');return challenges.filter(c=>review?c.status==='pending':c.status==='live'||c.author_user_id===u);},orgs:async u=>u===reviewer?[{id:cid,name:'Fixture Team',role:'admin'}]:[],create:async(u,d)=>{events.push('create');const t=new Date(),c={...d,id:cid,by:profiles[u].display_name,author_user_id:u,status:'pending' as const,created_at:t.toISOString(),starts_at:t.toISOString(),ends_at:new Date(+t+86400000*d.days).toISOString()};challenges.push(c);return c;},screen:async(_u,id,s)=>{events.push('screen');return Object.assign(get(id),{ai_screen:s});},review:async(u,id,r)=>{if(u!==reviewer||get(id).author_user_id===u)throw new ApiError(403,'Independent reviewer required');events.push('review');const c=Object.assign(get(id),{status:r.status,review_note:r.reason});stickers.push({key:'cq-'+id+'-reward',name:c.reward.name,rarity:c.reward.rarity,art:c.reward.art,tags:[]});return c;},archive:async(u,id)=>{if(get(id).author_user_id!==u)throw new ApiError(403,'Author only');events.push('archive');return Object.assign(get(id),{status:'archived' as const});},accept:async(u,id)=>accept(u,'cq-'+id)},
}));app.use(aiErrorHandler);
app.get('/__fixture__/state',(_req,res)=>res.json({events,challenges,catches,accepted,parties:[...parties.values()]}));
const vite=await createServer({root:fileURLToPath(new URL('../client/',import.meta.url)),configFile:fileURLToPath(new URL('../client/vite.config.ts',import.meta.url)),server:{middlewareMode:true},plugins:[{name:'fixture-entry',enforce:'pre',transform(_code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {CollectionApp} from './components/CollectionApp';createRoot(document.getElementById('root')!).render(<BrowserRouter><div role="note">LOCAL INTEGRATION FIXTURE — no hosted data</div><CollectionApp accessToken={new URLSearchParams(location.search).has('reviewer')?'fixture-reviewer':'fixture-student'}/></BrowserRouter>);`;}}]});
app.use(vite.middlewares);app.listen(5178,'127.0.0.1',()=>console.log('Local live-mode fixture http://127.0.0.1:5178/challenges (reviewer: ?reviewer=1)'));
