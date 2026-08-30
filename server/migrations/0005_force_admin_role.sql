-- Migration 0005: Force admin role for wolfadmin regardless of current flags.
-- Previous migrations only fixed users WHERE is_admin=true OR role='admin',
-- but wolfadmin may have is_admin=false, is_assistant=true, role='assistant'.

UPDATE users
   SET is_admin = true,
       is_assistant = false,
       role = 'admin'
 WHERE LOWER(username) = 'wolfadmin';

-- Also fix any user that was supposed to be admin but got stuck as assistant
UPDATE users
   SET is_admin = true,
       is_assistant = false,
       role = 'admin'
 WHERE role = 'assistant' AND username IN ('wolfadmin', 'admin');

-- Invalidate all sessions so the user gets a fresh token with correct flags
DELETE FROM wolf_sessions
 WHERE user_id IN (SELECT id FROM users WHERE LOWER(username) IN ('wolfadmin', 'admin'));

-- Disable ALL forex symbols — crypto exchanges don't support forex pairs
UPDATE markets SET enabled = false
 WHERE market = 'forex';
