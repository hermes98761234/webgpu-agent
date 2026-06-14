import type { Skill } from '../types'

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'file-system',
    name: 'File System',
    description: 'Create, read, update, delete and navigate files using fs_ tools',
    instructions: `# File System Skill

You have access to a virtual file system backed by IndexedDB (persists across browser sessions).
All paths must be **absolute** (start with \`/\`). The root is \`/\`.

## Tools Reference

| Tool | Purpose | Key Args |
|------|---------|----------|
| \`fs_list\` | List directory contents | \`path\` |
| \`fs_read\` | Read a file (max 50 KB) | \`path\` |
| \`fs_write\` | Write / overwrite a file | \`path\`, \`content\` |
| \`fs_mkdir\` | Create directory (including parents) | \`path\` |
| \`fs_delete\` | Delete file or directory | \`path\`, \`recursive?: true\` |
| \`fs_move\` | Rename / move | \`from\`, \`to\` |

## Workflow Patterns

### Explore what exists
\`\`\`
fs_list { "path": "/" }
fs_list { "path": "/myproject" }
\`\`\`

### Read a file
\`\`\`
fs_read { "path": "/myproject/src/index.ts" }
\`\`\`

### Create a new project skeleton
1. \`fs_mkdir { "path": "/myproject/src" }\`
2. \`fs_write { "path": "/myproject/package.json", "content": "{ ... }" }\`
3. \`fs_write { "path": "/myproject/src/index.ts", "content": "..." }\`

### Edit an existing file
1. \`fs_read\` the current content
2. Modify it in memory
3. \`fs_write\` the full new content back to the same path

### Delete a whole directory tree
\`\`\`
fs_delete { "path": "/myproject/dist", "recursive": true }
\`\`\`

### Move or rename
\`\`\`
fs_move { "from": "/myproject/oldname.ts", "to": "/myproject/newname.ts" }
\`\`\`

## Important Rules

- **Always use absolute paths.** Never use relative paths like \`./foo\`.
- \`fs_write\` **overwrites** the whole file — read first if you only want to patch part of it.
- \`fs_write\` auto-creates parent directories; you don't need \`fs_mkdir\` before writing a nested file.
- Files larger than 50 KB are truncated on read — split big files if you need to process them fully.
- The filesystem is per-browser and persists in IndexedDB under the key \`webgpu-agent-fs\`.
- The agent's own configuration lives in \`/home/user/.agent\`: \`agent.md\` (system prompt),
  \`skills/<name>/SKILL.md\`, \`plugins/*.json\`, and \`mcp.json\`. Editing these files changes
  the agent's behavior (skills take effect after reload).
- There is no undo — deleted files are gone. Confirm with the user before mass deletion.

## Typical Session

\`\`\`
User: "Create a hello-world Node project"

1. fs_mkdir  { "path": "/hello-world" }
2. fs_write  { "path": "/hello-world/package.json",
               "content": "{\\"name\\":\\"hello-world\\",\\"version\\":\\"1.0.0\\"}" }
3. fs_write  { "path": "/hello-world/index.js",
               "content": "console.log('Hello, world!');" }
4. fs_list   { "path": "/hello-world" }   // verify
\`\`\`
`,
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Run Python code in the browser with run_python',
    instructions: `# Python Skill

You have access to run_python — an in-browser Python execution environment powered by PyScript (Pyodide).

## Tool Reference

| Tool | Purpose | Key Args |
|------|---------|----------|
| \`run_python\` | Execute Python code | \`code\` |

## Key Facts
- Full CPython 3.x via Pyodide (WebAssembly)
- Standard library available: math, json, collections, re, datetime, etc.
- Use \`print()\` for output — it is captured and returned.
- Variables and imports persist between calls in the same session.
- 15-second timeout per call.
- No network access (fetch/requests will fail).
- No DOM access — this runs in a Web Worker.

## Examples

### Simple calculation
\`\`\`
run_python { "code": "print(2 ** 100)" }
\`\`\`

### Use math module
\`\`\`
run_python { "code": "import math\\nprint(math.factorial(20))" }
\`\`\`

### Process data
\`\`\`
run_python { "code": "data = [3, 1, 4, 1, 5, 9, 2, 6]\\nprint(sorted(data))\\nprint(sum(data) / len(data))" }
\`\`\`

### String manipulation
\`\`\`
run_python { "code": "text = 'Hello, World!'\\nprint(text.lower())\\nprint(text.replace('World', 'Python'))" }
\`\`\`

### Work with JSON
\`\`\`
run_python { "code": "import json\\ndata = {'users': [{'name': 'Alice', 'age': 30}, {'name': 'Bob', 'age': 25}]}\\nprint(json.dumps(data, indent=2))" }
\`\`\`

### Use collections
\`\`\`
run_python { "code": "from collections import Counter\\nwords = 'the cat sat on the mat the cat'.split()\\nprint(Counter(words))" }
\`\`\`

## Tips
- Combine multiple statements in one call for complex logic.
- Import modules at the top — they persist across calls.
- For large data processing, break into multiple calls.
- Use \`json.dumps()\` to format complex output.
`,
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Initialize repos, commit, push/pull, clone, and deploy with git_ tools',
    instructions: `# Git Skill

You have access to isomorphic-git running in the browser. It uses the virtual file system
(same as the File System skill) for repo storage. Network operations (push/pull/clone) go
through a CORS proxy built into isomorphic-git's HTTP module.

## Tools Reference

| Tool | Purpose | Key Args |
|------|---------|----------|
| \`git_init\` | Create a new empty repo | \`path?\` (default \`/\`) |
| \`git_clone\` | Clone a remote repo | \`url\`, \`dir?\`, \`depth?\` |
| \`git_status\` | Working tree status | \`path?\` |
| \`git_add\` | Stage files | \`path?\`, \`filepath?\` (default \`.\`) |
| \`git_commit\` | Create a commit | \`message\`, \`path?\`, \`author_name?\`, \`author_email?\` |
| \`git_log\` | Show commit history | \`path?\`, \`depth?\` (default 10) |
| \`git_diff\` | Show unstaged diff | \`path?\` |
| \`git_push\` | Push to remote | \`path?\`, \`remote?\`, \`branch?\`, \`username?\`, \`token?\` |
| \`git_pull\` | Pull from remote | \`path?\`, \`remote?\`, \`branch?\` |

All \`path\` args default to \`/\` (the FS root). Pass a sub-path like \`/myproject\` when
the repo lives in a subdirectory.

## Common Workflows

### Start a brand-new repo and push to GitHub

\`\`\`
1. git_init   { "path": "/myproject" }
2. (create files with fs_write)
3. git_add    { "path": "/myproject" }
4. git_commit { "path": "/myproject", "message": "Initial commit",
                "author_name": "Alice", "author_email": "alice@example.com" }
5. git_push   { "path": "/myproject",
                "remote": "https://github.com/alice/myproject.git",
                "branch": "main",
                "username": "alice",
                "token": "<GitHub PAT>" }
\`\`\`

### Clone an existing repo and make changes

\`\`\`
1. git_clone  { "url": "https://github.com/alice/myproject.git",
                "dir": "/myproject", "depth": 1 }
2. (edit files with fs_read / fs_write)
3. git_status { "path": "/myproject" }
4. git_add    { "path": "/myproject" }
5. git_commit { "path": "/myproject", "message": "fix: update readme",
                "author_name": "Alice", "author_email": "alice@example.com" }
6. git_push   { "path": "/myproject", "username": "alice", "token": "<PAT>" }
\`\`\`

### Check what changed before committing

\`\`\`
git_diff   { "path": "/myproject" }   // unstaged changes
git_status { "path": "/myproject" }   // staged vs unstaged summary
git_log    { "path": "/myproject", "depth": 5 }
\`\`\`

### Deploy to GitHub Pages

GitHub Pages serves from the \`gh-pages\` branch (or \`/docs\` folder on \`main\`).

**Option A — push a \`dist/\` folder to gh-pages:**
\`\`\`
1. (build your project so /myproject/dist exists)
2. git_init   { "path": "/gh-pages-tmp" }
3. (fs_write all dist files into /gh-pages-tmp)
4. git_add    { "path": "/gh-pages-tmp" }
5. git_commit { "path": "/gh-pages-tmp", "message": "deploy" }
6. git_push   { "path": "/gh-pages-tmp",
                "remote": "https://github.com/alice/myproject.git",
                "branch": "gh-pages",
                "username": "alice", "token": "<PAT>" }
\`\`\`

**Option B — use GitHub Actions** (recommended for Vite projects):
Add a \`.github/workflows/deploy.yml\` that runs \`vite build\` and uses
\`actions/deploy-pages\`. Commit and push that file; GitHub runs the build.

## Authentication

- **GitHub PAT (Personal Access Token)**: Create at GitHub → Settings → Developer settings →
  Personal access tokens. Needs \`repo\` scope for private repos, \`public_repo\` for public.
- **Never hardcode tokens** in committed files. Pass them as the \`token\` argument at runtime.
- The token is only held in memory during the tool call; it is not stored.

## CORS Note

Push/pull/clone to GitHub works through isomorphic-git's HTTP web module, which uses the
browser's \`fetch\`. GitHub's API supports CORS for authenticated requests, so push/pull to
\`github.com\` works directly. Other hosts may require a CORS proxy.

## Status Matrix Legend

\`git_status\` output columns: \`[H][S][W] filepath\`
- \`H\` = HEAD  \`S\` = Staged (index)  \`W\` = Worktree
- \`A\` = Added  \`M\` = Modified  \`D\` = Deleted  space = unchanged

## Important Rules

- Always \`git_init\` or \`git_clone\` before any other git command on a directory.
- \`git_add\` with no \`filepath\` stages **everything** (\`.\`). Pass a specific path to
  stage individual files.
- After cloning, the remote is already set; for \`git_push\` you can omit \`remote\`.
- Commits require \`author_name\` and \`author_email\`. Default to "WebGPU Agent" and
  "agent@local" if the user hasn't specified values.
`,
  },
  {
    id: 'schedule',
    name: 'Schedule',
    description: 'Manage goals and scheduled tasks with reminders',
    instructions: `# Schedule Skill

You have access to goal and schedule management tools. Goals are single items with deadlines,
schedules are recurring tasks that trigger at intervals.

## Tools Reference

| Tool | Purpose | Key Args |
|------|---------|----------|
| \`goal_create\` | Create a new goal | \`title\`, \`description?\`, \`deadline?\` |
| \`goal_list\` | List all goals | — |
| \`goal_complete\` | Mark goal as done | \`id\` |
| \`goal_delete\` | Delete a goal | \`id\` |
| \`schedule_create\` | Create a scheduled task | \`title\`, \`intervalMs\`, \`description?\` |
| \`schedule_list\` | List all schedules | — |
| \`schedule_pause\` | Pause/resume a schedule | \`id\` |
| \`schedule_delete\` | Delete a schedule | \`id\` |

## Interval Presets

- 60000 (1 minute)
- 300000 (5 minutes)
- 900000 (15 minutes)
- 3600000 (1 hour)
- 21600000 (6 hours)
- 86400000 (daily)
- 604800000 (weekly)

## Examples

### Create a goal
\`\`\`
goal_create { "title": "Learn WebGPU", "deadline": 1751241600000 }
\`\`\`

### Create a daily schedule
\`\`\`
schedule_create { "title": "Daily standup", "intervalMs": 86400000 }
\`\`\`

### List active goals
\`\`\`
goal_list {}
\`\`\`

## Important Rules

- Goals are single items; use schedules for recurring tasks
- Data persists in the virtual filesystem
- A Web Worker checks for due schedules when the tab is active
- Use \`/goal\` or \`/schedule\` commands to open the management UI
`,
  },
]
