import type { ReactNode } from 'react'

// Pixel art for TrojanQuest's personality: Pin the mascot, dialogue boxes and nav icons.
// Each sprite is a grid of characters; every character maps to one palette colour and '.' is transparent.
const palette: Record<string, string> = {
  K: '#2d2433', R: '#c8352f', r: '#e8635c', D: '#8a1f1e', W: '#ffffff', Y: '#ffcc00', y: '#cc9f00',
  p: '#ff9c8a', P: '#6b4220', G: '#5dbb55', g: '#2f8f3e', B: '#3fb7e8',
}
const grid = (size: number, rows: string[]) => Array.from({ length: size }, (_, i) => (rows[i] ?? '').padEnd(size, '.').slice(0, size))

const pinBody = ['.....KKKKKK', '....KRRRRRRK', '...KRRRRRRRRK']
const pinTail = ['...KRRRRRRRRK', '....KRRRRRRK', '.....KRRRRK', '......KRRK', '.......KK']
const sprites = {
  pin: grid(16, ['........YY', '.......Y', ...pinBody, '..KRWWRRRRWWRK', '..KRWKRRRRWKRK', '..KRWWRRRRWWRK', '..KRpRRRRRRpRK', '..KRRRRWWRRRRK', ...pinTail]),
  pinCheer: grid(16, ['........YY', '.......Y', ...pinBody, '..KRRRRRRRRRRK', '..KRKWKRRKWKRK', '..KRRRRRRRRRRK', '..KRpRWWWWRpRK', '..KRRRRWWRRRRK', ...pinTail]),
  pinThink: grid(16, ['........YY', '.......Y', ...pinBody, '..KRWWRRRRWWRK', '..KRKWRRRRKWRK', '..KRWWRRRRWWRK', '..KRpRRRRRRpRK', '..KRRRRRKKRRRK', ...pinTail]),
}
export const pixelIcons = {
  pin: grid(12, ['...KKKKKK', '..KRRRRRRK', '.KRRRWWRRRK', '.KRRWWWWRRK', '.KRRRWWRRRK', '..KRRRRRRK', '...KRRRRK', '....KRRK', '.....KK', '', '...KKKKKK', '']),
  book: grid(12, ['KKKKKKKKKKK', 'KRRRRRRRRRK', 'KRYYYYYYYRK', 'KRRRRRRRRRK', 'KRRRYYYRRRK', 'KRRRRRRRRRK', 'KRRRRRRRRRK', 'KRRRRRRRRRK', 'KWWWWWWWWWK', 'KKKKKKKKKKK']),
  trophy: grid(12, ['KKKKKKKKKKK', 'KYYYYYYYYYK', 'KYYYYYYYYyK', '.KYYYYYYyK', '..KYYYYyK', '...KYYyK', '....KYK', '....KyK', '...KYYyK', '..KKKKKKK']),
  heart: grid(12, ['', '.KKK...KKK', 'KRrRK.KRRRK', 'KrRRRKRRRRK', 'KRRRRRRRRRK', '.KRRRRRRRK', '..KRRRRRK', '...KRRRK', '....KRK', '.....K']),
  chat: grid(12, ['KKKKKKKKKKK', 'KWWWWWWWWWK', 'KWKKKKKKWWK', 'KWWWWWWWWWK', 'KWKKKKWWWWK', 'KWWWWWWWWWK', 'KKKWKKKKKKK', '..KWK', '..KK']),
  check: grid(12, ['', '', '.........KK', '........KWK', '.......KWK', '.KK...KWK', 'KWWK.KWK', '.KWWKWK', '..KWWK', '...KK']),
  chest: grid(12, ['', '.KKKKKKKKKK', 'KYYYYYYYYYYK', 'KyyyyyyyyyyK', 'KKKKKKKKKKKK', 'KYYYYKKYYYYK', 'KYYYYKKYYYYK', 'KYYYYYYYYYYK', 'KyyyyyyyyyyK', 'KKKKKKKKKKKK']),
  star: grid(12, ['.....KK', '....KYYK', '....KYYK', 'KKKKKYYKKKKK', 'KYYYYYYYYYYK', '.KYYYYYYYYK', '..KYYYYYYK', '..KYYYYYYK', '.KYYYKKYYYK', '.KYYK..KYYK', '.KKK....KKK']),
}
export type PixelIconName = keyof typeof pixelIcons

/** Renders a character grid as crisp SVG rectangles, merging runs of the same colour on each row. */
export function PixelSprite({ rows, size, gray = false, label, className = '' }: { rows: string[]; size: number; gray?: boolean; label?: string; className?: string }) {
  const cells = rows[0]?.length ?? 1
  const rects: ReactNode[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      if (ch !== '.') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={gray ? (ch === 'K' ? '#8c8494' : '#c9c4cf') : palette[ch] ?? palette.K}/>)
      x = end
    }
  })
  return <svg className={`pixel-sprite ${className}`} width={size} height={size} viewBox={`0 0 ${cells} ${rows.length}`} shapeRendering="crispEdges" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{rects}</svg>
}

export function PixelIcon({ name, size = 24, gray = false }: { name: PixelIconName; size?: number; gray?: boolean }) {
  return <PixelSprite rows={pixelIcons[name]} size={size} gray={gray} className="pixel-icon"/>
}

/** Pin, the map-pin mascot who reads clues and cheers discoveries. Decorative unless given a label. */
export function Pin({ size = 64, mood = 'happy', label, className = '' }: { size?: number; mood?: 'happy' | 'cheer' | 'think'; label?: string; className?: string }) {
  const rows = mood === 'cheer' ? sprites.pinCheer : mood === 'think' ? sprites.pinThink : sprites.pin
  return <PixelSprite rows={rows} size={size} label={label} className={`pin-sprite ${className}`}/>
}

/** Pin's dialogue box: a stepped pixel frame with a name tag and a blinking "more" marker. */
export function PinSays({ children, name = 'Pin', className = '' }: { children: ReactNode; name?: string; className?: string }) {
  return <div className={`pin-says ${className}`}>
    <span className="pin-says-name">{name}</span>
    <div className="pin-says-frame"><div className="pin-says-box">{children}<span className="pin-says-more" aria-hidden="true">▼</span></div></div>
  </div>
}
