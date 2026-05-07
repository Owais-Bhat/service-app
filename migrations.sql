-- 1. Update existing tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- Disable RLS for all tables to allow the app to work without complex policies
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;
ALTER TABLE eod_reports DISABLE ROW LEVEL SECURITY;

-- 2. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMPTZ DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'present', -- present, late, absent
  location TEXT -- Added for geolocation
);

-- 3. Inquiries Table (For leads/non-clients)
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT,
  bill_no TEXT, -- Optional, for existing clients
  service_item TEXT,
  status TEXT DEFAULT 'pending', -- pending, assigned, resolved
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Stocks / Inventory
CREATE TABLE IF NOT EXISTS stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  min_stock INTEGER DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  inquiry_id UUID REFERENCES inquiries(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. EOD Reports
CREATE TABLE IF NOT EXISTS eod_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add assigned_to to tickets for task assignment
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
  
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

ALTER TABLE inquiries DISABLE ROW LEVEL SECURITY;

-- ── 2026-05-06 — Service request tracking, billing, feedback ──
-- Human-readable ticket number (e.g. NE-260506-4821), unique per row.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS ticket_no TEXT UNIQUE;

-- Billing fields populated by admin when service is closed.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS bill_amount NUMERIC;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS payment_link TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'; -- unpaid | paid

-- Feedback captured from the public tracker once status='closed'.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS feedback_comment TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inquiries_ticket_no ON inquiries(ticket_no);

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS preferred_time TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT 'pending'; -- pending, accepted, declined
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS decline_reason TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES profiles(id);

-- Status values used: 'open' | 'in_progress' | 'resolved' | 'closed' | 'assigned' | 'pending'