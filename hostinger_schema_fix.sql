-- Run this in Hostinger phpMyAdmin if the app shows errors such as:
-- Unknown column 'payment_method' in 'SET'
-- Unknown column 'phone' in 'where clause'

ALTER TABLE profiles ADD COLUMN phone VARCHAR(20);
ALTER TABLE profiles ADD COLUMN company VARCHAR(100);
ALTER TABLE profiles ADD COLUMN salary DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN address TEXT;

ALTER TABLE inquiries ADD COLUMN bill_amount DECIMAL(10, 2);
ALTER TABLE inquiries ADD COLUMN company_name VARCHAR(150);
ALTER TABLE inquiries ADD COLUMN payment_link TEXT;
ALTER TABLE inquiries ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid';
ALTER TABLE inquiries ADD COLUMN payment_method VARCHAR(20) DEFAULT NULL;
ALTER TABLE inquiries ADD COLUMN ticket_no VARCHAR(50) UNIQUE;
ALTER TABLE inquiries ADD COLUMN preferred_time TEXT;
ALTER TABLE inquiries ADD COLUMN assignment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE inquiries ADD COLUMN decline_reason TEXT;
ALTER TABLE inquiries ADD COLUMN assigned_employee_id VARCHAR(36);
ALTER TABLE inquiries ADD COLUMN ticket_id VARCHAR(36);
ALTER TABLE inquiries ADD COLUMN feedback_rating INT;
ALTER TABLE inquiries ADD COLUMN feedback_comment TEXT;
ALTER TABLE inquiries ADD COLUMN feedback_at TIMESTAMP NULL;
ALTER TABLE inquiries ADD COLUMN extra_cost DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE inquiries ADD COLUMN extra_cost_reason TEXT;
ALTER TABLE inquiries ADD COLUMN payment_received_at TIMESTAMP NULL;
ALTER TABLE inquiries ADD COLUMN employee_rating INT;
ALTER TABLE inquiries ADD COLUMN feedback_employee_id VARCHAR(36);

CREATE TABLE IF NOT EXISTS leave_requests (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eod_reports (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  date DATE DEFAULT (CURRENT_DATE),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_pricing (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(120),
  cost DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inquiry_services (
  inquiry_id VARCHAR(36) NOT NULL,
  service_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (inquiry_id, service_id)
);

ALTER TABLE service_pricing ADD COLUMN category VARCHAR(120);
