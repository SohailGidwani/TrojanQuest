import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeading } from '../components/Card'
import { Icon } from '../components/Icon'
import { Pin } from '../components/Pixel'
import { RequestError, requestJSON } from '../components/api'
import type { Citation } from '../components/types'
interface Message { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; retry?: string }
const suggestions = ['Where can I study late?', 'How can I find tutoring?', 'Where are student health resources?']
export function GuideChat({ accessToken }: { accessToken?: string }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight }, [messages, pending])
  async function ask(text: string, retry = false) {
    const value = text.trim()
    if (!value || pending || value.length > 1000) return
    if (!retry) setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text: value }])
    setQuestion(''); setPending(true)
    const request = new AbortController(); controller.current = request
    try {
      const result = await requestJSON<{ answer: string; citations: Citation[] }>('/api/guide/ask', { body: { question: value }, accessToken, signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]) })
      if (!request.signal.aborted) setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: result.answer, citations: result.citations.filter(c => typeof c.url === 'string' && c.url.startsWith('https://')) }])
    } catch (cause) {
      if (!request.signal.aborted) {
        const text = cause instanceof RequestError && cause.status === 503 ? 'The guide is still waiting for its saved USC resources. Try again after the campus content is added.' : cause instanceof RequestError && (cause.status === 401 || cause.status === 403) ? 'A verified USC session is needed. Sign-in is currently deferred; the local demo works without it.' : 'The guide couldn’t answer right now. Please try again.'
        setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text, retry: value }])
      }
    } finally { if (!request.signal.aborted) setPending(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void ask(question) }
  return <><PageHeading title="A little campus know-how.">Questions are welcome. Guesswork isn’t.</PageHeading>
    <div className="guide-layout"><section className="chat-card" aria-label="Campus guide"><header className="chat-header"><span className="guide-avatar"><Pin size={36}/></span><div><h2>Your campus guide</h2><p>Grounded in USC resources</p></div><span className="source-badge"><Icon name="check" size={13}/>Sources included</span></header><div className="chat-messages" ref={scrollArea} role="log" aria-label="Conversation" aria-live="polite">
      {messages.length ? messages.map(message => <article key={message.id} className={`chat-message ${message.role}${message.retry ? ' message-error' : ''}`}><span className="message-label">{message.role === 'user' ? 'You' : 'Campus guide'}</span><p>{message.text}</p>{message.citations?.length ? <div className="message-sources">{message.citations.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13}/>{source.title}</a>)}</div> : null}{message.retry ? <button className="text-button" disabled={pending} onClick={() => void ask(message.retry!, true)}><Icon name="refresh" size={14}/>Try again</button> : null}</article>) : <div className="guide-welcome"><div className="guide-welcome-art"><Pin size={72} mood="think"/></div><h2>New here? Curious? Both?</h2><p>Ask about studying, campus resources, or finding your feet at USC. I’ll point you to the source.</p><div className="question-suggestions">{suggestions.map(text => <button key={text} onClick={() => void ask(text)}>{text}<Icon name="arrow" size={15}/></button>)}</div></div>}
      {pending ? <div className="guide-thinking" role="status"><Icon name="search" size={16}/>Checking the saved USC sources…</div> : null}
    </div><form className="chat-compose" onSubmit={submit}><label className="sr-only" htmlFor="campus-question">Your campus question</label><textarea id="campus-question" placeholder="What would you like to know?" value={question} maxLength={1000} rows={2} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question) } }} disabled={pending}/><button className="send-button" aria-label="Send question" disabled={pending || !question.trim()}><Icon name="arrow" size={20}/></button></form><p className="chat-footnote">Answers use saved USC pages. Check the linked source for current details.</p></section>
      <aside className="guide-side"><span className="small-label">A guide with receipts</span><h2>Good answers start with real sources.</h2><p>Look for a source link below each supported answer. If the saved pages don’t cover a question, the guide will say so.</p><div className="guide-principle"><Icon name="check"/><span>USC resources, cited</span></div><div className="guide-principle"><Icon name="lock"/><span>No location needed</span></div><div className="guide-principle"><Icon name="guide"/><span>Here for campus questions</span></div><p className="quiet-note">Need urgent help? Contact the appropriate campus service directly.</p></aside></div>
  </>
}
