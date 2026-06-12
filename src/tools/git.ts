import git from 'isomorphic-git'
import defaultHttp from 'isomorphic-git/http/web'
import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git/http/web'
import type { ToolDef } from '../types'
import { fs } from '../fs/setup'

const CORS_PROXY = 'https://corsproxy.io/?url='

async function proxyRequest(req: GitHttpRequest): Promise<GitHttpResponse> {
  const proxyUrl = CORS_PROXY + encodeURIComponent(req.url)
  try {
    let bodyInit: BodyInit | undefined
    if (req.body) {
      const chunks: Uint8Array[] = []
      for await (const chunk of req.body) chunks.push(chunk)
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const merged = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length }
      bodyInit = merged
    }
    const response = await fetch(proxyUrl, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: bodyInit,
    })
    const buffer = await response.arrayBuffer()
    return {
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(response.headers.entries()),
      body: buffer as any,
      statusCode: response.status,
      statusMessage: response.statusText,
    }
  } catch {
    return defaultHttp.request(req)
  }
}

const http: HttpClient = { request: proxyRequest }

const gitInit: ToolDef = {
  name: 'git_init',
  description: 'Initialize a git repository at the given path.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Directory path (defaults to /)' } },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      await git.init({ fs, dir })
      return `Initialized git repo at ${dir}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitStatus: ToolDef = {
  name: 'git_status',
  description: 'Show working tree status.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Repo path (defaults to /)' } },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const matrix = await git.statusMatrix({ fs, dir })
      const lines = matrix.map(([file, head, workdir, stage]) => {
        const h = head === 1 ? 'H' : ' '
        const w = workdir === 1 ? ' ' : workdir === 2 ? 'M' : 'D'
        const s = stage === 1 ? ' ' : stage === 2 ? 'A' : stage === 3 ? 'M' : 'D'
        return `${h}${s}${w} ${file}`
      })
      return lines.length ? lines.join('\n') : 'nothing to commit, working tree clean'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitAdd: ToolDef = {
  name: 'git_add',
  description: 'Stage files for commit.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
      filepath: { type: 'string', description: 'File or pattern to stage (defaults to .)' },
    },
    required: [],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const filepath = String(args.filepath ?? '.')
      await git.add({ fs, dir, filepath })
      return `Staged: ${filepath}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitCommit: ToolDef = {
  name: 'git_commit',
  description: 'Create a commit.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
      message: { type: 'string', description: 'Commit message' },
      author_name: { type: 'string', description: 'Author name' },
      author_email: { type: 'string', description: 'Author email' },
    },
    required: ['message'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const sha = await git.commit({
        fs,
        dir,
        message: String(args.message),
        author: {
          name: String(args.author_name ?? 'Agent'),
          email: String(args.author_email ?? 'agent@localhost'),
        },
      })
      return `Commit: ${sha}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitLog: ToolDef = {
  name: 'git_log',
  description: 'Show commit history.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
      depth: { type: 'number', description: 'Max commits to show (default 10, max 20)' },
    },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const depth = Math.min(Number(args.depth ?? 10), 20)
      const commits = await git.log({ fs, dir, depth })
      const lines = commits.map((c) => {
        const { oid, commit } = c
        const date = new Date(commit.author.timestamp * 1000).toISOString()
        return `${oid.slice(0, 7)} ${date} ${commit.author.name}: ${commit.message.trim()}`
      })
      return lines.join('\n') || 'No commits'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitDiff: ToolDef = {
  name: 'git_diff',
  description: 'Show diff of uncommitted changes.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
    },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const matrix = await git.statusMatrix({ fs, dir })
      const changed = matrix.filter(([, head, workdir, stage]) => {
        return !(head === 1 && workdir === 1 && stage === 1)
      })
      if (!changed.length) return 'No changes'
      const lines: string[] = []
      for (const [file, head, workdir] of changed) {
        if (head === 0 && workdir === 2) {
          lines.push(`+++ ${file} (new file)`)
          try {
            const content = await fs.promises.readFile(`${dir}/${file}`, { encoding: 'utf8' }) as string
            content.split('\n').forEach((l) => lines.push(`+ ${l}`))
          } catch { /* file unreadable, skip diff body */ }
        } else if (head === 1 && workdir === 0) {
          lines.push(`--- ${file} (deleted)`)
        } else {
          lines.push(`~ ${file} (modified)`)
        }
      }
      return lines.join('\n')
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitPush: ToolDef = {
  name: 'git_push',
  description: 'Push commits to remote.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
      remote: { type: 'string', description: 'Remote name (defaults to origin)' },
      branch: { type: 'string', description: 'Branch name (defaults to main)' },
      username: { type: 'string', description: 'Git username' },
      token: { type: 'string', description: 'Auth token or password' },
    },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const remote = String(args.remote ?? 'origin')
      const branch = String(args.branch ?? 'main')
      const onAuth = args.username
        ? () => ({ username: String(args.username), password: String(args.token ?? '') })
        : undefined
      await git.push({ fs, http, dir, remote, remoteRef: branch, onAuth })
      return `Pushed to ${remote}/${branch}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitClone: ToolDef = {
  name: 'git_clone',
  description: 'Clone a remote repository.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Repository URL' },
      dir: { type: 'string', description: 'Destination directory (defaults to /)' },
      depth: { type: 'number', description: 'Shallow clone depth' },
    },
    required: ['url'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const url = String(args.url)
      const dir = String(args.dir ?? '/')
      const depth = args.depth ? Number(args.depth) : undefined
      await git.clone({ fs, http, dir, url, depth, singleBranch: true })
      return `Cloned ${url} into ${dir}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const gitPull: ToolDef = {
  name: 'git_pull',
  description: 'Pull from remote.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repo path (defaults to /)' },
      remote: { type: 'string', description: 'Remote name (defaults to origin)' },
      branch: { type: 'string', description: 'Branch name (defaults to main)' },
    },
  },
  source: 'builtin',
  async execute(args) {
    try {
      const dir = String(args.path ?? '/')
      const remote = String(args.remote ?? 'origin')
      const ref = String(args.branch ?? 'main')
      await git.pull({
        fs,
        http,
        dir,
        remote,
        ref,
        author: { name: 'Agent', email: 'agent@localhost' },
      })
      return `Pulled ${remote}/${ref}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const gitTools: ToolDef[] = [
  gitInit,
  gitStatus,
  gitAdd,
  gitCommit,
  gitLog,
  gitDiff,
  gitPush,
  gitClone,
  gitPull,
]
