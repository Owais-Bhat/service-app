-- Device Tracking System Migration
-- Add these columns to inquiries table
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS device_status VARCHAR(50) DEFAULT 'pending'; -- 'taken', 'returned', 'in_service'
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(50) DEFAULT 'none'; -- 'none', 'awaiting_parts', 'repair_progress', 'ready_return', 'returned'

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
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create device_return_logs table
CREATE TABLE IF NOT EXISTS device_return_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  device_condition VARCHAR(50) DEFAULT 'good', -- 'good', 'damaged', 'lost', 'repaired'
  return_image_url TEXT,
  return_notes TEXT,
  returned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);

-- Create device_follow_up_logs table
CREATE TABLE IF NOT EXISTS device_follow_up_logs (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  status VARCHAR(50), -- 'awaiting_parts', 'repair_progress', 'ready_return', etc
  notes TEXT,
  updated_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_device_taken_inquiry ON device_taken_logs(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_device_taken_employee ON device_taken_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_device_return_inquiry ON device_return_logs(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_device_followup_inquiry ON device_follow_up_logs(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_device_status ON inquiries(device_status);
CREATE INDEX IF NOT EXISTS idx_inquiries_followup_status ON inquiries(follow_up_status);
