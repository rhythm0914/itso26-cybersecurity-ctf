# PROJECT.md - IT Skills Olympics 2026 CTF Platform

## Overview

This is a **client-side CTF (Capture The Flag) platform** for the IT Skills Olympics 2026 Cybersecurity Category. It features a full competition simulator with team management, challenge board, scoring system, and timer. The platform can run entirely offline (no build step) or be deployed to Cloudflare Pages with a D1 database backend for multi-user LAN/network play.

**Key Characteristics:**
- Pure static frontend (HTML/CSS/vanilla JS) - works from file://, local server, or any static host
- Optional Cloudflare Pages Functions + D1 database backend for team-based multiplayer
- 19 graded challenges (Easy/Average/Difficult) + trivia + hidden tiebreaker
- 90-minute competition timer with strict submission rules
- Client-side flag hashing with salted SHA-256
- No build tools, no npm dependencies in frontend (only wrangler for deployment)

## Tech Stack

### Frontend
- **Languages**: HTML5, CSS3, Vanilla JavaScript (ES5-style, no frameworks)
- **Styling**: Custom CSS with CSS variables, dark terminal/HTB-inspired theme
- **Hashing**: 
  - Native `crypto.subtle.digest('SHA-256')` when in secure context
  - Custom pure-JS SHA-256 fallback (`js/sha256.js`) for HTTP/LAN (non-secure contexts)
- **Storage**: `localStorage` for offline state, plus server-side via API in online mode
- **Fonts**: System fonts + monospace stack

### Backend (Cloudflare Pages)
- **Platform**: Cloudflare Pages with Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Runtime**: Cloudflare Workers (Web Crypto API available)
- **Auth**: Cookie-based sessions (`cf_session` for users, `ctf_member` for lobby members)
- **Password Hashing**: PBKDF2-SHA512 (100000 iterations) via Web Crypto
- **Email**: Optional via Resend or SendGrid APIs

### DevOps/Deployment
- **Dev Server**: `wrangler dev` (Cloudflare)
- **Deploy**: `wrangler pages deploy .` or GitHub/Cloudflare Pages
- **Package Manager**: npm (minimal - only wrangler as devDependency)
- **Migrations**: SQL files in `migrations/` directory

## Project Structure

```
D:\CTF/
├── index.html              # Landing page, registration, lobby
├── challenges.html         # Challenge board with modal
├── scoreboard.html         # Leaderboard and stats
├── writeups.html           # Solutions and Kali tool guide
├── dashboard.html          # User dashboard
├── login.html/signup.html  # Auth pages
├── admin.html              # Admin panel
├── css/style.css           # All styles
├── js/
│   ├── app.js             # Core app logic, UI, scoring, timer, hashing
│   ├── config.js          # Event config (salt, timing, points, etc.)
│   ├── challenges.js      # Challenge definitions (flags as hashes)
│   ├── auth.js            # Auth-related JS
│   └── sha256.js          # Pure JS SHA-256 fallback
├── functions/             # Cloudflare Pages Functions (API routes)
│   ├── _lib.js            # Shared utilities (auth, hashing, rate limiting)
│   └── api/
│       ├── me.js          # Get current user/team
│       ├── control.js     # Start/restart/end competition
│       ├── solutions.js   # Submit/record solutions
│       ├── scoreboard.js  # Leaderboard data
│       ├── teams/         # Team management
│       ├── auth/          # Auth endpoints
│       └── admin/         # Admin endpoints
├── migrations/            # D1 database migrations
│   ├── 001_initial_schema.sql
│   ├── 002_users_and_teams_ext.sql
│   ├── 003_requests_messages_notifications.sql
│   └── 004_rate_limits_and_settings.sql
├── files/                 # Challenge artifacts (pcaps, logs, images, etc.)
├── data/                  # Published leaderboard
│   ├── scoreboard.json
│   └── scoreboard.js
├── tools/
│   ├── hash.html          # Flag hash generator
│   └── generate_files.py  # Regenerate challenge artifacts
└── wrangler.jsonc         # Cloudflare config
```

## Core Systems

### 1. Configuration (`js/config.js`)
```javascript
window.CTF_CONFIG = {
  eventName: "IT Skills Olympics 2026",
  categoryName: "Cybersecurity Category",
  salt: "",
  durationMinutes: 90,
  practiceMode: false,
  showTiebreaker: false,
  maxAttempts: 3,
  minAward: 0,
  points: { easy: 50, average: 100, difficult: 150, trivia: 30 },
  hintCost: { easy: 20, average: 60, difficult: 100, trivia: 0 },
  apiBase: "",
  categories: [...],
  difficultyLabels: {...}
}
```

### 2. Challenge System
- **Flag Hashing**: `hash = SHA256(salt + "::" + normalized_answer)`. Normal: trimmed case-sensitive if `caseSensitive: true`. Trivia: trimmed, lowercased, punctuation removed if `caseSensitive: false` (also accepts CTF{...} wrapper)
- **Hints**: Unlocked sequentially, each costs points. `award = max(minAward, basePoints - totalHintCost)`
- **Attempts**: 3 wrong attempts → challenge locked permanently
- **Tiebreaker**: `tb-vuln-vs-threat` never counts towards total score

### 3. API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/me` | GET | Get current user/team/member state |
| `/api/auth/login` | POST | Login |
| `/api/auth/register` | POST | Register |
| `/api/auth/logout` | POST | Logout |
| `/api/teams/create` | POST | Create team/lobby |
| `/api/teams/join` | POST | Join team |
| `/api/teams/[teamId]` | GET/PATCH | Team operations |
| `/api/teams/leave` | POST | Leave team |
| `/api/solutions` | POST | Record solution |
| `/api/control` | POST | Start/restart/end competition |
| `/api/scoreboard` | GET | Leaderboard |
| `/api/admin/*` | Various | Admin operations |

## Running the Project

```bash
# Local dev server
python3 -m http.server 8000  # or py -3 -m http.server 8000
# Open http://localhost:8000

# Cloudflare dev
npm install && npm run dev

# Deploy
npm run deploy
```

## Adding a New Challenge
1. Create artifact in `files/`
2. Generate hash: open `tools/hash.html`, enter flag (uses salt from config)
3. Add to `js/challenges.js` 
4. Verify: `python3 tools/generate_files.py --verify`

## Notes
- Client-side hashes mean flags are visible to determined users - suitable for practice/training only
- HTTP on LAN requires `js/sha256.js` fallback (no secure context)
- Works offline from file:// or any static host
- Teams of 3, 90-minute timer, 3 attempts per challenge
