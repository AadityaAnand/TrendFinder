-- Add unique constraint to prevent same signal being marked as duplicate multiple times
-- Run this in Supabase SQL Editor

ALTER TABLE signal_duplicates
ADD CONSTRAINT signal_duplicates_duplicate_signal_id_unique
UNIQUE (duplicate_signal_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT signal_duplicates_duplicate_signal_id_unique ON signal_duplicates
IS 'Ensures each signal can only be a duplicate of one canonical signal';
