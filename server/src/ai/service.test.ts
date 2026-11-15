import test from 'node:test';
import assert from 'node:assert/strict';
import { reportPopup, suggestQuests, answerGuide, designSticker, type AiDependencies } from './service.js';
import { Ollama } from './ollama.js';
import type { PopupStore } from './contracts.js';

const now = new Date('2026-11-15T00:00:00Z');
const verdict = { accepted: true, reject_reason: null, brand: 'Bubble Co.', freebies: ['tote bags'], duration_minutes: 90,
  sticker: { key: 'bubble', name: 'Lathergeist', colors: ['#7FD3F7', '#FFFFFF'], lore: 'Free samples flow.' } };
const saved = { id: 'p_1', lat: 34.0257, lng: -118.2856, ...verdict, expires_at: '2026-11-15T00:30:00.000Z', confirmations: 1, status: 'live', created_at: now.toISOString() };
const quest = { id: 'q1', title: 'Essentials', blurb: 'Start here', spot_ids: ['s1', 's2', 's3'], reward_sticker_key: 'star' };
function deps(output: unknown = verdict): AiDependencies & { store: PopupStore } {
  const store: PopupStore = { findNearbyPopup: async () => null, createPopup: async input => ({ ...input, id: 'p_1' }) };
  return {
    model: new Ollama({ fetch: async () => new Response(JSON.stringify({ message: { content: JSON.stringify(output) } })) }),
    store, getStore: async () => store,
    now: () => now,
  };
}
const input = { photo: Buffer.from('image'), lat: 34.0257, lng: -118.2856, userId: 'u1' };

test('accepted photo becomes a special sticker with bounded unconfirmed expiry', async () => {
  const result = await reportPopup(input, deps());
  assert.equal(result.accepted, true);
  assert.equal(result.popup?.id, 'p_1');
  assert.equal(result.popup?.sticker.source, 'popup');
  assert.equal(result.popup?.sticker.variant, 'special');
  assert.equal(result.popup?.expires_at, '2026-11-15T00:30:00.000Z');
});

test('non-pop-up verdict cannot write a pin', async () => {
  const d = deps({ accepted: false, reject_reason: 'No event or giveaway visible.', brand: null, freebies: [], duration_minutes: null, sticker: null });
  d.store.createPopup = async () => { throw new Error('must not write'); };
  const result = await reportPopup(input, d);
  assert.equal(result.accepted, false);
  assert.equal(result.popup, null);
  assert.match(result.reject_reason!, /No event/);
});

test('nearby same-brand report merges into the existing pin', async () => {
  const d = deps();
  d.store.findNearbyPopup = async () => saved as never;
  d.store.createPopup = async () => { throw new Error('duplicate pin'); };
  assert.equal((await reportPopup(input, d)).merged_into, 'p_1');
});

for (const [name, change] of [
  ['over 100m away', { lat: 34.04 }],
  ['older than two hours', { created_at: '2026-11-14T21:59:59Z' }],
  ['expired', { expires_at: '2026-11-14T23:59:59Z' }],
  ['a different brand', { brand: 'Other Co.' }],
] as const) {
  test(`does not merge a candidate ${name}`, async () => {
    const d = deps();
    d.store.findNearbyPopup = async () => ({ ...saved, ...change }) as never;
    assert.equal((await reportPopup(input, d)).merged_into, null);
  });
}

test('invalid AI sticker data is rejected before storage', async () => {
  await assert.rejects(reportPopup(input, deps({ ...verdict, sticker: { ...verdict.sticker, colors: ['red'] } })));
});

test('quest suggestions return only authored quests, preserving unranked ones', async () => {
  const result = await suggestQuests('late night', [quest, { ...quest, id: 'q2' }], deps({ quest_ids: ['q2', 'invented', 'q2'] }).model);
  assert.deepEqual(result.map(q => q.id), ['q2', 'q1']);
  assert.equal(result[0].title, 'Essentials');
});

test('guide returns verbatim source passages with server-owned citations', async () => {
  const result = await answerGuide('Where?', [{ title: 'Health', url: 'https://studenthealth.usc.edu/', text: 'Visit the health center.' }], deps({ passages: [{ source: 0, quote: 'Visit the health center.' }] }).model);
  assert.deepEqual(result, { answer: 'Visit the health center.', citations: [{ title: 'Health', url: 'https://studenthealth.usc.edu/' }] });
});

test('guide refuses invented passages and unrecognized source IDs', async () => {
  const pages = [{ title: 'Health', url: 'https://studenthealth.usc.edu/', text: 'Visit the health center.' }];
  const result = await answerGuide('Hours?', pages, deps({ passages: [{ source: 0, quote: 'Open 24/7' }, { source: 9, quote: 'Visit the health center.' }] }).model);
  assert.deepEqual(result.citations, []);
  assert.match(result.answer, /couldn.t find/i);
});

test('Ollama sends native structured vision requests without persisting images', async () => {
  let body: Record<string, any> = {};
  const model = new Ollama({ fetch: async (_url, init) => {
    body = JSON.parse(init!.body as string);
    return new Response(JSON.stringify({ message: { content: JSON.stringify(verdict) } }));
  } });
  await reportPopup(input, { ...deps(), model });
  assert.equal(body.stream, false);
  assert.equal(body.format.type, 'object');
  assert.deepEqual(body.messages[1].images, ['aW1hZ2U=']);
});

test('Ollama failures become a safe upstream error', async () => {
  const model = new Ollama({ fetch: async () => new Response('private upstream details', { status: 500 }) });
  await assert.rejects(reportPopup(input, { ...deps(), model }), /Ollama/);
});

test('a sticker description becomes an original design with an uppercase 3-color palette', async () => {
  let sent: { options?: { temperature?: number }; messages?: { content: string }[] } = {};
  const model = new Ollama({ fetch: async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ accepted: true, reject_reason: null,
      sticker: { key: 'book', name: 'Lamplight Owl, Keeper of the Third Floor Silence', colors: ['#2b3a67', '#fff4c2', '#14182e'], lore: 'Stays up so you can too.' } }) } }));
  } });
  const result = await designSticker({ prompt: 'a sleepy owl reading by lamplight', role: 'reward', quest_title: 'Late-night crawl' }, model);
  assert.equal(result.accepted, true);
  assert.equal(result.sticker?.key, 'book');
  assert.ok(result.sticker!.name.length <= 40);
  assert.deepEqual(result.sticker?.colors, ['#2B3A67', '#FFF4C2', '#14182E']);
  assert.equal(sent.options?.temperature, 0.8);
  assert.ok(sent.messages?.[1].content.includes('sleepy owl'));
});

test('refused sticker ideas return a reason and no design', async () => {
  const model = new Ollama({ fetch: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ accepted: false, reject_reason: 'Brand logos are not allowed.', sticker: null }) } })) });
  const result = await designSticker({ prompt: 'the logo of a soda company', role: 'stop' }, model);
  assert.deepEqual(result, { accepted: false, reject_reason: 'Brand logos are not allowed.', sticker: null });
});
