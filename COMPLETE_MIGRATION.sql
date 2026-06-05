-- ============================================================================
-- COMPLETE DATABASE MIGRATION FOR DEVICE TRACKING SYSTEM
-- Run this ENTIRE script in Hostinger phpMyAdmin SQL tab
-- Copy ALL text below and paste into SQL query box, then click "GO"
-- ============================================================================

-- Add device tracking columns to inquiries table
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS device_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50) DEFAULT 'none';

-- Create device_taken_logs table
CREATE TABLE IF NOT EXISTS device_taken_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  employee_id VARCHAR(36) NOT NULL,
  device_image_url TEXT,
  device_description TEXT,
  taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_inquiry (inquiry_id),
  INDEX idx_employee (employee_id),
  INDEX idx_taken_at (taken_at)
);

-- Create device_return_logs table
CREATE TABLE IF NOT EXISTS device_return_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  device_condition VARCHAR(50) DEFAULT 'good',
  return_image_url TEXT,
  return_notes TEXT,
  returned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  INDEX idx_inquiry (inquiry_id),
  INDEX idx_returned_at (returned_at)
);

-- Create device_follow_up_logs table
CREATE TABLE IF NOT EXISTS device_follow_up_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  status VARCHAR(50),
  notes TEXT,
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_inquiry (inquiry_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Add indexes to inquiries table for device tracking
ALTER TABLE inquiries ADD INDEX idx_device_status (device_status);
ALTER TABLE inquiries ADD INDEX idx_follow_up_status (follow_up_status);

-- ============================================================================
-- MIGRATION COMPLETE
-- You can now see the Device Tracking section in Admin Hub
-- ============================================================================
