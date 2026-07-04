import git from 'isomorphic-git'
import type { Terminal } from '@xterm/xterm'
import { fs, pfs, ensureDir } from '../../fs/setup'
import { http } from '../../tools/git'

export interface ShellState {
  cwd: string
  history: string[]
}

export function makeShellState(): ShellState {
  return { cwd: '/', history: [] }
}

function normalizePath(p: string): string {
  const parts = p.split('/').filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else if (part !== '.') out.push(part)
  }
  return '/' + out.join('/')
}

export function resolvePath(cwd: string, p: string): string {
  if (!p || p === '.') return cwd
  if (p.startsWith('/')) return normalizePath(p)
  return normalizePath(cwd + '/' + p)
}

// Tokenize with single/double quote support
function tokenize(line: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === ' ' && !inDouble && !inSingle) {
      if (cur) { tokens.push(cur); cur = '' }
      continue
    }
    cur += ch
  }
  if (cur) tokens.push(cur)
  return tokens
}

// Parse `>> file` or `> file` redirect from a raw line (handles quoted tokens)
function parseRedirect(line: string): { cmdLine: string; outFile: string | null; append: boolean } {
  // Walk through tokens to find unquoted > or >>
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (!inDouble && !inSingle) {
      if (line[i] === '>' && line[i + 1] === '>') {
        const cmdLine = line.slice(0, i).trim()
        const outFile = line.slice(i + 2).trim()
        return { cmdLine, outFile: outFile || null, append: true }
      }
      if (line[i] === '>') {
        const cmdLine = line.slice(0, i).trim()
        const outFile = line.slice(i + 1).trim()
        return { cmdLine, outFile: outFile || null, append: false }
      }
    }
  }
  return { cmdLine: line, outFile: null, append: false }
}

async function deleteRecursive(p: string, depth = 0, visited = new Set<string>()): Promise<void> {
  if (depth > 200) throw new Error(`Recursion limit exceeded at ${p}`)
  if (visited.has(p)) throw new Error(`Cycle detected at ${p}`)
  visited.add(p)
  const stat = await pfs.stat(p)
  if (stat.isDirectory()) {
    const names = await pfs.readdir(p) as string[]
    for (const n of names) await deleteRecursive(p === '/' ? `/${n}` : `${p}/${n}`, depth + 1, visited)
    await pfs.rmdir(p)
  } else {
    await pfs.unlink(p)
  }
}

export async function runCommand(
  rawLine: string,
  state: ShellState,
  term: Terminal,
): Promise<void> {
  const line = rawLine.trim()
  if (!line) return

  const { cmdLine, outFile, append } = parseRedirect(line)
  const tokens = tokenize(cmdLine)
  if (!tokens.length) return

  const [cmd, ...args] = tokens

  // stdout can be redirected; stderr always goes to terminal
  const outLines: string[] = []
  const wl = (text: string) => {
    if (outFile !== null) { outLines.push(text + '\n') }
    else { term.write(text + '\r\n') }
  }
  const e = (text: string) => term.write('\x1b[31m' + text + '\x1b[0m\r\n')

  try {
    if (cmd === 'clear') {
      term.clear()
    } else if (cmd === 'pwd') {
      wl(state.cwd)
    } else if (cmd === 'cd') {
      const target = args[0] ? resolvePath(state.cwd, args[0]) : '/'
      try {
        const stat = await pfs.stat(target)
        if (!stat.isDirectory()) {
          e(`cd: not a directory: ${args[0]}`)
        } else {
          state.cwd = target
        }
      } catch {
        e(`cd: no such file or directory: ${args[0] ?? '/'}`)
      }
    } else if (cmd === 'ls') {
      let showLong = false
      let targetPath = state.cwd
      for (const arg of args) {
        if (arg.startsWith('-')) { if (arg.includes('l') || arg.includes('a')) showLong = true }
        else targetPath = resolvePath(state.cwd, arg)
      }
      try {
        const names = await pfs.readdir(targetPath) as string[]
        const entries = await Promise.all(names.map(async (name) => {
          const fp = targetPath === '/' ? `/${name}` : `${targetPath}/${name}`
          try {
            const stat = await pfs.stat(fp)
            return { name, isDir: stat.isDirectory(), size: stat.size as number }
          } catch {
            return { name, isDir: false, size: 0 }
          }
        }))
        entries.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1
          if (!a.isDir && b.isDir) return 1
          return a.name.localeCompare(b.name)
        })
        if (showLong) {
          for (const entry of entries) {
            const typeChar = entry.isDir ? 'd' : '-'
            const display = entry.isDir ? `\x1b[34m${entry.name}/\x1b[0m` : entry.name
            wl(`${typeChar}  ${String(entry.size).padStart(8)}  ${display}`)
          }
        } else {
          const parts = entries.map((ent) =>
            ent.isDir ? `\x1b[34m${ent.name}/\x1b[0m` : ent.name,
          )
          wl(parts.join('  '))
        }
      } catch (err) {
        e(`ls: ${err}`)
      }
    } else if (cmd === 'cat') {
      if (!args.length) { e('cat: missing file operand'); return }
      for (const arg of args) {
        const p = resolvePath(state.cwd, arg)
        try {
          const content = await pfs.readFile(p, { encoding: 'utf8' }) as string
          // Normalize newlines for terminal
          const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          if (outFile !== null) {
            outLines.push(normalized)
          } else {
            term.write(normalized.replace(/\n/g, '\r\n'))
          }
        } catch (err) {
          e(`cat: ${arg}: ${err}`)
        }
      }
    } else if (cmd === 'mkdir') {
      const useP = args.includes('-p')
      const dirs = args.filter((a) => !a.startsWith('-'))
      if (!dirs.length) { e('mkdir: missing operand'); return }
      for (const d of dirs) {
        const p = resolvePath(state.cwd, d)
        try {
          if (useP) { await ensureDir(p) }
          else { await pfs.mkdir(p) }
        } catch (err) {
          e(`mkdir: ${d}: ${err}`)
        }
      }
    } else if (cmd === 'touch') {
      if (!args.length) { e('touch: missing file operand'); return }
      for (const arg of args) {
        const p = resolvePath(state.cwd, arg)
        try {
          try { await pfs.stat(p); continue } catch { /* file doesn't exist */ }
          await pfs.writeFile(p, '', 'utf8')
        } catch (err) {
          e(`touch: ${arg}: ${err}`)
        }
      }
    } else if (cmd === 'echo') {
      wl(args.join(' '))
    } else if (cmd === 'rm') {
      const recursive = args.some((a) => a.startsWith('-') && (a.includes('r') || a.includes('f')))
      const paths = args.filter((a) => !a.startsWith('-'))
      if (!paths.length) { e('rm: missing operand'); return }
      for (const arg of paths) {
        const p = resolvePath(state.cwd, arg)
        try {
          const stat = await pfs.stat(p)
          if (stat.isDirectory()) {
            if (!recursive) { e(`rm: ${arg}: is a directory (use -r)`) }
            else { await deleteRecursive(p) }
          } else {
            await pfs.unlink(p)
          }
        } catch (err) {
          e(`rm: ${arg}: ${err}`)
        }
      }
    } else if (cmd === 'help') {
      wl('Available commands:')
      wl('  cd <dir>             Change directory')
      wl('  pwd                  Print working directory')
      wl('  ls [-l] [path]       List directory contents')
      wl('  cat <file...>        Print file contents')
      wl('  mkdir [-p] <dir...>  Create directory')
      wl('  touch <file...>      Create empty file')
      wl('  echo <args...>       Print text (supports > and >>)')
      wl('  rm [-r] <path...>    Remove file or directory')
      wl('  clear                Clear screen')
      wl('  git <subcommand>     Git operations')
      wl('    init | status | add | commit -m "msg" | log [-n N]')
      wl('    diff | branch | checkout [-b] <branch>')
      wl('    remote add <name> <url> | remote -v')
      wl('    clone <url> [dir] | pull [remote] [branch]')
      wl('    push [remote] [branch] [--username X --token Y]')
      wl('  help                 Show this help')
    } else if (cmd === 'git') {
      await runGitCommand(args, state, term, e)
    } else {
      e(`command not found: ${cmd}`)
    }
  } catch (err) {
    e(`Error: ${err}`)
  }

  // Flush redirected output to file
  if (outFile !== null && outLines.length > 0) {
    const text = outLines.join('')
    try {
      if (append) {
        let existing = ''
        try { existing = await pfs.readFile(outFile, { encoding: 'utf8' }) as string } catch { /* new file */ }
        await pfs.writeFile(outFile, existing + text, 'utf8')
      } else {
        await pfs.writeFile(outFile, text, 'utf8')
      }
    } catch (err) {
      term.write('\x1b[31m' + `redirect error: ${err}` + '\x1b[0m\r\n')
    }
  }
}

async function runGitCommand(
  args: string[],
  state: ShellState,
  term: Terminal,
  e: (msg: string) => void,
): Promise<void> {
  const sub = args[0]
  if (!sub) { e('git: missing subcommand'); return }

  const dir = state.cwd
  const wl = (text: string) => term.write(text + '\r\n')

  const onProgress = (p: { phase: string; loaded: number; total: number }) => {
    const pct = p.total ? ` (${Math.round((p.loaded / p.total) * 100)}%)` : ''
    term.write(`\r${p.phase}: ${p.loaded}/${p.total}${pct}     `)
  }

  if (sub === 'init') {
    try {
      await git.init({ fs, dir })
      wl(`Initialized empty Git repository in ${dir}`)
    } catch (err) { e(`git init: ${err}`) }

  } else if (sub === 'status') {
    try {
      const matrix = await git.statusMatrix({ fs, dir })
      const lines: string[] = []
      for (const [file, head, workdir, stage] of matrix) {
        if (head === 1 && workdir === 1 && stage === 1) continue
        let status: string
        if (head === 0 && stage === 0) status = `\x1b[2m?? ${file}\x1b[0m`
        else if (head === 0 && stage === 2) status = `\x1b[32mA  ${file}\x1b[0m`
        else if (head === 1 && workdir === 2 && stage === 2) status = `\x1b[32mM  ${file}\x1b[0m`
        else if (head === 1 && workdir === 2) status = `\x1b[31mM  ${file}\x1b[0m`
        else if (head === 1 && workdir === 0) status = `\x1b[31mD  ${file}\x1b[0m`
        else status = `?  ${file}`
        lines.push(status)
      }
      if (!lines.length) wl('nothing to commit, working tree clean')
      else lines.forEach((l) => wl(l))
    } catch (err) { e(`git status: ${err}`) }

  } else if (sub === 'add') {
    const pathArg = args[1] ?? '.'
    try {
      if (pathArg === '.') {
        const matrix = await git.statusMatrix({ fs, dir })
        for (const [file, , workdir] of matrix) {
          if (workdir !== 1) await git.add({ fs, dir, filepath: file })
        }
        wl('Staged all changes')
      } else {
        await git.add({ fs, dir, filepath: pathArg })
        wl(`Staged: ${pathArg}`)
      }
    } catch (err) { e(`git add: ${err}`) }

  } else if (sub === 'commit') {
    const mIdx = args.indexOf('-m')
    const msg = mIdx >= 0 ? args[mIdx + 1] : undefined
    if (!msg) { e('git commit: usage: git commit -m "message"'); return }
    try {
      const sha = await git.commit({
        fs, dir,
        message: msg,
        author: { name: 'WebGPU Agent', email: 'agent@local' },
      })
      wl(`[${sha.slice(0, 7)}] ${msg}`)
    } catch (err) { e(`git commit: ${err}`) }

  } else if (sub === 'log') {
    const nIdx = args.indexOf('-n')
    const depth = nIdx >= 0 ? Math.max(1, parseInt(args[nIdx + 1] ?? '10', 10)) : 10
    try {
      const commits = await git.log({ fs, dir, depth })
      if (!commits.length) { wl('No commits yet'); return }
      for (const { oid, commit } of commits) {
        const date = new Date(commit.author.timestamp * 1000).toISOString().slice(0, 10)
        wl(`\x1b[33m${oid.slice(0, 7)}\x1b[0m ${date} \x1b[36m${commit.author.name}\x1b[0m: ${commit.message.trim()}`)
      }
    } catch (err) { e(`git log: ${err}`) }

  } else if (sub === 'diff') {
    try {
      const matrix = await git.statusMatrix({ fs, dir })
      const changed = matrix.filter(([, h, w, s]) => !(h === 1 && w === 1 && s === 1))
      if (!changed.length) { wl('No changes'); return }
      for (const [file, head, workdir] of changed) {
        if (head === 0 && workdir === 2) {
          wl(`\x1b[32m+++ ${file} (new file)\x1b[0m`)
          try {
            const fp = dir === '/' ? `/${file}` : `${dir}/${file}`
            const content = await pfs.readFile(fp, { encoding: 'utf8' }) as string
            content.split('\n').forEach((l) => term.write(`\x1b[32m+ ${l}\x1b[0m\r\n`))
          } catch { /* unreadable */ }
        } else if (head === 1 && workdir === 0) {
          wl(`\x1b[31m--- ${file} (deleted)\x1b[0m`)
        } else {
          wl(`\x1b[33m~ ${file} (modified)\x1b[0m`)
        }
      }
    } catch (err) { e(`git diff: ${err}`) }

  } else if (sub === 'branch') {
    try {
      const branches = await git.listBranches({ fs, dir })
      const current = await git.currentBranch({ fs, dir })
      if (!branches.length) { wl('No branches yet'); return }
      for (const b of branches) {
        wl(b === current ? `\x1b[32m* ${b}\x1b[0m` : `  ${b}`)
      }
    } catch (err) { e(`git branch: ${err}`) }

  } else if (sub === 'checkout') {
    const newBranch = args.includes('-b')
    const branchName = newBranch ? args[args.indexOf('-b') + 1] : args[1]
    if (!branchName) { e('git checkout: missing branch name'); return }
    try {
      if (newBranch) {
        await git.branch({ fs, dir, ref: branchName })
        await git.checkout({ fs, dir, ref: branchName })
        wl(`Switched to new branch '${branchName}'`)
      } else {
        await git.checkout({ fs, dir, ref: branchName })
        wl(`Switched to branch '${branchName}'`)
      }
    } catch (err) { e(`git checkout: ${err}`) }

  } else if (sub === 'remote') {
    if (args[1] === 'add') {
      const remoteName = args[2]
      const remoteUrl = args[3]
      if (!remoteName || !remoteUrl) { e('git remote add: usage: git remote add <name> <url>'); return }
      try {
        await git.addRemote({ fs, dir, remote: remoteName, url: remoteUrl })
        wl(`Added remote ${remoteName} -> ${remoteUrl}`)
      } catch (err) { e(`git remote add: ${err}`) }
    } else {
      try {
        const remotes = await git.listRemotes({ fs, dir })
        if (!remotes.length) { wl('No remotes configured'); return }
        for (const { remote, url } of remotes) {
          wl(`${remote}\t${url} (fetch)`)
          wl(`${remote}\t${url} (push)`)
        }
      } catch (err) { e(`git remote: ${err}`) }
    }

  } else if (sub === 'clone') {
    const url = args[1]
    if (!url) { e('git clone: missing url'); return }
    let cloneDir: string
    if (args[2]) {
      cloneDir = resolvePath(state.cwd, args[2])
    } else {
      const seg = url.split('/').pop()?.replace(/\.git$/, '') ?? 'repo'
      cloneDir = state.cwd === '/' ? `/${seg}` : `${state.cwd}/${seg}`
    }
    try {
      wl(`Cloning into '${cloneDir}'...`)
      await git.clone({ fs, http, dir: cloneDir, url, singleBranch: true, onProgress })
      term.write('\r\n')
      wl(`Done. Cloned into ${cloneDir}`)
    } catch (err) { e(`git clone: ${err}`) }

  } else if (sub === 'pull') {
    const remote = args[1] ?? 'origin'
    const ref = args[2] ?? 'main'
    try {
      wl(`Pulling ${remote}/${ref}...`)
      await git.pull({
        fs, http, dir, remote, ref,
        author: { name: 'WebGPU Agent', email: 'agent@local' },
        onProgress,
      })
      term.write('\r\n')
      wl(`Pulled ${remote}/${ref}`)
    } catch (err) { e(`git pull: ${err}`) }

  } else if (sub === 'push') {
    // parse: git push [remote] [branch] [--username X --token Y]
    let remote = 'origin'
    let branch = 'main'
    let username: string | undefined
    let token: string | undefined
    let remoteSet = false

    const rest = args.slice(1)
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--username') { username = rest[++i]; continue }
      if (rest[i] === '--token') { token = rest[++i]; continue }
      if (rest[i].startsWith('-')) continue
      if (!remoteSet) { remote = rest[i]; remoteSet = true }
      else { branch = rest[i] }
    }

    // Extract embedded credentials from remote URL if not provided
    if (!username) {
      try {
        const remotes = await git.listRemotes({ fs, dir })
        const found = remotes.find((r) => r.remote === remote)
        if (found) {
          const m = found.url.match(/^https?:\/\/([^:@]+):([^@]+)@/)
          if (m) { username = m[1]; token = m[2] }
        }
      } catch { /* ignore */ }
    }

    try {
      wl(`Pushing to ${remote}/${branch}...`)
      await git.push({
        fs, http, dir, remote, remoteRef: branch,
        onAuth: username ? () => ({ username: username!, password: token ?? '' }) : undefined,
        onProgress,
        onAuthFailure: () => {
          e('git push: authentication failed — use --username and --token')
          return { cancel: true }
        },
      })
      term.write('\r\n')
      wl(`Pushed to ${remote}/${branch}`)
    } catch (err) { e(`git push: ${err}`) }

  } else {
    e(`git: unknown subcommand '${sub}'. Try: init, status, add, commit, log, diff, branch, checkout, remote, clone, pull, push`)
  }
}
