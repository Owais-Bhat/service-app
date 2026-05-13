-- Run this in Hostinger phpMyAdmin if the app shows errors such as:
-- Unknown column 'payment_method' in 'SET'
-- Unknown column 'phone' in 'where clause'

ALTER TABLE profiles ADD COLUMN phone VARCHAR(20);
ALTER TABLE profiles ADD COLUMN company VARCHAR(100);
ALTER TABLE profiles ADD COLUMN salary DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN address TEXT;

ALTER TABLE inquiries ADD COLUMN bill_amount DECIMAL(10, 2);
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
