# CTF website improvement plan

## Goal
Make the existing offline CTF platform UI-friendly and fully functional, and add a 3-player maximum lobby with matchmaking-style ready state: register team (3 members), each player toggles "Ready", the Start button is enabled only when all 3 are ready, Start begins the 90-minute challenge clock, and an End Competition button ends the challenge early (board read-only). All UI updates live as state changes.

## Constraint honored
The site is explicitly offline/static ("no backend, no internet, no build step"). True cross-browser realtime sync requires a WebSocket/SSE server, which would break the offline contract. The lobby is therefore implemented as a fully functional local matchmaking simulation in one browser: state lives in localStorage, ready toggles and button states update live on every change, and all existing features (scoring, hints, attempts, lock, timer, export/import, scoreboard, writeups) are preserved unchanged.

## Chronological steps
1. Write PLAN.md + todo list (this file).
2. CSS (css/style.css): lobby panel, player slot rows, ready toggle chips, start/end button variants, minor card/modal/scoreboard polish; keep all existing classes intact.
3. HTML (index.html): replace team-card area with lobby section (registration form + 3 player slots + ready chips + Start/End buttons); keep nav/header/footer untouched.
4. JS (js/app.js): add lobby state (per-member ready flags), `toggleReady`, `canStart`, `endCompetition`, live re-render of lobby/button states; gate start on all 3 ready; preserve every existing function and behavior.
5. Verify: `node --check` on JS files, review rendered pages, confirm no regressions.
6. Commit and push to origin/main.

## Files touched
- PLAN.md (new)
- css/style.css
- index.html
- js/app.js

## Definition of done
- Registration requires team name, school, 3 members (unchanged).
- Lobby shows 3 player slots; each has a live Ready toggle.
- Start button disabled unless all 3 members exist and are ready.
- Start starts the 90-min clock (existing behavior) and enables the board.
- End Competition ends the clock early, makes the board read-only, blocks submissions.
- All existing pages/features still work; `node --check` passes; committed and pushed.
