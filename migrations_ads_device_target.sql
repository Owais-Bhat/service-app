-- Migration: Add device_target column to ads table for device-specific ad display

-- Create the ads table if it doesn't exist
CREATE TABLE IF NOT EXISTS ads (
    id INT PRIMARY KEY AUTO_INCREMENT,
    url VARCHAR(500) NOT NULL,
    kind ENUM('image', 'video') DEFAULT 'image',
    caption TEXT,
    placement VARCHAR(50) DEFAULT 'landing',
    device_target ENUM('desktop', 'mobile', 'both') DEFAULT 'both',
    active TINYINT DEFAULT 1,
    position INT DEFAULT 0,
    duration_ms INT DEFAULT 6000,
    starts_at DATETIME,
    expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- If the table already exists, add the device_target column if it's missing
ALTER TABLE ads ADD COLUMN IF NOT EXISTS device_target ENUM('desktop', 'mobile', 'both') DEFAULT 'both';

-- Index for faster queries
ALTER TABLE ads ADD INDEX IF NOT EXISTS idx_placement (placement);
ALTER TABLE ads ADD INDEX IF NOT EXISTS idx_device_target (device_target);
ALTER TABLE ads ADD INDEX IF NOT EXISTS idx_active (active);
