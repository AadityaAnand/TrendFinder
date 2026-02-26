-- Enable Supabase Realtime on raw_signals so the LiveSignalCounter
-- component can receive live INSERT events in the browser.
--
-- Run this once in the Supabase SQL editor or via supabase db push.
ALTER PUBLICATION supabase_realtime ADD TABLE raw_signals;
