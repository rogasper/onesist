# Security Review Checklist (backend-gated)

Run only when the diff touches server-executed code. Report findings as **blocker / should-fix / nit** with file:line.

## AuthN / AuthZ
- Every new endpoint / server action checks the user is authenticated
- Every read/write enforces ownership or role — `where userId = currentUser.id` or equivalent
- No reliance on client-supplied user IDs / roles / tenant IDs
- No new public endpoints unless explicitly intended; document if so
- Session/token handling matches existing pattern; no new ad-hoc auth

## Input Validation & Injection
- Every input from the client is validated (zod / schema / explicit checks) at the boundary
- SQL: parameterized queries only; no string concatenation, no template-literal SQL with user input
- LIKE/ILIKE: user input escaped for `%`/`_` (and the escape char) before interpolation into a pattern — parameterization ≠ wildcard safety; searching "100%" must not match everything
- Query params: validate/coerce array-shaped params where scalars are expected (`?status[]=x` yields an array — scalar reads throw or silently change query semantics)
- NoSQL: no operator injection (`$where`, raw queries with user-controlled keys)
- Shell/exec: no `exec(userInput)`; if shelling out, use argv arrays, not strings
- Path traversal: any user-supplied path is normalized and confined to an allowed base directory
- Server-side fetch with user-supplied URL → SSRF risk; allowlist hosts
- Deserialization of user data — no `eval`, no untrusted JSON.parse into class instances, no YAML.load without safe schema

## Secrets & Config
- No hardcoded keys, tokens, passwords, or DSNs introduced
- Secrets accessed via existing env/config pattern, not `process.env.X` scattered ad-hoc
- No secrets logged (req body, headers including Authorization, error objects with config)

## Output & Information Leakage
- Errors returned to client don't leak stack traces, query text, or internal paths
- New API responses don't accidentally expose fields (password hashes, internal IDs, other users' data)
- No sensitive data in URL query strings (logged by proxies)

## Cryptography
- No hand-rolled crypto, no `Math.random()` for tokens/IDs (use `crypto.randomUUID` / `crypto.randomBytes`)
- Passwords hashed with the project's existing hasher (argon2/bcrypt/scrypt) — never plain SHA / MD5
- Comparing tokens / signatures uses constant-time compare (`crypto.timingSafeEqual`)

## Web-Specific
- HTML rendered from user input — properly escaped (framework default usually fine; flag `dangerouslySetInnerHTML`, `v-html`, `innerHTML`)
- New cookies — `HttpOnly`, `Secure`, `SameSite` set appropriately
- New CORS additions — origins not `*` for credentialed requests
- Redirects with user-controlled targets → open-redirect risk; allowlist

## Rate / Resource
- New endpoints exposing expensive operations behind auth + rate limit (or note absence as known acceptable)
- File uploads — size limits, MIME validation, stored outside web root

## Dependencies
- Any new package added — check it's the canonical maintained one (typosquatting), reasonable popularity, recent commits
