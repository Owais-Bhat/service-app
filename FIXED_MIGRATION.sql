-- ============================================================================
-- FIXED DATABASE MIGRATION - Without Foreign Key Issues
-- Copy and paste THIS entire script into Hostinger phpMyAdmin SQL tab
-- ============================================================================

-- Step 1: Add columns to inquiries table
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS device_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50) DEFAULT 'none';

-- Step 2: Create device_taken_logs table (NO foreign keys - just plain table)
CREATE TABLE IF NOT EXISTS device_taken_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36),
  employee_id VARCHAR(36),
  device_image_url LONGTEXT,
  device_description LONGTEXT,
  taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inquiry (inquiry_id),
  KEY idx_employee (employee_id),
  KEY idx_taken_at (taken_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Create device_return_logs table (NO foreign keys)
CREATE TABLE IF NOT EXISTS device_return_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36),
  device_condition VARCHAR(50) DEFAULT 'good',
  return_image_url LONGTEXT,
  return_notes LONGTEXT,
  returned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inquiry (inquiry_id),
  KEY idx_returned_at (returned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 4: Create device_follow_up_logs table (NO foreign keys)
CREATE TABLE IF NOT EXISTS device_follow_up_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36),
  status VARCHAR(50),
  notes LONGTEXT,
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inquiry (inquiry_id),
  KEY idx_status (status),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 5: Add indexes to inquiries table
ALTER TABLE inquiries ADD INDEX IF NOT EXISTS idx_device_status (device_status);
ALTER TABLE inquiries ADD INDEX IF NOT EXISTS idx_follow_up_status (follow_up_status);

-- ============================================================================
-- ✅ MIGRATION COMPLETE
-- Now go back to your app and refresh the page
-- Device Tracking should load with an empty table
-- ============================================================================
