-- Adds a free-text 'description' column to inquiries so customers can
-- describe their issue in their own words at request time, independent
-- of the dropdown 'service_item' classification.
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER service_item;
