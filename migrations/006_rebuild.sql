-- Migration 006: Rebuild database schema (drops existing tables)
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS challenges;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS audit_logs;
-- Re-run initial schema
-- Include migrations 001-005 content here or reference them