-- Standardized Issue/Service Types with fixed costs
CREATE TABLE IF NOT EXISTS service_pricing (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cost DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link inquiries to specific services performed
CREATE TABLE IF NOT EXISTS inquiry_services (
  inquiry_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  PRIMARY KEY (inquiry_id, service_id),
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES service_pricing(id) ON DELETE CASCADE
);

-- Add extra cost fields to inquiries
ALTER TABLE inquiries 
ADD COLUMN IF NOT EXISTS extra_cost DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_cost_reason TEXT;
