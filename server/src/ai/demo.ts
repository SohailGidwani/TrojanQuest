import { randomUUID } from 'node:crypto';
import type { PopupRecord, PopupStore } from './contracts.js';
import { distanceMeters } from './service.js';

export function demoEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.DEMO_MODE !== 'true') return false;
  if (env.NODE_ENV !== 'development') throw new Error('DEMO_MODE requires NODE_ENV=development.');
  return true;
}

export function createDemoStore(now = () => new Date()): PopupStore & { list: () => PopupRecord[] } {
  // shortcut: local demo pins live in memory; replace with Kartik's helpers for persistence/Realtime.
  const pins: PopupRecord[] = [];
  const list = () => pins.filter(pin => pin.status === 'live' && Date.parse(pin.expires_at) > now().getTime());
  return {
    list,
    async createPopup(input) {
      const { lat, lng, brand, freebies, sticker, expires_at, confirmations, status } = input;
      const pin: PopupRecord = { id: `demo_${randomUUID()}`, lat, lng, brand, freebies, sticker, expires_at, confirmations, status, created_at: now().toISOString() };
      pins.push(pin);
      return pin;
    },
    async findNearbyPopup(query) {
      return list().find(pin => pin.brand.trim().toLowerCase() === query.brand.trim().toLowerCase()
        && Date.parse(pin.created_at) >= Date.parse(query.since)
        && distanceMeters(pin, query) <= query.withinMeters) ?? null;
    },
  };
}
