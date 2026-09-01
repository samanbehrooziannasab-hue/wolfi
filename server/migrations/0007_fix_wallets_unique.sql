-- Migration 0007: Deduplicate wallets and add UNIQUE constraint on (user_id, asset, network)

BEGIN;

-- 1. Merge duplicate wallets by user_id, asset, network
WITH duplicates AS (
  SELECT user_id, asset, network,
         MIN(id::text) AS keep_id,
         SUM(COALESCE(balance, 0)) AS total_balance,
         SUM(COALESCE(frozen_balance, 0)) AS total_frozen
    FROM wallets
   GROUP BY user_id, asset, network
  HAVING COUNT(*) > 1
)
UPDATE wallets w
   SET balance = d.total_balance,
       frozen_balance = d.total_frozen,
       updated_at = NOW()
  FROM duplicates d
 WHERE w.id::text = d.keep_id;

-- 2. Delete the extra duplicate wallet rows
WITH duplicates AS (
  SELECT user_id, asset, network,
         MIN(id::text) AS keep_id
    FROM wallets
   GROUP BY user_id, asset, network
  HAVING COUNT(*) > 1
)
DELETE FROM wallets w
 USING duplicates d
 WHERE w.user_id = d.user_id
   AND w.asset = d.asset
   AND COALESCE(w.network, '') = COALESCE(d.network, '')
   AND w.id::text <> d.keep_id;

-- 3. Create UNIQUE index on (user_id, asset, network)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_unique_user_asset_network
    ON wallets (user_id, asset, COALESCE(network, 'mainnet'));

COMMIT;
