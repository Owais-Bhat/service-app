-- Hostinger MySQL Schema Migration

CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY,
    full_name TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'client',
    salary DECIMAL(10, 2) DEFAULT 0,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    clock_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    clock_out TIMESTAMP NULL,
    date DATE DEFAULT (CURRENT_DATE),
    status VARCHAR(20) DEFAULT 'present',
    location TEXT,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inquiries (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    location TEXT,
    bill_no VARCHAR(50),
    service_item TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    ticket_no VARCHAR(50) UNIQUE,
    bill_amount DECIMAL(10, 2),
    payment_link TEXT,
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    feedback_rating INT CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,
    feedback_at TIMESTAMP NULL,
    preferred_time TEXT,
    assignment_status VARCHAR(20) DEFAULT 'pending',
    decline_reason TEXT,
    assigned_employee_id VARCHAR(36),
    ticket_id VARCHAR(36), -- Link to a ticket if converted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_employee_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stocks (
    id VARCHAR(36) PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    quantity INT DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'pcs',
    min_stock INT DEFAULT 5,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
    id VARCHAR(36) PRIMARY KEY,
    ticket_id VARCHAR(36),
    inquiry_id VARCHAR(36),
    rating INT CHECK (rating >= 1 AND rating <= 5),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eod_reports (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    content TEXT NOT NULL,
    date DATE DEFAULT (CURRENT_DATE),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Note: In MySQL, we need a separate table for Auth if not using an external provider.
-- For this migration, we will create an 'auth_users' table to store credentials.
CREATE TABLE IF NOT EXISTS auth_users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
