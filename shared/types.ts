/** Public API contract. Coordinate changes with the team before changing these shapes. */
export type Category = 'study' | 'eat' | 'hangout' | 'chill' | 'essentials';
export type Variant = 'morning' | 'day' | 'night' | 'seasonal' | 'special';
export type Source = 'spot' | 'popup' | 'org' | 'quest';
export type PopupStickerKey = 'bubble' | 'star' | 'book' | 'bowl' | 'leaf' | 'bolt' | 'heart' | 'flag';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'exclusive';
export interface StickerDefinition {
  key: string;
  name: string;
  rarity: Rarity;
  tags: string[];
  image?: string;
  art?: string;
  lore?: string;
  available_from?: string;
  available_until?: string;
  /** Background, highlight and outline, for designed challenge stickers. */
  colors?: string[];
}

export interface Sticker extends Partial<StickerDefinition> {
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
  rarity?: Rarity;
  copies?: 1 | 2;
  /** Other joined travellers; excludes the collector. */
  party_size?: number;
}
export interface Quest {
  id: string;
  title: string;
  blurb: string;
  spot_ids: string[];
  reward_sticker_key: string;
}
export interface QuestAcceptance { quest_id: string; accepted_at: string }
export interface QuestAcceptanceResult extends QuestAcceptance { already_accepted: boolean }
export type ChallengeAuthor = 'student' | 'org';
export type ChallengeStatus = 'pending' | 'live' | 'rejected' | 'archived';
export type ChallengeArt = PopupStickerKey;
export type ChallengePalette = [string, string, string];
export interface ChallengeStop {
  name: string;
  lore: string;
  place: { kind: 'campus'; spot_id: string } | ({ kind: 'point' } & Position);
  art: ChallengeArt;
  colors?: ChallengePalette;
}
export interface ChallengeReward {
  name: string;
  art: ChallengeArt;
  rarity: 'common' | 'rare' | 'epic';
  lore: string;
  colors?: ChallengePalette;
}
export interface CreateChallengeRequest {
  title: string;
  blurb: string;
  author: ChallengeAuthor;
  org_id?: string;
  days: number;
  stops: ChallengeStop[];
  reward: ChallengeReward;
}
/** UUID id expands to quest cq-<id>, pinned spots cq-<id>-<position>, reward cq-<id>-reward. */
export interface Challenge extends Omit<CreateChallengeRequest, 'days'> {
  id: string;
  by: string;
  author_user_id: string;
  status: ChallengeStatus;
  starts_at: string;
  created_at: string;
  ends_at: string;
  review_note?: string;
  ai_screen?: { status: 'passed' | 'flagged' | 'unavailable'; reason: string; checked_at?: string };
}
export interface ChallengeOrg { id: string; name: string; role: 'admin' | 'member' }
export interface ReviewChallengeRequest { status: 'live' | 'rejected'; reason?: string }
export interface QuestCompletionResult {
  quest_id: string;
  already_completed: boolean;
  catch: Catch;
  sticker: Sticker;
}
export type QuestInviteStatus = 'invited' | 'joined' | 'declined';
export interface QuestPartyMember { user_id: string; display_name: string; status: QuestInviteStatus }
export interface QuestParty { quest_id: string; owner_id: string; members: QuestPartyMember[] }
export interface QuestInvite { quest_id: string; quest_title: string; from: Friend; invited_at: string }
export interface InviteToQuestRequest { friend_id: string }
export interface RespondToQuestInviteRequest { accept: boolean }
export interface Friend { user_id: string; display_name: string; friend_code: string }
export interface Profile extends Friend {}
export interface SaveProfileRequest { display_name: string }
export interface AddFriendRequest { friend_code: string }
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
