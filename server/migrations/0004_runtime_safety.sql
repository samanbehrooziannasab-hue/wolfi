-- Runtime safety fixes. Idempotent and safe to run on existing installations.
UPDATE users
   SET role = 'admin', is_admin = true, is_assistant = false
 WHERE is_admin = true OR role = 'admin';

UPDATE markets
   SET enabled = false
 WHERE symbol IN ('XAUUSD', 'XAGUSD');

DELETE FROM wolf_sessions
 WHERE user_id IN (SELECT id FROM users WHERE is_admin = true OR role = 'admin');
