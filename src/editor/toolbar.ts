/**
 * The controls.
 *
 * Built for a phone first. Round icon buttons in the corners, nothing that
 * needs scrolling, and a single sheet for anything that is a choice rather than
 * an action. Everything keeps a name for screen readers, and the material sheet
 * shows every pen by name *and* stroke class — ice and water are different
 * colours but also different stroke widths, so they cannot be confused by
 * anyone who cannot tell the hues apart.
 *
 * The one non-obvious call is the draw toggle. Drawing and panning both want a
 * one-finger drag, and on a phone there is no right mouse button and no space
 * bar to disambiguate them. So drawing is a mode you turn on, and with it off a
 * drag moves the page — which is what you want most of the time anyway, since
 * you look at a track far more often than you extend one.
 */

import { BRUSHES } from '../sim/index.ts'
import type { BrushId } from '../sim/index.ts'

export type ToolId =
  | { kind: 'draw' }
  | { kind: 'erase' }
  | { kind: 'flag' }
  | { kind: 'pan' }

export type Action = 'undo' | 'redo' | 'clear' | 'play' | 'reset' | 'share'

export type ToolbarHandlers = {
  onTool: (t: ToolId) => void
  onBrush: (b: BrushId) => void
  onAction: (a: Action) => void
}

export type ToolbarState = {
  tool: ToolId
  brush: BrushId
  canUndo: boolean
  canRedo: boolean
  canClear: boolean
  playing: boolean
  running: boolean
}

const PATHS: Record<string, string> = {
  pencil: '<path d="M4 20 L4.8 15.6 L16 4.4 A2.3 2.3 0 0 1 19.6 8 L8.4 19.2 Z" /><path d="M14.2 6.2 L17.8 9.8" />',
  erase: '<path d="M5 16.2 L12.4 8.8 L18.6 15 L14.4 19.2 L7.2 19.2 Z" /><path d="M3.6 19.2 H20.4" />',
  flag: '<path d="M7 20.5 V4 L17.6 7.4 L7 10.8" />',
  undo: '<path d="M9.2 6.6 L4.4 11.4 L9.2 16.2" /><path d="M4.4 11.4 H13.8 A5.2 5.2 0 1 1 13.8 21.8 H10.6" />',
  redo: '<path d="M14.8 6.6 L19.6 11.4 L14.8 16.2" /><path d="M19.6 11.4 H10.2 A5.2 5.2 0 1 0 10.2 21.8 H13.4" />',
  clear: '<path d="M4.6 6.8 H19.4" /><path d="M9.4 6.8 V4.6 H14.6 V6.8" /><path d="M6.6 6.8 L7.6 20 H16.4 L17.4 6.8" />',
  play: '<path d="M7.6 4.6 L19.4 12 L7.6 19.4 Z" stroke-linejoin="round" />',
  pause: '<path d="M9 5 V19 M15 5 V19" />',
  reset: '<path d="M4.6 12 A7.4 7.4 0 1 0 7.8 5.9" /><path d="M3.6 3.4 V9.2 H9.4" />',
  share: '<path d="M9.4 13.4 A4.2 4.2 0 0 1 9.4 8.2 L12.4 5.2 A4.2 4.2 0 0 1 18.6 11 L16.6 13" /><path d="M14.6 10.6 A4.2 4.2 0 0 1 14.6 15.8 L11.6 18.8 A4.2 4.2 0 0 1 5.4 13 L7.4 11" />',
  more: '<circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
}

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
    stroke-linecap="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`
}

export type Toolbar = { sync: (s: ToolbarState) => void }

export function buildControls(
  els: { tl: HTMLElement; bl: HTMLElement; br: HTMLElement; sheet: HTMLElement },
  h: ToolbarHandlers,
): Toolbar {
  for (const e of [els.tl, els.bl, els.br]) e.replaceChildren()

  const mk = (
    parent: HTMLElement,
    cls: string,
    label: string,
    inner: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `btn ${cls}`.trim()
    b.setAttribute('aria-label', label)
    b.title = label
    b.innerHTML = inner
    b.addEventListener('click', onClick)
    parent.appendChild(b)
    return b
  }

  // ── top left: history ──────────────────────────────────────────────────────
  const undoBtn = mk(els.tl, 'small', 'Undo', icon('undo'), () => h.onAction('undo'))
  const redoBtn = mk(els.tl, 'small', 'Redo', icon('redo'), () => h.onAction('redo'))

  // ── bottom left: what a drag does, and what it draws with ──────────────────
  const drawBtn = mk(els.bl, '', 'Draw', icon('pencil'), () => {
    closeSheet()
    h.onTool({ kind: 'draw' })
  })
  const materialBtn = mk(els.bl, 'material', 'Material', '<span class="ink-swatch"></span>', () =>
    toggleSheet('material'),
  )
  const eraseBtn = mk(els.bl, '', 'Erase', icon('erase'), () => {
    closeSheet()
    h.onTool({ kind: 'erase' })
  })
  const moreBtn = mk(els.bl, 'small', 'More', icon('more'), () => toggleSheet('more'))

  // ── bottom right: run it ───────────────────────────────────────────────────
  const playBtn = mk(els.br, 'primary', 'Play', icon('play'), () => h.onAction('play'))
  const resetBtn = mk(els.br, 'small', 'Reset', icon('reset'), () => h.onAction('reset'))

  // ── the sheet ──────────────────────────────────────────────────────────────
  let openSheet: 'material' | 'more' | null = null
  let current: ToolbarState | null = null

  function closeSheet(): void {
    openSheet = null
    els.sheet.hidden = true
    materialBtn.setAttribute('aria-expanded', 'false')
    moreBtn.setAttribute('aria-expanded', 'false')
  }

  function toggleSheet(which: 'material' | 'more'): void {
    if (openSheet === which) {
      closeSheet()
      return
    }
    openSheet = which
    els.sheet.hidden = false
    els.sheet.classList.remove('right')
    materialBtn.setAttribute('aria-expanded', String(which === 'material'))
    moreBtn.setAttribute('aria-expanded', String(which === 'more'))
    renderSheet()
    // Focus the first row so the sheet is usable from a keyboard.
    ;(els.sheet.querySelector('.row') as HTMLElement | null)?.focus()
  }

  function row(
    inner: string,
    label: string,
    onClick: () => void,
    pressed?: boolean,
  ): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'row'
    b.innerHTML = inner
    b.setAttribute('aria-label', label)
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed))
    b.addEventListener('click', onClick)
    els.sheet.appendChild(b)
    return b
  }

  function renderSheet(): void {
    els.sheet.replaceChildren()
    if (openSheet === 'material') {
      els.sheet.setAttribute('aria-label', 'Material')
      for (const brush of BRUSHES) {
        const note =
          brush.id === 3 ? 'along the line' :
          brush.id === 5 ? 'sinks' :
          brush.id === 6 ? 'no physics' :
          brush.cls === 'highlighter' ? 'highlighter' : 'pen'
        row(
          `<span class="sw ${brush.cls}" style="--c: var(${brush.token})"></span>` +
            `<span class="name">${brush.name}</span><span class="note">${note}</span>`,
          `${brush.name} — ${note}`,
          () => {
            h.onBrush(brush.id)
            closeSheet()
          },
          current?.brush === brush.id,
        )
      }
    } else if (openSheet === 'more') {
      els.sheet.setAttribute('aria-label', 'More')
      row(
        `<span class="sw glyph">${icon('flag')}</span><span class="name">Move start flag</span>`,
        'Move start flag',
        () => {
          h.onTool({ kind: 'flag' })
          closeSheet()
        },
        current?.tool.kind === 'flag',
      )
      const clearRow = row(
        `<span class="sw glyph">${icon('clear')}</span><span class="name">Clear the page</span>`,
        'Clear the page',
        () => {
          h.onAction('clear')
          closeSheet()
        },
      )
      if (current && !current.canClear) clearRow.disabled = true
      row(
        `<span class="sw glyph">${icon('share')}</span><span class="name">Copy share link</span>`,
        'Copy share link',
        () => {
          h.onAction('share')
          closeSheet()
        },
      )
    }
  }

  // A tap anywhere else dismisses the sheet, which is what every phone user
  // already expects from a popover.
  document.addEventListener('pointerdown', (e) => {
    if (!openSheet) return
    const t = e.target as Node
    if (els.sheet.contains(t) || materialBtn.contains(t) || moreBtn.contains(t)) return
    closeSheet()
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSheet) closeSheet()
  })

  return {
    sync(s) {
      current = s

      drawBtn.setAttribute('aria-pressed', String(s.tool.kind === 'draw'))
      eraseBtn.setAttribute('aria-pressed', String(s.tool.kind === 'erase'))
      moreBtn.setAttribute('aria-pressed', String(s.tool.kind === 'flag'))

      const brush = BRUSHES[s.brush]
      if (brush) {
        materialBtn.innerHTML = `<span class="${brush.cls === 'highlighter' ? 'hl-swatch' : 'ink-swatch'}"
          style="--c: var(${brush.token})"></span>`
        const label = `Material: ${brush.name}`
        materialBtn.setAttribute('aria-label', label)
        materialBtn.title = label
      }

      undoBtn.disabled = !s.canUndo
      redoBtn.disabled = !s.canRedo

      const playLabel = s.playing ? 'Pause' : s.running ? 'Resume' : 'Play'
      playBtn.innerHTML = icon(s.playing ? 'pause' : 'play')
      playBtn.setAttribute('aria-label', playLabel)
      playBtn.title = playLabel
      resetBtn.disabled = !s.running

      if (!els.sheet.hidden) renderSheet()
    },
  }
}
