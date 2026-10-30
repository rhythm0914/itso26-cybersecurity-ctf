# CTF Platform Security Rules

## GLOBAL RULES (apply to every phase)

1. **Never put the salt, flag hashes, or correct-answer logic in the frontend.** All verification happens in `functions/api/solutions.js` against D1.
2. The salt is read **only** via `env.CTF_SALT` (Cloudflare secret). If it is missing at runtime, throw a clear error.
3. All flag comparisons use a **constant-time** helper `safeEqual(a, b)`.
4. `tools/generate_files.py` and `tools/admin-only/` are **never committed** (must be gitignored).
5. Trivia normalization: trim → strip `CTF{...}` wrapper → lowercase → remove non-alphanumerics. Non-trivia: trim only.
6. If a phase would require touching files outside its scope, stop and ask me first.
7. Use `@file` context references; do not scan unrelated files to save tokens.
8. When you are done with a phase, output:
   - Files created (full contents)
   - Files modified (diff or full new contents)
   - Files deleted
   - A 3-line summary of what changed
   - `STOPPING — waiting for confirmation to proceed to Phase N+1.`
