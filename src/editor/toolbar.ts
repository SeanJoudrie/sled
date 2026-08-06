/**
 * The toolbar strip.
 *
 * Every control is a real button with a name. The palette never encodes meaning
 * in colour alone — ice and water are additionally distinguished by stroke
 * class, so a fat translucent band and a thin opaque line cannot be confused at
 * a glance even if the hues are.
 */

import { BRUSHES } from '../sim/index.ts'
import type { BrushId } from '../sim/index.ts'

export type ToolId =
  | { kind: 'brush'; brush: BrushId }
  | { kind: 'erase' }
  | { kind: 'flag' }

export type Action = 'undo' | 'redo' | 'clear' | 'play' | 'reset' | 'share'

export type ToolbarHandlers = {
  onTool: (t: ToolId) => void
  onAction: (a: Action) => void
}

const GLYPH: Record<string, string> = {
  erase: '<path d="M5 16 L12 9 L18 15 L14 19 L7 19 Z" /><path d="M4 19 H20" />',
  flag: '<path d="M7 20 V5 L17 8 L7 11" />',
  undo: '<path d="M9 7 L4 12 L9 17" /><path d="M4 12 H14 A5 5 0 0 1 14 22 H11" />',
  redo: '<path d="M15 7 L20 12 L15 17" /><path d="M20 12 H10 A5 5 0 0 0 10 22 H13" />',
  clear: '<path d="M5 7 H19" /><path d="M9 7 V5 H15 V7" /><path d="M7 7 L8 20 H16 L17 7" />',
  play: '<path d="M8 5 L19 12 L8 19 Z" />',
  reset: '<path d="M5 12 A7 7 0 1 0 8 6" /><path d="M4 4 V9 H9" />',
  share: '<path d="M9 13 A4 4 0 0 1 9 8 L12 5 A4 4 0 0 1 18 11 L16 13" /><path d="M15 11 A4 4 0 0 1 15 16 L12 19 A4 4 0 0 1 6 13 L8 11" />',
}

function glyph(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[name] ?? ''}</svg>`
}

export type Toolbar = {
  /** Reflect current state: selected tool, history availability, run state. */
  sync: (s: {
    tool: ToolId
    canUndo: boolean
    canRedo: boolean
    playing: boolean
    canClear: boolean
  }) => void
}

export function buildToolbar(rail: HTMLElement, h: ToolbarHandlers): Toolbar {
  rail.replaceChildren()

  // The buttons scroll, the strip does not — the tape is positioned outside the
  // strip's edges, and a scrolling container would clip it to a stub.
  const root = document.createElement('div')
  root.className = 'rail-list'
  rail.appendChild(root)

  const brushButtons: HTMLButtonElement[] = []

  const button = (
    label: string,
    swatchHtml: string,
    onClick: () => void,
    title: string,
  ): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tool'
    b.title = title
    b.innerHTML = `${swatchHtml}<span>${label}</span>`
    b.addEventListener('click', onClick)
    root.appendChild(b)
    return b
  }

  const divider = () => {
    const d = document.createElement('div')
    d.className = 'divider'
    d.style.borderTop = '1px dashed rgba(30,36,48,0.2)'
    d.style.margin = '4px 2px'
    root.appendChild(d)
  }

  for (const brush of BRUSHES) {
    const swatch = `<span class="swatch ${brush.cls}" style="--c: var(${brush.token})"></span>`
    const hint =
      brush.id === 3
        ? 'Boost — pushes along the line as drawn, so right-to-left boosts backwards'
        : brush.id === 5
          ? 'Water — a surface, not a solid; he sinks and drags'
          : brush.id === 6
            ? 'Scenery — drawing only, no physics at all'
            : `${brush.name} — ${brush.cls} stroke`
    brushButtons.push(
      button(brush.name, swatch, () => h.onTool({ kind: 'brush', brush: brush.id }), hint),
    )
  }

  divider()

  const eraseBtn = button(
    'Erase',
    `<span class="swatch glyph">${glyph('erase')}</span>`,
    () => h.onTool({ kind: 'erase' }),
    'Erase whole strokes — or hold right-drag with any brush',
  )
  const flagBtn = button(
    'Start',
    `<span class="swatch glyph">${glyph('flag')}</span>`,
    () => h.onTool({ kind: 'flag' }),
    'Move the start flag — the sled takes its angle from the line beneath it',
  )

  divider()

  const undoBtn = button('Undo', `<span class="swatch glyph">${glyph('undo')}</span>`, () => h.onAction('undo'), 'Undo (⌘Z)')
  const redoBtn = button('Redo', `<span class="swatch glyph">${glyph('redo')}</span>`, () => h.onAction('redo'), 'Redo (⇧⌘Z)')
  const clearBtn = button('Clear', `<span class="swatch glyph">${glyph('clear')}</span>`, () => h.onAction('clear'), 'Clear the page')

  divider()

  const playBtn = button('Play', `<span class="swatch glyph">${glyph('play')}</span>`, () => h.onAction('play'), 'Play from the flag (Enter)')
  button('Reset', `<span class="swatch glyph">${glyph('reset')}</span>`, () => h.onAction('reset'), 'Back to editing (Esc)')
  button('Link', `<span class="swatch glyph">${glyph('share')}</span>`, () => h.onAction('share'), 'Copy a share link — the level travels in the URL')

  return {
    sync(s) {
      for (const b of brushButtons) b.setAttribute('aria-pressed', 'false')
      eraseBtn.setAttribute('aria-pressed', String(s.tool.kind === 'erase'))
      flagBtn.setAttribute('aria-pressed', String(s.tool.kind === 'flag'))
      if (s.tool.kind === 'brush') {
        brushButtons[s.tool.brush]?.setAttribute('aria-pressed', 'true')
      }
      undoBtn.disabled = !s.canUndo
      redoBtn.disabled = !s.canRedo
      clearBtn.disabled = !s.canClear
      playBtn.querySelector('span:last-child')!.textContent = s.playing ? 'Pause' : 'Play'
    },
  }
}
