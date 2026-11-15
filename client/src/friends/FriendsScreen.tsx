import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CollectionData } from '../components/useCollection'
import type { Catch, Spot } from '../components/types'
import { PageHeading, Card, EmptyState } from '../components/Card'
import { Icon } from '../components/Icon'
import { StickerBook } from '../stickerbook/StickerBook'
import { demoFriendBooks } from '../components/mock'

export function FriendsScreen({ data, onSpot }: { data: CollectionData; onSpot: (spot: Spot, catches: Catch[]) => void }) {
  const { friendId } = useParams()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [bookState, setBookState] = useState<{ id: string; revision: number; catches: Catch[]; error: string }>({ id: '', revision: 0, catches: [], error: '' })
  const [bookRevision, setBookRevision] = useState(0)
  const friend = data.friends.find(person => person.user_id === friendId)
  const friendCode = data.profile?.friend_code
  const bookLoading = !!friendId && (friendId !== bookState.id || bookRevision !== bookState.revision)
  const book = bookState.catches
  const bookError = bookState.error
  const loadBook = data.friendBook
  useEffect(() => {
    if (!friendId) return
    const controller = new AbortController()
    void loadBook(friendId, controller.signal).then(catches => { if (!controller.signal.aborted) setBookState({ id: friendId, revision: bookRevision, catches, error: '' }) }).catch(() => { if (!controller.signal.aborted) setBookState({ id: friendId, revision: bookRevision, catches: [], error: 'We couldn’t open this sticker book. Try again in a moment.' }) })
    return () => controller.abort()
  }, [friendId, loadBook, bookRevision])
  if (friendId) return <><Link to="/friends" className="back-link"><Icon name="back" size={17}/>Back to friends</Link>{bookLoading ? <div className="loading-state" role="status">Opening their sticker book…</div> : bookError ? <Card><EmptyState title="This book is taking a moment" action={<button className="button secondary" onClick={() => setBookRevision(value => value + 1)}>Try again</button>}>{bookError}</EmptyState></Card> : <StickerBook spots={data.spots} catches={book} quests={data.quests} onSpot={spot => onSpot(spot, book)} friendName={friend?.display_name ?? 'Your friend'}/>}</>
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(''); setNotice('')
    try { const person = await data.addFriend(code); setCode(''); setNotice(`${person.display_name} is in your friends. Open their book below.`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'We couldn’t add that friend.') }
    finally { setPending(false) }
  }
  return <><PageHeading title="Better with a few friends.">Trade a code. Share your discoveries. Find your next little detour.</PageHeading>
    <div className="friends-top"><Card className="friend-code-card"><div className="friend-code-icon"><Icon name="friends" size={28}/></div><span className="small-label">Your friend code</span><h2>{friendCode || 'Coming soon'}</h2><p>Your friends can see your sticker book and display name. Your location stays yours.</p>{friendCode ? <button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(friendCode); setNotice('Friend code copied.') } catch { setNotice(`Your code is ${friendCode}. Select and copy it above.`) } }}><Icon name="copy" size={17}/>Copy code</button> : null}</Card><Card className="add-friend-card"><h2>Someone you know?</h2><p>Ask for their code to add them to your circle.</p><form onSubmit={add}><label className="field-label" htmlFor="friend-code">Friend code</label><div className="friend-code-input"><input id="friend-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} value={code} onChange={event => setCode(event.target.value)} placeholder={data.isDemo ? 'Try TQRINA' : 'Enter a friend code'} required/><button className="button primary" disabled={pending}>{pending ? 'Adding…' : 'Add friend'}<Icon name="arrow" size={17}/></button></div>{data.isDemo ? <small className="field-hint">Demo codes: TQRINA and TQLEO. Maya is already here.</small> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</form></Card></div>
    {notice ? <p className="inline-success" role="status"><Icon name="check" size={17}/>{notice}</p> : null}
    <div className="section-heading"><h2>Your people</h2><span>{data.friends.length} {data.friends.length === 1 ? 'friend' : 'friends'}</span></div>
    {data.friends.length ? <div className="friend-list">{data.friends.map((person, index) => <Link key={person.user_id} to={`/friends/${encodeURIComponent(person.user_id)}`} className="friend-row"><span className={`avatar avatar-${index % 3}`}>{person.display_name.slice(0, 1)}</span><span className="friend-name"><strong>{person.display_name}</strong><small>{data.isDemo ? `${new Set(demoFriendBooks[person.user_id]?.filter(c => c.source === 'spot').map(c => c.source_id)).size} campus places discovered` : 'A fellow campus explorer'}</small></span><span className="friend-preview" aria-hidden="true"><span>✦</span><span>✿</span><span>★</span></span><span className="view-book">Open book<Icon name="arrow" size={18}/></span></Link>)}</div> : <Card><EmptyState title="Your circle starts with a code">Add a friend above to get a peek at their campus discoveries.</EmptyState></Card>}
    <p className="privacy-note"><Icon name="lock" size={16}/>Just discoveries. No location sharing, leaderboards, or messages.</p>
  </>
}
