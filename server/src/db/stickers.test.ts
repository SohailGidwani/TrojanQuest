import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { stickerFileSchema } from './schemas.js';
import { createStickerStore } from './stickers.js';
import { validateStickerReferences } from '../../../scripts/seed.js';

const definition = { key:'leavey', name:'Leavey', rarity:'rare', tags:['Library',' library ','study'], art:'book' };

test('catalogue validates rarity and normalizes duplicate tags', () => {
  const result=stickerFileSchema.parse({stickers:[definition]});
  assert.deepEqual(result.stickers[0].tags,['library','study']);
  for(const rarity of ['common','rare','epic','legendary']) {
    assert.equal(stickerFileSchema.safeParse({stickers:[{...definition,rarity}]}).success,true);
  }
  assert.equal(stickerFileSchema.safeParse({stickers:[definition,definition]}).success,false);
  assert.equal(stickerFileSchema.safeParse({stickers:[{...definition,rarity:'uncommon'}]}).success,false);
});

test('exclusive windows require explicit zones, an end, and correctly ordered boundaries', () => {
  const exclusive={...definition,rarity:'exclusive',available_from:'2026-11-01T00:00:00-07:00',available_until:'2026-12-01T00:00:00-08:00'};
  assert.equal(stickerFileSchema.safeParse({stickers:[exclusive]}).success,true);
  assert.equal(stickerFileSchema.safeParse({stickers:[{...exclusive,available_from:undefined}]}).success,true);
  for(const bad of [
    {...exclusive,available_until:undefined}, {...exclusive,available_until:exclusive.available_from},
    {...exclusive,available_until:'2026-10-01T00:00:00Z'}, {...exclusive,available_until:'2026-12-01'},
    {...exclusive,available_until:'2026-12-01T00:00:00'}, {...exclusive,rarity:'rare'},
  ]) assert.equal(stickerFileSchema.safeParse({stickers:[bad]}).success,false);
});

test('asset paths and unknown payload fields are rejected', () => {
  for(const image of ['../outside.svg','https://example.com/image.png','folder/sticker.png','.hidden.svg','sticker.gif']) {
    assert.equal(stickerFileSchema.safeParse({stickers:[{...definition,image}]}).success,false);
  }
  assert.equal(stickerFileSchema.safeParse({stickers:[{...definition,image:'leavey-night.webp'}]}).success,true);
  assert.equal(stickerFileSchema.safeParse({stickers:[{...definition,unapproved:true}]}).success,false);
});

test('spot seeding requires real catalogue keys instead of silently defaulting rarity', () => {
  const stickers=stickerFileSchema.parse({stickers:[definition]}).stickers;
  const spot={id:'leavey',name:'Leavey',lat:34,lng:-118,category:'study' as const,card_text:'Test',tip:'Test',sticker_key:'leavey'};
  assert.doesNotThrow(()=>validateStickerReferences([spot],stickers));
  assert.throws(()=>validateStickerReferences([{...spot,sticker_key:'missing'}],stickers),/missing sticker keys: missing/);
});

test('catalogue read includes expired definitions and omits nullable database fields', async () => {
  const client=createClient('https://database.example','test-key',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async url=>{
      const query=new URL(String(url)).searchParams;
      assert.equal(query.get('order'),'key.asc');
      assert.equal(query.has('available_until'),false);
      return Response.json([{key:'ended',name:'Ended',rarity:'exclusive',tags:['event'],image:null,art:'flag',lore:null,
        available_from:null,available_until:'2026-01-01T00:00:00Z'}]);
    }},
  });
  assert.deepEqual(await createStickerStore(()=>client).list(),[{key:'ended',name:'Ended',rarity:'exclusive',tags:['event'],art:'flag',available_until:'2026-01-01T00:00:00Z'}]);
});
