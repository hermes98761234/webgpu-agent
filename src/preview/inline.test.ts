import { describe, expect, it } from 'vitest'
import { inlineAssets } from './inline'

const enc = (s: string) => new TextEncoder().encode(s)

function reader(map: Record<string, string>) {
  return async (path: string) => (path in map ? enc(map[path]) : null)
}

describe('inlineAssets', () => {
  it('inlines relative scripts and stylesheets', async () => {
    const html = '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="app.js"></script></body></html>'
    const out = await inlineAssets(html, '/home/user/site/index.html', reader({
      '/home/user/site/style.css': 'body{color:red}',
      '/home/user/site/app.js': 'console.log(1)',
    }))
    expect(out).toContain('<style>\nbody{color:red}\n</style>')
    expect(out).toContain('<script>\nconsole.log(1)\n</script>')
    expect(out).not.toContain('src="app.js"')
  })

  it('resolves ../ and leaves absolute URLs alone', async () => {
    const html = '<script src="../lib/a.js"></script><script src="https://cdn.example.com/x.js"></script>'
    const out = await inlineAssets(html, '/home/user/site/page/index.html', reader({
      '/home/user/site/lib/a.js': 'A()',
    }))
    expect(out).toContain('A()')
    expect(out).toContain('https://cdn.example.com/x.js')
  })

  it('turns missing assets into console warnings', async () => {
    const out = await inlineAssets('<script src="gone.js"></script>', '/home/user/i.html', reader({}))
    expect(out).toContain('missing asset: gone.js')
  })

  it('inlines images as data URIs', async () => {
    const out = await inlineAssets('<img src="p.png" alt="">', '/home/user/i.html', reader({ '/home/user/p.png': 'PNGDATA' }))
    expect(out).toContain('src="data:image/png;base64,')
  })
})
