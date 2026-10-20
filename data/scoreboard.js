/*
 * data/scoreboard.js - JavaScript copy of data/scoreboard.json.
 *
 * The scoreboard page tries to fetch data/scoreboard.json first. Browsers block
 * fetch() for files opened straight from disk (file://), so this copy is loaded
 * with a normal <script> tag and used as the fallback. Keep both files in sync.
 */
window.CTF_RIVAL_TEAMS = [
  {
    name: "Null Pointers",
    school: "Northgate Technical College",
    score: 720,
    solved: 11,
    lastSolve: "2026-10-20T09:47:00Z"
  },
  {
    name: "Segfault Squad",
    school: "Riverside College of Technology",
    score: 640,
    solved: 10,
    lastSolve: "2026-10-20T10:05:00Z"
  },
  {
    name: "Packet Sniffers",
    school: "Eastfield Academy",
    score: 585,
    solved: 9,
    lastSolve: "2026-10-20T10:12:00Z"
  },
  {
    name: "Rootkits & Co",
    school: "St Martins Polytechnic",
    score: 520,
    solved: 8,
    lastSolve: "2026-10-20T10:18:00Z"
  },
  {
    name: "Hexadecimal Heroes",
    school: "Westbrook Institute",
    score: 470,
    solved: 8,
    lastSolve: "2026-10-20T10:21:00Z"
  },
  {
    name: "Kernel Panthers",
    school: "Northgate Technical College",
    score: 405,
    solved: 7,
    lastSolve: "2026-10-20T10:24:00Z"
  },
  {
    name: "Shellshockers",
    school: "Central City College",
    score: 330,
    solved: 6,
    lastSolve: "2026-10-20T10:26:00Z"
  },
  {
    name: "Zero Day Zombies",
    school: "Eastfield Academy",
    score: 250,
    solved: 5,
    lastSolve: "2026-10-20T10:28:00Z"
  }
];
