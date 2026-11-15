import type { Catch } from '../../../shared/types.js';

/** Keep account IDs, GPS and internal database fields out of book responses. */
export function publicCatch(row: Catch): Catch {
  const { id, source, source_id, variant, caught_at } = row;
  return { id, source, source_id, variant, caught_at,
    ...(source === 'quest' ? {
      ...(row.rarity ? { rarity: row.rarity } : {}),
      ...(row.copies === undefined ? {} : { copies: row.copies }),
      ...(row.party_size === undefined ? {} : { party_size: row.party_size }),
    } : {}),
  };
}
