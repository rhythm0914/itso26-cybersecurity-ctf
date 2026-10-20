# IT Skills Olympics 2026 — Cybersecurity Category (offline CTF platform)

A complete, dependency-free **capture-the-flag** platform that simulates the Cybersecurity
Category of the IT Skills Olympics 2026: team registration, a 90 minute competition clock,
19 graded challenges plus a trivia round and one hidden tiebreaker, hints that cost points,
a 3 attempt limit, a simulated leaderboard, exportable progress and full writeups.

Pure static site: HTML, CSS and vanilla JavaScript. **No backend, no build step, no npm
packages, no CDN calls.** It works from `file://`, from `python3 -m http.server`, over a
LAN address and offline on a laptop with the network unplugged.

---

## 1. Run it locally

### Option A — double click

Open `index.html` in any modern browser. Everything works, including flag checking
(a pure JavaScript SHA-256 is used when `crypto.subtle` is unavailable, which is the
case for some browsers on `file://`).

### Option B — local web server (recommended)

```bash
cd /path/to/CTF
python3 -m http.server 8000
# Windows:  py -3 -m http.server 8000
```

Then open <http://localhost:8000/>.

### Option C — LAN practice with your team

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Find your address with `ip addr` (Linux) or `ipconfig` (Windows) and share it, e.g.
<http://192.168.1.20:8000/>. Everyone on the same network can register their own team
and compete against the published rival teams.

> **Why the bundled SHA-256 fallback exists:** `crypto.subtle` is only exposed in
> *secure contexts*. `http://192.168.x.x:8000` is plain HTTP and therefore **not** a
> secure context — `crypto.subtle` is `undefined` there and a naive implementation
> would break flag checking for the whole LAN. `js/sha256.js` is a dependency-free
> SHA-256 that takes over automatically. It is used whenever `crypto.subtle` is missing
> or throws.

### Static hosting

Any static host works: copy the folder as-is. There is nothing to build.

---

## 2. LAN practice — build your own network (as in the real contest)

In the real competition the teams have to configure their own network. Practise it with
Kali Linux before the event.

**Connect two laptops** with a UTP (Cat5e/Cat6) cable. Modern switches and NICs
auto-MDI-X, so you normally do **not** need a crossover cable. If the link stays down,
use a small switch or an active hub between the two machines.

```bash
# what do I have right now?
ip -br addr
ip route

# static address with NetworkManager (recommended)
nmcli con show
nmcli con mod "Wired connection 1" ipv4.method manual \
       ipv4.addresses 192.168.10.50/24 ipv4.gateway 192.168.10.1 \
       ipv4.dns "9.9.9.9 1.1.1.1"
nmcli con up "Wired connection 1"

# ... or without NetworkManager
sudo ip addr add 192.168.10.50/24 dev eth0
sudo ip route add default via 192.168.10.1

# verify
ping -c 4 192.168.10.1        # the "gateway" (the other laptop)
ping -c 4 8.8.8.8             # does the internet work at all?
nmcli device status
```

Put both laptops in the same subnet (`192.168.10.0/24`), verify with `ping` and
`arp -n`, then start the simulator on one of them and let the others open
`http://192.168.10.50:8000/`.

---

## 3. The competition rules (implemented by the site)

| Rule | Implementation |
| --- | --- |
| Teams of exactly 3 members | Registration form on `index.html` requires team name, school and three member names |
| 1 h 30 min total | `durationMinutes: 90` in `js/config.js`; the end timestamp is absolute, so it survives a refresh |
| Board locked before the start | `challenges.html` shows a lock panel until "Start Competition" is pressed |
| Submissions blocked after time is up | The board becomes read only, the submit button is disabled |
| No internet, own tools | The downloads in `/files` contain everything you need; the Kali tool guide lists the commands |
| Scoring by difficulty | Easy 50, Average 100, Difficult 150, Trivia 30 → **1500 points** in total |
| 3 hints, in order, each one costs points | Easy −20, Average −60, Difficult −100; award = `max(minAward, points − total hint cost)` |
| 3 attempts, then permanent lock | The lock is stored in `localStorage`, a refresh does not reset it |
| Ranking | Highest score wins; ties are broken by the **earlier last correct submission** |
| Hidden tiebreaker | `showTiebreaker: true` in `js/config.js` reveals `tb-vuln-vs-threat`; it never counts towards the total |
| No attacking the host, no sharing flags, no brute forcing the submit form | Stated in the rules; the 3 attempt limit removes the need for a cooldown |

---

## 4. Repository layout

```
index.html            landing page, rules, team registration
challenges.html       challenge board (cards, filters, modal)
scoreboard.html       standings, own breakdown, export / import / reset
writeups.html         solutions + Kali Linux tool guide (one section per
                      official area — every challenge links to its own area)
css/style.css         dark terminal theme, responsive, no external fonts
js/app.js             UI, scoring, timer, storage, hashing glue
js/sha256.js          pure JavaScript SHA-256 fallback for crypto.subtle
js/challenges.js      challenge data — the file you edit to add challenges
js/config.js          salt, timer, scoring, practice mode, tiebreaker switch
files/                real downloadable challenge artefacts (generated)
data/scoreboard.json  published leaderboard (hand editable)
data/scoreboard.js    JavaScript copy, used when the site runs from file://
tools/hash.html       salted flag hash generator
tools/generate_files.py  regenerates every file in /files and prints all hashes
README.md             this file
```

---

## 5. Add a challenge

### 5.1 Create the artefact

Write the file the team will download into `files/`, e.g. `files/my_challenge.txt`.
You can also let the generator produce it — see [section 7](#7-regenerating-the-downloadable-files).

### 5.2 Generate the hash

Open `tools/hash.html` in your browser (or run `python3 -m http.server` and open
<http://localhost:8000/tools/hash.html>).

1. Type the flag, e.g. `CTF{my_new_flag}`.
2. Choose **Case sensitive** for a normal challenge, **Trivia** for a trivia answer.
3. Copy the 64 character hex string.

The scheme is:

```
hash = SHA256( salt + "::" + normalised_answer )
```

* the salt comes from `js/config.js` (`salt: "itso26-cyber-lantern-9f3c"`) — if you change
  it there you must regenerate **all** hashes;
* normal answers are trimmed and compared case sensitively;
* trivia answers are trimmed, lower cased and `, . ; : ! ?` are removed, so
  "Confidentiality, Integrity, Availability" also matches.

### 5.3 Add the challenge to `js/challenges.js`

```js
{
  id: "my-new-challenge",              // unique slug, also the storage key
  title: "My New Challenge",
  topic: "essential",                  // essential | network | endpoint | risk
  difficulty: "easy",                  // easy | average | difficult | trivia
  points: 50,
  description: "What the player has to do. Plain text, no HTML.",
  files: ["files/my_challenge.txt"],
  hints: [
    { text: "First hint - it will cost 20 points.",  cost: 20 },
    { text: "Second hint - it will cost 20 points.", cost: 20 },
    { text: "Third hint - it will cost 20 points.",  cost: 20 }
  ],
  flagHash: "<the hash from tools/hash.html>",
  altHashes: [],                       // optional extra accepted answers
  caseSensitive: true,                 // false for trivia
  tools: ["strings", "grep"],          // recommended Kali tools
  writeup: "Step by step solution with the exact commands."
}
```

Truncate challenges have `hints: []` (trivia never costs points).

Multiple accepted answers: generate one hash per alternative and put them into
`altHashes` (the checker accepts a match against any of them).

### 5.4 Check that everything still matches

```bash
python3 tools/generate_files.py --verify
```

The script regenerates all artefacts, re-reads them, proves that the flag can be
recovered exactly the way the challenge describes and compares every hash with
`js/challenges.js`.

---

## 6. Configure the event (`js/config.js`)

```js
window.CTF_CONFIG = {
  eventName: "IT Skills Olympics 2026",
  categoryName: "Cybersecurity Category",
  salt: "itso26-cyber-lantern-9f3c",   // must match tools/generate_files.py
  durationMinutes: 90,
  practiceMode: false,                 // true -> restart + "Reset everything" + writeups always open
  showTiebreaker: false,               // true -> reveal the hidden tiebreaker challenge
  maxAttempts: 3,
  minAward: 0,                         // awarded = max(minAward, points - hint cost)
  points:    { easy: 50, average: 100, difficult: 150, trivia: 30 },
  hintCost:  { easy: 20, average: 60,  difficult: 100, trivia: 0 },
  storageKey: "itso26.cybersecurity.state.v1",
  ...
};
```

**Practice mode** (`practiceMode: true`): the "Reset everything" button appears on the home
page and the scoreboard, the competition can be restarted as often as you like (the
"Restart competition" button re-arms the 90 minute clock and keeps your points) and the
writeups are unlocked from the start.

**Exam simulation mode** (`practiceMode: false`, the default): the competition can only
be started once, the writeups unlock when the countdown reaches zero, and "Reset
everything" is hidden.

**Tiebreaker** (`showTiebreaker: true`): the challenge `tb-vuln-vs-threat` appears on the
board. It is never counted towards the total score — it only decides a tie.

---

## 7. Regenerating the downloadable files

```bash
python3 tools/generate_files.py            # write files/ and print every flag + hash
python3 tools/generate_files.py --verify   # additionally check js/challenges.js
python3 tools/generate_files.py --json     # machine readable summary
```

The script uses **only the Python standard library** and rebuilds every artefact in
`files/`:

| File | How it is produced |
| --- | --- |
| `esp_base64_rot13.txt` | Base64 of the ROT13 shifted flag |
| `esp_md5_hashes.txt`, `esp_wordlist.txt` | MD5 / SHA-1 / SHA-256 hashes plus the wordlist |
| `esp_shadow.txt`, `esp_passwords.txt` | fake `/etc/shadow` with crypt(3) MD5 hashes |
| `esp_xor.txt` | repeating-key XOR of the flag, hex encoded |
| `net_subnet_plan.txt` | IP plan of the lab (192.168.10.77/26) |
| `net_nmap_scan.txt`, `net_nmap_scan.xml` | hand written nmap output plus the XML variant |
| `net_capture_login.pcap` | **real pcap written by hand** (Ethernet + IPv4 + TCP) with a cleartext FTP login |
| `net_firewall_rules.sh` | `iptables-save` style rules with the leaking rule |
| `net_dns_exfil.pcap` | **real pcap written by hand** with DNS TXT exfiltration chunks |
| `end_auth.log` | sshd log with a password spray and one successful login |
| `end_crontab.txt`, `end_systemd.service` | persistence mechanisms, one with a Base64 payload |
| `end_obfuscated.sh` | Bash script with two reversed Base64 segments |
| `end_secret.png` | **real PNG built with `zlib`** (IHDR/tEXt/IDAT/IEND) with data appended behind IEND |
| `vam_scan_report.csv/.xml`, `vam_asset_criticality.csv` | Nessus style report plus asset criticality list |

Every generator runs a self check: it re-reads the file it just wrote and proves that the
flag can be recovered from it the way the challenge description promises (decoding the
Base64/hex/XOR, extracting the FTP `PASS` line, reassembling the DNS TXT records, parsing
the PNG chunk, recomputing the risk matrix ...). A mismatch aborts the script.

---

## 8. Pre-contest checklist — Kali Linux tools

Install everything **before** the competition, there is no internet during the event.

```bash
sudo apt update
sudo apt install -y nmap wireshark tshark john hashcat hashid \
    binwalk exiftool steghide strings file python3 openssl gawk \
    net-tools wordlists
```

| Tool | Install / prepare | Used for |
| --- | --- | --- |
| `nmap` | `sudo apt install nmap` | service/version scans, host discovery |
| `wireshark` / `tshark` | `sudo apt install wireshark tshark` | the `.pcap` challenges |
| `john` | `sudo apt install john` | cracking MD5 and `/etc/shadow` hashes |
| `hashcat` | `sudo apt install hashcat` | GPU cracking, `-m 0` (MD5), `-m 500` (crypt) |
| `hashid` | `sudo apt install hashid` | identify a hash algorithm |
| `binwalk` | `sudo apt install binwalk` | find appended data in images |
| `exiftool` | `sudo apt install libimage-exiftool-perl` | image metadata (`tEXt`, GPS, camera info) |
| `steghide` | `sudo apt install steghide` | steganography (password protected) |
| `strings` | part of binutils | printable strings inside binaries and images |
| CyberChef | download the **offline** release once | encoding, decoding, entropy, XOR |
| OpenVAS / GVM | `sudo apt install gvm` (heavy!) or keep the **report** documentation offline | vulnerability scanning and CVSS |
| Wordlists | `sudo apt install wordlists`, then `sudo gunzip /usr/share/wordlists/rockyou.txt.gz` | john / hashcat |
| `file`, `xxd`, `binwalk`, `hexdump` | already installed | file type and hex analysis |
| `ip`, `nmcli`, `ping`, `tcpdump` | already installed | network setup and captures |

Extra helpers worth having offline: `python3` with `scapy`, `pytest` style one-liners,
`flock`, `screen`/`tmux`, and a second wordlist such as `SecLists`.

---

## 9. Publish it

### GitHub

```bash
git init
git add .
git commit -m "IT Skills Olympics 2026 - cybersecurity CTF simulator"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

Optional: publish with GitHub Pages (**Settings → Pages → Source: `main` / `root`**).
The site is completely static, so there is no build step and no GitHub Action required.

### Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create application → Pages → Connect to Git**.
2. Select the repository and the branch `main`.
3. Build settings:
   * **Framework preset:** `None`
   * **Build command:** *leave it empty*
   * **Build output directory:** `/`
   * **Root directory:** `/` (or the folder of the project inside the repository)
4. **Save and Deploy**.

Cloudflare serves the files as they are. `index.html` becomes the root document and the
other pages are reachable at `/challenges.html`, `/scoreboard.html`, `/writeups.html`
and `/tools/hash.html`.

For a local preview: `python3 -m http.server 8000`.

### Publishing the leaderboard

Edit `data/scoreboard.json` (and `data/scoreboard.js` — the copy that works when the site
is opened from `file://`, where the browser blocks `fetch()`):

```json
{
  "name": "Byte Bandits",
  "school": "Northgate Technical College",
  "score": 720,
  "solved": 11,
  "lastSolve": "2026-10-20T09:47:00Z"
}
```

Your own team is merged into that list and ranked with the same rules: highest score
first, ties broken by the earlier `lastSolve` timestamp. When the competition is over the
top three are labelled *Champion*, *1st Runner-up* and *2nd Runner-up*.

---

## 10. Security note — please read

**A client-side CTF can be cheated.** The flags of this platform live in the browser: the
hashes are shipped in `js/challenges.js`, and anyone with developer tools can read the
JavaScript, brute force the hashes offline or simply look at the artefacts in `/files`.
A determined participant can therefore find every flag without solving a single
challenge.

That is fine for **practice, training and classroom use** — it is exactly what this
repository is for: rehearsing the workflow, the tools and the scoring before the real
event, with a realistic clock and realistic pressure. Do **not** use it for a graded or
high-stakes competition where you need an authoritative score.

### Upgrade path for an authoritative scoreboard

If you need tamper resistant scoring, move the flag check to the server:

1. **Cloudflare Pages Functions** — add `functions/api/submit.js`. The function receives
   the submitted flag, hashes it with the salt and compares it with the hash kept in
   your challenge store, then answers `{ ok: true }` or `{ ok: false }`. The browser
   never receives a hash list.
2. **Cloudflare KV** — store the challenge definitions (id, points, flag hash) and the
   shared leaderboard (team, score, last solve timestamp) in a KV namespace. The
   Pages Function reads and writes it, so every team sees the same leaderboard.
3. **Turnstile / rate limiting** — protect the submit endpoint so the 3 attempt limit
   is enforced server side and cannot be reset by clearing the browser storage.
4. **Sessions** — issue a short lived token per team at registration and use it as the
   KV key so teams cannot overwrite each other's scores.

The static site stays exactly as it is; only the submit call moves to the function, so
the offline version (this repository) and the online version can coexist.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Hashing failed" | No SHA-256 available: check that `js/sha256.js` is loaded before `js/app.js` |
| The board stays locked | The competition was never started — register the team and press "Start Competition" |
| The clock is wrong | The end timestamp is absolute; change `durationMinutes` in `js/config.js` and reload (the old value stays for a running competition) |
| A challenge is locked | 3 wrong attempts. The lock is stored in `localStorage`; use "Reset everything" (practice mode) or clear the site data |
| The rival teams do not appear | `data/scoreboard.json` could not be fetched (file://) — the site falls back to `data/scoreboard.js`; check the browser console |
| Scores vanished | They lived in `localStorage` only. Export the progress JSON regularly |
| A flag is rejected although it looks right | Check case, trailing spaces and the `CTF{}` wrapper; trivia answers are compared lower case |

---

## 12. Accessibility & browser support

Semantic HTML (`header`, `nav`, `main`, `section`, `article`, `table`), labelled form
controls, visible focus outlines, a keyboard operable board (cards are focusable and
open with <kbd>Enter</kbd>/<kbd>Space</kbd>), a focus trapped in the dialog with
<kbd>Esc</kbd> to close it, `aria-live` feedback for every submission, high contrast
text on a dark background and `prefers-reduced-motion` support. Works in current
Chrome, Edge, Firefox and Safari, on desktop and mobile.
