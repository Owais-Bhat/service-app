# Networking Experts Service Portal – Documentation

## 1. Overview
The Networking Experts Service Portal is a professional, role-based support and management platform built for IT and security service providers. It allows clients to submit support tickets (CCTV, Networking, Hardware) and enables staff to manage those requests through a centralized command center.

## 2. Tech Stack
- **Design:** Modern Blue/Green Gradient Theme, Glassmorphism, Responsive.
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Build Tool:** Vite.
- **Backend/Database:** Supabase (PostgreSQL, Auth, Real-time).
- **Icons/Typography:** Google Fonts (Inter).

## 3. Core Features

### 🔐 Authentication
- Secure email/password login via Supabase Auth.
- Automatic profile creation upon first sign-in.
- Persistent sessions (stay logged in after refresh).

### 👥 Role-Based Access Control (RBAC)
The portal automatically adjusts its UI based on the user's role:

| Role | Access Level | Key Features |
| :--- | :--- | :--- |
| **Client** | Restricted | Create tickets, view own tickets, add comments, manage profile. |
| **Employee** | Staff | View all tickets, update ticket status, add staff notes, manage profile. |
| **Admin** | Full Control | All Employee features + User/Role management + Client list. |

### 🎫 Ticket & Task Management
- **Status Workflow:** `Open` → `In Progress` → `Resolved` → `Closed`.
- **Priorities:** `Low`, `Medium`, `High`, `Urgent`.
- **Inquiries:** Capture name, phone, and service needs from potential clients.
- **Feedback:** Star ratings and comments for completed service requests.

### 🕒 Operations & Stocks
- **Attendance:** Live employee clock-in/out tracking.
- **Inventory:** Day-to-day stock monitoring with low-stock alerts.
- **Reports:** One-click CSV/Excel export for attendance, clients, and inventory.

---

## 4. Database Setup (SQL)
To initialize the system, the following tables must be created in the Supabase SQL Editor:

```sql
-- Profiles: Extends Supabase Auth
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'client' CHECK (role IN ('admin', 'employee', 'client')),
  phone TEXT,
  company TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tickets: Core support requests
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments: Conversation history
CREATE TABLE ticket_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. File Structure
- `index.html`: Main entry point.
- `src/main.js`: Application logic and role-based routing.
- `src/supabase.js`: Supabase client configuration.
- `src/style.css`: Design system and UI components.
- `src/pages/`:
    - `client.js`: Client dashboard and ticket creation.
    - `admin.js`: Staff command center and user management.
    - `profile.js`: User account settings.
- `src/utils.js`: Helper functions (formatting, toasts).

## 6. How to Promote a User to Admin
By default, all new users are "Clients." To grant Admin access:
1. Open the **Supabase Dashboard**.
2. Go to the **Table Editor** -> `profiles` table.
3. Locate the user and double-click the `role` cell.
4. Change it to `admin` and save.
5. The user will see the Admin tools immediately upon their next page refresh.

## 7. Security Best Practices
- **RLS (Row Level Security):** Policies are configured so clients can only see their own tickets, while staff can see all tickets.
- **Environment Variables:** In production, move the Supabase URL and Key to a `.env` file.
