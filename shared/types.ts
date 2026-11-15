/** Public API contract. Coordinate changes with the team before changing these shapes. */
export type Category = 'study' | 'eat' | 'hangout' | 'chill' | 'essentials';
export type Variant = 'morning' | 'day' | 'night' | 'seasonal' | 'special';
export type Source = 'spot' | 'popup' | 'org' | 'quest';
export type PopupStickerKey = 'bubble' | 'star' | 'book' | 'bowl' | 'leaf' | 'bolt' | 'heart' | 'flag';

export interface Sticker {
  key: string;
  name: string;
  source: Source;
  variant: Variant;
  colors?: string[];
  lore?: string;
}
export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: Category;
  card_text: string;
  tip: string;
  sticker_key: string;
}
export interface Popup {
  id: string;
  lat: number;
  lng: number;
  brand: string;
  freebies: string[];
  sticker: Sticker & { key: PopupStickerKey; source: 'popup'; variant: 'special'; colors: string[]; lore: string };
  expires_at: string;
  confirmations: number;
  status: 'live' | 'expired';
}
export interface OrgDrop {
  id: string;
  org_name: string;
  event_name: string;
  lat: number;
  lng: number;
  starts_at: string;
  ends_at: string;
  sticker_key: string;
}
export interface Catch {
  id: string;
  source: Source;
  source_id: string;
  variant: Variant;
  caught_at: string;
}
export interface Quest {
  id: string;
  title: string;
  blurb: string;
  spot_ids: string[];
  reward_sticker_key: string;
}
export interface Friend { user_id: string; display_name: string; friend_code: string }
export interface Profile extends Friend {}
export interface ApiErrorResponse { error: string }

export interface Position { lat: number; lng: number }
export interface CatchRequest extends Position { source: Source; source_id: string }
export type CollectionFailureReason = 'too_far' | 'not_found' | 'not_started' | 'expired' | 'quest_not_available';
export interface CollectionFailure { ok: false; reason: CollectionFailureReason }
export type CatchResult = {
  ok: true;
  sticker: Sticker;
  variant: Variant;
  already_caught: boolean;
} | CollectionFailure;
export interface PopupConfirmation {
  expires_at: string;
  confirmations: number;
  already_confirmed: boolean;
}
export type ConfirmPopupResult = ({ ok: true } & PopupConfirmation) | CollectionFailure;

// Quest ordering, photo proof, avatars and wagers are deliberately undecided.
export interface PopupRecord extends Popup { created_at: string }
export type NewPopup = Omit<Popup, 'id'> & { reporter_id: string };
export interface NearbyPopupQuery {
  lat: number;
  lng: number;
  withinMeters: number;
  since: string;
  brand: string;
}
export interface PopupStore {
  createPopup(input: NewPopup): Promise<Popup>;
  findNearbyPopup(input: NearbyPopupQuery): Promise<PopupRecord | null>;
}
