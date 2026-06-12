import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { runCommand, makeShellState, type ShellState } from './terminal/shell'

// Module-level shell state persists across mounts and tab switches
const shellState: ShellState = makeShellState()

interface Props {
  onClose: () => void
  active: boolean
}

function getPrompt(state: ShellState): string {
  return `\x1b[32m${state.cwd}\x1b[0m $ `
}

function getTheme() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return {
    background: v('--bg') || '#111418',
    foreground: v('--text') || '#e6e9ee',
    cursor: v('--accent') || '#4f9cf9',
    cursorAccent: v('--bg') || '#111418',
    selectionBackground: v('--accent') || '#4f9cf9',
    black: '#1a1f26',
    brightBlack: '#5b6675',
    red: v('--error') || '#f97066',
    brightRed: v('--error') || '#f97066',
    green: '#5ac882',
    brightGreen: '#5ac882',
    yellow: '#f0c060',
    brightYellow: '#f0c060',
    blue: v('--accent') || '#4f9cf9',
    brightBlue: v('--accent') || '#4f9cf9',
    cyan: '#54d0e8',
    brightCyan: '#54d0e8',
    white: v('--text') || '#e6e9ee',
    brightWhite: '#ffffff',
  }
}

export function Terminal({ onClose, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const lineRef = useRef('')
  const cursorRef = useRef(0)
  const histIdxRef = useRef(-1)
  const busyRef = useRef(false)

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active && fitRef.current) {
      const id = setTimeout(() => fitRef.current?.fit(), 0)
      return () => clearTimeout(id)
    }
  }, [active])

  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return

    const xterm = new XTerm({
      theme: getTheme(),
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 2000,
    })

    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(containerRef.current)
    fit.fit()

    xtermRef.current = xterm
    fitRef.current = fit

    xterm.writeln('\x1b[32mWebGPU Agent Terminal\x1b[0m — type \x1b[33mhelp\x1b[0m for commands')
    xterm.writeln('')
    xterm.write(getPrompt(shellState))

    const redraw = () => {
      const prompt = getPrompt(shellState)
      const line = lineRef.current
      const cur = cursorRef.current
      xterm.write('\r\x1b[K' + prompt + line)
      if (cur < line.length) {
        xterm.write(`\x1b[${line.length - cur}D`)
      }
    }

    const execute = async (line: string) => {
      xterm.write('\r\n')
      const trimmed = line.trim()
      if (trimmed) {
        shellState.history.push(trimmed)
      }
      lineRef.current = ''
      cursorRef.current = 0
      histIdxRef.current = -1

      if (!trimmed) {
        xterm.write(getPrompt(shellState))
        return
      }

      busyRef.current = true
      try {
        await runCommand(trimmed, shellState, xterm)
      } catch (err) {
        xterm.write(`\x1b[31mInternal error: ${err}\x1b[0m\r\n`)
      } finally {
        busyRef.current = false
        xterm.write(getPrompt(shellState))
      }
    }

    xterm.onData((data) => {
      if (busyRef.current && data !== '\x03') return

      if (data === '\r') {
        void execute(lineRef.current)
      } else if (data === '\x03') {
        // Ctrl+C
        if (busyRef.current) {
          // Just show ^C; we can't cancel async git ops but at least unblock readline
          busyRef.current = false
          xterm.write('^C\r\n')
          lineRef.current = ''
          cursorRef.current = 0
          xterm.write(getPrompt(shellState))
        } else {
          xterm.write('^C\r\n')
          lineRef.current = ''
          cursorRef.current = 0
          xterm.write(getPrompt(shellState))
        }
      } else if (data === '\x0c') {
        // Ctrl+L
        xterm.clear()
        lineRef.current = ''
        cursorRef.current = 0
        xterm.write(getPrompt(shellState))
      } else if (data === '\x7f' || data === '\x08') {
        // Backspace
        if (cursorRef.current > 0) {
          const l = lineRef.current
          lineRef.current = l.slice(0, cursorRef.current - 1) + l.slice(cursorRef.current)
          cursorRef.current--
          redraw()
        }
      } else if (data === '\x1b[A') {
        // Up arrow — history
        const hist = shellState.history
        if (hist.length && histIdxRef.current < hist.length - 1) {
          histIdxRef.current++
          const entry = hist[hist.length - 1 - histIdxRef.current]
          lineRef.current = entry
          cursorRef.current = entry.length
          redraw()
        }
      } else if (data === '\x1b[B') {
        // Down arrow — history
        if (histIdxRef.current > 0) {
          histIdxRef.current--
          const entry = shellState.history[shellState.history.length - 1 - histIdxRef.current]
          lineRef.current = entry
          cursorRef.current = entry.length
          redraw()
        } else if (histIdxRef.current === 0) {
          histIdxRef.current = -1
          lineRef.current = ''
          cursorRef.current = 0
          redraw()
        }
      } else if (data === '\x1b[C') {
        // Right arrow
        if (cursorRef.current < lineRef.current.length) {
          cursorRef.current++
          xterm.write('\x1b[C')
        }
      } else if (data === '\x1b[D') {
        // Left arrow
        if (cursorRef.current > 0) {
          cursorRef.current--
          xterm.write('\x1b[D')
        }
      } else if (data === '\x1b[H' || data === '\x01') {
        // Home / Ctrl+A
        if (cursorRef.current > 0) {
          xterm.write(`\x1b[${cursorRef.current}D`)
          cursorRef.current = 0
        }
      } else if (data === '\x1b[F' || data === '\x05') {
        // End / Ctrl+E
        if (cursorRef.current < lineRef.current.length) {
          xterm.write(`\x1b[${lineRef.current.length - cursorRef.current}C`)
          cursorRef.current = lineRef.current.length
        }
      } else if (data >= ' ' || data === '\t') {
        // Printable character (including tab treated as spaces)
        const ch = data === '\t' ? '  ' : data
        const l = lineRef.current
        lineRef.current = l.slice(0, cursorRef.current) + ch + l.slice(cursorRef.current)
        cursorRef.current += ch.length
        if (cursorRef.current === lineRef.current.length) {
          xterm.write(ch)
        } else {
          redraw()
        }
      }
    })

    const onResize = () => fitRef.current?.fit()
    window.addEventListener('resize', onResize)

    // Update theme if document theme changes
    const observer = new MutationObserver(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = getTheme()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      window.removeEventListener('resize', onResize)
      observer.disconnect()
      // Do NOT dispose — keep alive across tab switches
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Also handle path tab completion hint (optional: resolve paths on Tab)
  // Kept minimal per requirements

  return (
    <div className="overlay-page">
      <div className="overlay-header">
        <h2>Terminal</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>virtual fs • isomorphic-git</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>
      </div>
      <div className="terminal-body" ref={containerRef} />
    </div>
  )
}
