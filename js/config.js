/*
 * config.js - every setting of the competition simulator.
 * This is the second file (besides js/challenges.js) you normally edit.
 */
window.CTF_CONFIG = {
  /* ---------------- event ---------------- */
  eventName: "IT Skills Olympics 2026",
  categoryName: "Cybersecurity Category",
  subtitle: "Offline practice simulation",
  salt: "",

  /* ---------------- competition ---------------- */
  durationMinutes: 90,          // 1 hour 30 minutes
  practiceMode: false,          // true  -> restart/reset always available, writeups open
                               // false -> exam simulation: writeups unlock after the end
  showTiebreaker: false,        // true  -> reveal the hidden tiebreaker challenge
  tiebreakerId: "tb-vuln-vs-threat",
  tiebreakerCountsForTotal: false,

  /* ---------------- scoring ---------------- */
  maxAttempts: 3,               // wrong submissions before a challenge is locked
  minAward: 0,                  // awarded = max(minAward, points - hint costs)
  points: {
    easy: 50,
    average: 100,
    difficult: 150,
    trivia: 30
  },
  hintCost: {                   // cost of EVERY single hint, per difficulty
    easy: 20,
    average: 60,
    difficult: 100,
    trivia: 0
  },

  /* ---------------- storage / data ---------------- */
  storageKey: "itso26.cybersecurity.state.v1",
  storageVersion: 1,
  rivalScoreboardUrl: "data/scoreboard.json",
  rivalScoreboardScript: "data/scoreboard.js",

  /* ---------------- presentation ---------------- */
  categories: [
    { name: "Essential Security Principles", short: "Essential" },
    { name: "Basic Network Setup and Security", short: "Network" },
    { name: "Endpoint Security Concepts", short: "Endpoint" },
    { name: "Vulnerability Assessment and Risk Management", short: "Vulnerability & Risk" },
    { name: "Trivia", short: "Trivia" }
  ],
  difficultyOrder: ["easy", "average", "difficult", "trivia"],
  difficultyLabels: {
    easy: "Easy",
    average: "Average",
    difficult: "Difficult",
    trivia: "Trivia"
  }
};
