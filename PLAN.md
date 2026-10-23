# CTF website improvement plan

## Goal
Make the existing offline CTF platform UI-friendly and fully functional, and add a matchmaking-style lobby where each player joins from their own device by entering their own name into one of 3 slots. Players mark themselves ready; the Start button fires only when all 3 slots are filled and ready. An End Competition button ends the challenge early (board read-only). All UI updates live as state changes.

## Constraint honored
The site is explicitly offline/static ("no backend, no internet, no build step"). True cross-device realtime sync requires a WebSocket/SSE server, which would break the offline contract. Each player joins on their own device by typing their name into an empty slot (simulating matchmaking join). State lives in localStorage; ready toggles and button states update live on every change. All existing features (scoring, hints, attempts, lock, timer, export/import, scoreboard, writeups) are preserved unchanged.

## Chronological steps
1. Write PLAN.md + todo list (this file).
2. HTML (index.html): replace team registration + old lobby with unified matchmaking lobby (team name, school, your name form → 3 player slots grid, my-name input, ready toggle, start/end buttons).
3. CSS (css/style.css): matchmaking lobby panel, 3-column player grid, ready dots, you-badge, start/end button variants; keep all existing classes intact.
4. JS (js/app.js): matchmaking lobby state (joinLobby, setMyName, joinSlot, toggleMyReady, toggleSlotReady, canStart, endCompetition, mySlotIndex), live re-render of lobby/button states; gate start on all 3 ready; end ends clock early; preserve every existing function and behavior.
5. Verify: `node --check` on JS files, review rendered pages, confirm no regressions.
6. Commit and push to origin/main.

## Files touched
- PLAN.md (new)
- css/style.css
- index.html
- js/app.js

## Definition of done
- Lobby shows 3 player slots; each player joins by entering their name on their own device.
- Each slot has a live Ready toggle; the player marks themselves ready.
- Start button disabled unless all 3 members exist and are ready.
- Start starts the 90-min clock (existing behavior) and enables the board.
- End Competition ends the clock early, makes the board read-only, blocks submissions.
- All existing pages/features still work; `node --check` passes; committed and pushed.
