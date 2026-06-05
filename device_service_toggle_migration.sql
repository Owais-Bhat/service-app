-- Device Service Tracking — per-ticket toggle migration
-- Adds a flag on inquiries marking that a device was sent to the service center.
-- The admin master on/off lives in app_settings (key 'device_tracking_enabled'); no schema change needed for it.
-- "Case Closed" is a plain status string ('case_closed') in inquiries.status; no schema change needed for it.

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS device_service_enabled TINYINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inquiries_device_service_enabled ON inquiries(device_service_enabled);
