-- Migration 007: Seed challenge_flags from stored flags + switch team_members/team_solutions to UUID TEXT IDs
-- Hashes generated with DEFAULT_CTF_SALT = "itso26-cybersecurity-ctf-v1"
-- Using the same normalizeAnswer function from _lib.js:
--   caseSensitive: s.toLowerCase().replace(/[^a-z0-9]/g, '')  strips ALL non-alphanumeric
--   caseSensitive: false: also strips CTF{} wrapper and non-alphanumeric

-- ============================================================
-- 1. Seed challenge_flags
-- ============================================================

-- esp-base64-rot13: CTF{base64_then_rot13}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('esp-base64-rot13', 'b1dda57a6d70814e14f8336977abd8ab46d46ec82b2fe84098ebfbb8f2433db3', 1, 50, 'easy', 0);

-- esp-hash-md5: CTF{Swordfish}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('esp-hash-md5', '7506249c19791de17515d0f05b134031f64afeea97922135a889d2ac809862d3', 1, 50, 'easy', 0);

-- esp-shadow-john: CTF{Sunflower!2026}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('esp-shadow-john', '9b2d7ec3dcabd7f4526bd814cc07e8c793635074ad9a50cccd60180b51e8c248', 1, 100, 'average', 0);

-- esp-xor-key: CTF{xor_is_not_encryption}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('esp-xor-key', '83acc919ae0d55fc2acc2be550e08144a1080bbd1c2a97cd1b937f4c108de73d', 1, 100, 'average', 0);

-- net-subnetting: CTF{192.168.10.64-192.168.10.127}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('net-subnetting', '994092e8ac7242e434c707522ee44682dce108543483c06a9a91f329c1e792e0', 1, 50, 'easy', 0);

-- net-nmap-output: CTF{ms-wbt-server}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('net-nmap-output', '52ffeb01e5a5404cd55c2c932ce953c3a8e993f930bbcc0f7164068a3a9e7fce', 1, 50, 'easy', 0);

-- net-pcap-ftp: CTF{ftp_plaintext_credentials}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('net-pcap-ftp', 'bc1f89cb5aeac06867714e60b41ca6eafdfa3ed643d0968ed23744839ce1d488', 1, 100, 'average', 0);

-- net-iptables: CTF{3306_mysql}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('net-iptables', '8c147bc8ec4586b1b925739f993c96130ecdc307368ec19a6ad74e930c5cdd77', 1, 100, 'average', 0);

-- net-pcap-dns: CTF{dns_exfil_over_dns}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('net-pcap-dns', '3ba98b6b0771ba2253ac7ce8ed5a668d23b41905b694127bb19e95271304e9b1', 1, 150, 'difficult', 0);

-- end-authlog: CTF{192.168.56.42_svc_backup}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('end-authlog', '6ed3453a688db2612fb4e021eb2c32f9f332cb40c272aae2583719b73eb8a6f8', 1, 50, 'easy', 0);

-- end-persistence: CTF{cron_persistence_beacon}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('end-persistence', '6975aea60d8d4b06989b132aee47a6eed7046326022580a0ef4d8dd77f5e777a', 1, 100, 'average', 0);

-- end-obfuscated-script: CTF{deobfuscate_me_1337}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('end-obfuscated-script', 'e73f8315d3820ac7158224f555c823cb81139b8980c989314dd97406f88ce2f3', 1, 150, 'difficult', 0);

-- end-image-hidden: CTF{image_metadata_leak}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('end-image-hidden', '227e8d1694b244ed29e38a88d4d6c58a15e178c55fe5aa678d287150586aa0e6', 1, 150, 'difficult', 0);

-- vam-risk-matrix: CTF{10.10.5.21_CVE-2021-44228}
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('vam-risk-matrix', '52667b2c9627ac9c044cf19cadc5f5452b8564e2d6915930d23261d42c985ac1', 1, 150, 'difficult', 0);

-- trivia-cia: CIA triad
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('trivia-cia', 'c9a69ea88dccf2e9c0267ecc0125ed4a3d99d7b34f0ff40d3668ea23a4634817', 0, 30, 'trivia', 0);

-- trivia-ssh-port: default SSH port
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('trivia-ssh-port', 'e13f9549dd1e791ea2f693ebb342290e05ae3e15f610243b06e627090f4a554a', 0, 30, 'trivia', 0);

-- trivia-https-port: default HTTPS port
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('trivia-https-port', '111ac0924a267de9d65e022ede538abc94d2dc33806e49533de00e77ff90fd07', 0, 30, 'trivia', 0);

-- trivia-nmap-sv: -sV flag
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('trivia-nmap-sv', 'fa789e31d97dc971d5dcd8f86a2c421598768459eb1013f4de7846e24ee3942e', 0, 30, 'trivia', 0);

-- trivia-cvss: CVSS
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('trivia-cvss', '19ec47887b1c886a9f3f78f1902a426d15948270a5654f72f3fd860dc2aa5e91', 0, 30, 'trivia', 0);

-- tb-vuln-vs-threat: vulnerability
INSERT OR IGNORE INTO challenge_flags (challenge_id, flag_hash, case_sensitive, points, difficulty, is_tiebreaker)
VALUES ('tb-vuln-vs-threat', 'c6b3b84081dfaebcc14bf2017e81cf104b42b12e42526373df3c46de39a11fe1', 0, 100, 'trivia', 0);

-- ============================================================
-- 2. Migrate team_members.id from INTEGER autoincrement to TEXT UUID
-- ============================================================

-- Create new table with TEXT id, copy data, drop old, rename
CREATE TABLE IF NOT EXISTS team_members_new (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL CHECK (slot_index IN (0,1,2)),
    name TEXT NOT NULL,
    is_ready INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    user_id TEXT,
    is_captain INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'member'
);

-- Copy existing data, converting INTEGER id to UUID string
INSERT INTO team_members_new (id, team_id, slot_index, name, is_ready, joined_at, user_id, is_captain, role)
SELECT CAST(id AS TEXT), team_id, slot_index, name, is_ready, joined_at, user_id, is_captain, role
FROM team_members;

-- Drop old table and rename
DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

-- Recreate unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_slot ON team_members(team_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);

-- ============================================================
-- 3. Migrate team_solutions.id from INTEGER to UUID TEXT
-- ============================================================

CREATE TABLE IF NOT EXISTS team_solutions_new (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    solved_at INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    hints_used TEXT NOT NULL DEFAULT '[]',
    attempts_used INTEGER NOT NULL DEFAULT 0
);

-- Copy existing data
INSERT INTO team_solutions_new (id, team_id, challenge_id, solved_at, points, hints_used, attempts_used)
SELECT CAST(id AS TEXT), team_id, challenge_id, solved_at, points, hints_used, attempts_used
FROM team_solutions;

-- Drop old table and rename
DROP TABLE team_solutions;
ALTER TABLE team_solutions_new RENAME TO team_solutions;

-- Recreate unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_solutions_team_challenge ON team_solutions(team_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_team_solutions_team_id ON team_solutions(team_id);

-- ============================================================
-- 4. Add recruitment column default if missing
-- ============================================================

ALTER TABLE teams ADD COLUMN recruitment INTEGER NOT NULL DEFAULT 1;