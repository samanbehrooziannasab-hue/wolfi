-- Migration 0003: Ensure admin users are not flagged as assistants
-- + force-clear all admin sessions so old tokens with is_assistant=true expire
UPDATE users SET is_assistant = false WHERE (is_admin = true OR role = 'admin') AND is_assistant = true;
DELETE FROM wolf_sessions WHERE user_id IN (SELECT id FROM users WHERE is_admin = true OR role = 'admin');