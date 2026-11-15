import { Icon } from '../components/Icon'

export function WelcomeScreen({ onBegin }: { onBegin: () => void }) {
  return <section className="orientation-welcome" aria-labelledby="welcome-title">
    <div className="welcome-copy">
      <span className="welcome-eyebrow">Welcome, Trojan · Your first chapter</span>
      <h1 id="welcome-title">A big campus.<br/>One place to begin.</h1>
      <p>New faces. New paths. A whole campus to make your own.</p>
      <p>For many Trojans, it starts at orientation. Your TrojanQuest starts there too: <strong>Bovard Auditorium.</strong></p>
      <button className="button primary" onClick={onBegin}>Let’s find Bovard<Icon name="arrow" size={18}/></button>
      <p className="welcome-permission"><Icon name="pin" size={15}/>Location stays off until you choose to use it.</p>
    </div>
    <div className="orientation-ticket">
      <div className="ticket-top"><span>Your first discovery</span><Icon name="spark" size={21}/></div>
      <svg className="bovard-drawing" viewBox="0 0 400 285" role="img" aria-labelledby="bovard-drawing-title">
        <title id="bovard-drawing-title">An original illustration inspired by Bovard Auditorium</title>
        <circle cx="285" cy="73" r="43" fill="#f2d27c"/>
        <path d="M25 248h350" stroke="#b6a079" strokeWidth="2"/>
        <path d="M53 121h294v122H53z" fill="#d6ae80"/>
        <path d="m43 121 32-26h250l32 26z" fill="#8d1836"/>
        <path d="M153 78h94v165h-94z" fill="#e9c79d"/>
        <path d="m140 78 60-37 60 37z" fill="#8d1836"/>
        <path d="M171 72v-33h58v33" fill="#d6ae80"/>
        <path d="m164 39 36-23 36 23z" fill="#6f122a"/>
        <circle cx="200" cy="57" r="11" fill="#fff8e8" stroke="#9b7957" strokeWidth="3"/>
        <path d="M200 50v7l5 3" stroke="#8d1836" strokeWidth="2" fill="none"/>
        <path d="M181 243v-56a19 19 0 0 1 38 0v56" fill="#6b4236"/>
        <path d="M179 136v-15a21 21 0 0 1 42 0v15z" fill="#fff4d8" stroke="#b28b63" strokeWidth="5"/>
        <path d="M200 101v35m-21-13h42" stroke="#b28b63" strokeWidth="3"/>
        {[83, 116, 270, 303].map(x => <g key={x}><path d={`M${x} 169v-20a9 9 0 0 1 18 0v20z`} fill="#fff4d8"/><path d={`M${x} 219v-20a9 9 0 0 1 18 0v20z`} fill="#8c654e"/></g>)}
        <path d="M143 249h114m-123 7h132m-142 7h152" stroke="#bd9c77" strokeWidth="5"/>
        <path d="M34 246v-59m331 59v-59" stroke="#7e8863" strokeWidth="5"/>
        <path d="M34 211c-29-5-26-39 0-48 26 9 29 43 0 48Zm331 0c-29-5-26-39 0-48 26 9 29 43 0 48Z" fill="#a8b38a"/>
      </svg>
      <span className="ticket-number">01 / Where it begins</span><h2>Bovard Auditorium</h2>
      <p>Find your way here. Collect your first sticker. Then choose where your story goes next.</p>
      <div className="ticket-bottom"><Icon name="lock" size={16}/><span>The rest of campus unlocks after Bovard.</span></div>
    </div>
  </section>
}
