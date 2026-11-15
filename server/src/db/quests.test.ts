import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createQuestStore } from './quests.js';
import { authoredQuestsFileSchema } from './schemas.js';
import { loadAuthoredQuests, validateQuestReferences } from './quest-content.js';

const actor='11111111-1111-4111-8111-111111111111';
const quest={id:'test-tour',title:'Test tour',blurb:'Fixture only',spot_ids:['one','two','three'],reward_sticker_key:'test-reward'};
const acceptance={quest_id:quest.id,accepted_at:'2026-11-15T00:00:00Z',already_accepted:false};
async function withFile(data: unknown, run: (path: string) => Promise<void>) {
  const dir=await mkdtemp(join(tmpdir(),'trojanquest-acceptance-'));
  const path=join(dir,'quests.json');
  await writeFile(path,JSON.stringify(data));
  try { await run(path); }
  finally { await unlink(path); await rmdir(dir); }
}

test('authored quests reject duplicate IDs/stops and require three to five distinct stops', () => {
  assert.equal(authoredQuestsFileSchema.safeParse([quest]).success,true);
  for(const data of [[quest,quest],[{...quest,spot_ids:['one','one','two']}],
    [{...quest,spot_ids:['one','two']}],[{...quest,spot_ids:['1','2','3','4','5','6']}],
    [{...quest,id:' '}],[{...quest,reward_sticker_key:'Bad Key'}],[{...quest,extra:true}]]) {
    assert.equal(authoredQuestsFileSchema.safeParse(data).success,false);
  }
});

test('pre-seed quest checks validate real stop and reward references', () => {
  const spots=['one','two','three'].map(id=>({id,name:id,lat:0,lng:0,category:'study' as const,card_text:'Test',tip:'Test',sticker_key:'test-spot'}));
  const stickers=[{key:'test-spot',name:'Test',rarity:'common' as const,tags:[]},{key:'test-reward',name:'Reward',rarity:'rare' as const,tags:[]}];
  assert.doesNotThrow(()=>validateQuestReferences([quest],spots,stickers));
  assert.throws(()=>validateQuestReferences([quest],spots.slice(1),stickers),/missing spot one/);
  assert.throws(()=>validateQuestReferences([quest],spots,stickers.slice(0,1)),/missing reward sticker test-reward/);
  assert.throws(()=>validateQuestReferences([quest],spots,stickers.slice(1)),/missing sticker test-spot/);
});

test('acceptance RPC receives only the server-authored definition and verified actor', async () => {
  await withFile([quest],async path=>{
    const client=createClient('https://database.example','test-key',{
      auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (url,init)=>{
        assert.match(String(url),/\/rpc\/accept_authored_quest$/);
        assert.deepEqual(JSON.parse(String(init?.body)),{p_user_id:actor,p_quest:quest});
        return Response.json({...acceptance,user_id:actor,quest_definition:quest});
      }},
    });
    assert.deepEqual(await createQuestStore(()=>client,path).accept(actor,quest.id),acceptance);
  });
});

test('unknown IDs and missing/invalid authored files never call Supabase', async () => {
  let calls=0;
  const client=()=>{calls++;throw new Error('Must not call database');};
  await withFile([quest],async path=>{
    await assert.rejects(createQuestStore(client,path).accept(actor,'unknown'),{status:404});
    await assert.rejects(createQuestStore(client,path+'-missing').accept(actor,quest.id),{status:503});
    await assert.rejects(createQuestStore(client,path).accept('local-demo',quest.id));
    await writeFile(path,'not json');
    await assert.rejects(createQuestStore(client,path).accept(actor,quest.id),{status:503});
  });
  await withFile([quest,quest],async path=>{
    await assert.rejects(createQuestStore(client,path).accept(actor,quest.id),{status:503});
  });
  assert.equal(calls,0);
});

test('accepted-quest list needs no authored file and strips actor/snapshot fields', async () => {
  const client=createClient('https://database.example','test-key',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (url,init)=>{
      assert.match(String(url),/\/rpc\/list_quest_acceptances$/);
      assert.deepEqual(JSON.parse(String(init?.body)),{p_user_id:actor});
      return Response.json([{...acceptance,user_id:actor,quest_definition:quest}]);
    }},
  });
  assert.deepEqual(await createQuestStore(()=>client,'missing-file').list(actor),[{quest_id:quest.id,accepted_at:acceptance.accepted_at}]);
});

for(const [code,status,message] of [
  ['42501',403,'A verified USC account is required for this action.'],
  ['22023',400,'Invalid quest fields.'],
  ['PT409',409,'This quest reward is not available yet.'],
  ['PT410',410,'This quest reward has ended.'],
  ['PT503',503,'Seed this quest’s spots and reward catalogue before accepting it.'],
  ['PGRST202',503,'Apply the backend Supabase migration before using data routes.'],
] as const) {
  test(`acceptance database error ${code} maps to safe ${status}`,async ()=>{
    await withFile([quest],async path=>{
      const client=createClient('https://database.example','test-key',{
        auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async ()=>Response.json({code,message:'private SQL'},{status:400})},
      });
      await assert.rejects(createQuestStore(()=>client,path).accept(actor,quest.id),{status,message});
    });
  });
}

test('quest loader reads authored arrays without inventing definitions',async ()=>{
  await withFile([quest],async path=>assert.deepEqual(await loadAuthoredQuests(path),[quest]));
});
