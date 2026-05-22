# Graph Report - .  (2026-05-22)

## Corpus Check
- 63 files · ~63,400 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 403 nodes · 679 edges · 28 communities (26 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.89)
- Token cost: 71,128 input · 7,700 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AdminEmployee Shared Utilities|Admin/Employee Shared Utilities]]
- [[_COMMUNITY_App Shell & Supabase Client|App Shell & Supabase Client]]
- [[_COMMUNITY_Ticket Display & Profile UI|Ticket Display & Profile UI]]
- [[_COMMUNITY_Page Renderers & Routing|Page Renderers & Routing]]
- [[_COMMUNITY_Caveman-Compress CLI Engine|Caveman-Compress CLI Engine]]
- [[_COMMUNITY_Landing Page & Public Forms|Landing Page & Public Forms]]
- [[_COMMUNITY_Frontend Package & Dependencies|Frontend Package & Dependencies]]
- [[_COMMUNITY_Caveman-Compress Validation|Caveman-Compress Validation]]
- [[_COMMUNITY_Admin CSVXLSX Import & Payments|Admin CSV/XLSX Import & Payments]]
- [[_COMMUNITY_Backend Server Dependencies|Backend Server Dependencies]]
- [[_COMMUNITY_Service Portal Architecture Doc|Service Portal Architecture Doc]]
- [[_COMMUNITY_Admin Dashboard & AttendanceSalary|Admin Dashboard & Attendance/Salary]]
- [[_COMMUNITY_PWA Icons & Branding|PWA Icons & Branding]]
- [[_COMMUNITY_Scratch Employee Bill Repair|Scratch: Employee Bill Repair]]
- [[_COMMUNITY_Caveman-Compress Documentation|Caveman-Compress Documentation]]
- [[_COMMUNITY_Attendance Date Helpers|Attendance Date Helpers]]
- [[_COMMUNITY_Admin Ads & Complaints Modals|Admin Ads & Complaints Modals]]
- [[_COMMUNITY_UI Icon Sprite Symbols|UI Icon Sprite Symbols]]
- [[_COMMUNITY_Caveman-Compress Benchmark|Caveman-Compress Benchmark]]
- [[_COMMUNITY_Fast2SMS OTP Tests|Fast2SMS OTP Tests]]
- [[_COMMUNITY_Project Entry & File Structure|Project Entry & File Structure]]
- [[_COMMUNITY_PDF Rendering Tests|PDF Rendering Tests]]
- [[_COMMUNITY_Caveman-Compress Package Init|Caveman-Compress Package Init]]
- [[_COMMUNITY_Tailored Resume Generator Skill|Tailored Resume Generator Skill]]
- [[_COMMUNITY_Claude Permissions Config|Claude Permissions Config]]

## God Nodes (most connected - your core abstractions)
1. `QueryBuilder` - 14 edges
2. `toast()` - 13 edges
3. `App Logo / Brand Mark` - 11 edges
4. `validate()` - 10 edges
5. `openInquiryDetail()` - 10 edges
6. `detect_file_type()` - 7 edges
7. `ICONS` - 7 edges
8. `navigate()` - 7 edges
9. `supabase` - 7 edges
10. `getUserRole()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Unauthorized Response Marker` --conceptually_related_to--> `Role-Based Access Control`  [AMBIGUOUS]
  response.txt → DOCUMENTATION.md
- `caveman-compress README (.claude)` --semantically_similar_to--> `caveman-compress README (.agents)`  [INFERRED] [semantically similar]
  .claude/skills/caveman-compress/README.md → .agents/skills/caveman-compress/README.md
- `caveman-compress Security Doc (.claude)` --semantically_similar_to--> `caveman-compress Security Doc (.agents)`  [INFERRED] [semantically similar]
  .claude/skills/caveman-compress/SECURITY.md → .agents/skills/caveman-compress/SECURITY.md
- `caveman-compress Skill (.claude)` --semantically_similar_to--> `caveman-compress Skill (.agents)`  [INFERRED] [semantically similar]
  .claude/skills/caveman-compress/SKILL.md → .agents/skills/caveman-compress/SKILL.md
- `Tailored Resume Generator Skill (.claude)` --semantically_similar_to--> `Tailored Resume Generator Skill (.agents)`  [INFERRED] [semantically similar]
  .claude/skills/tailored-resume-generator/SKILL.md → .agents/skills/tailored-resume-generator/SKILL.md

## Hyperedges (group relationships)
- **RBAC Three-Role System** — documentation_role_client, documentation_role_employee, documentation_role_admin, documentation_rbac [EXTRACTED 1.00]
- **Supabase Core Schema Tables** — documentation_table_profiles, documentation_table_tickets, documentation_table_ticket_comments, documentation_supabase [EXTRACTED 1.00]
- **Caveman Compress Pipeline** — agents_caveman_skill, agents_caveman_compression_rules, agents_caveman_token_savings [EXTRACTED 1.00]

## Communities (28 total, 2 thin omitted)

### Community 0 - "Admin/Employee Shared Utilities"
Cohesion: 0.06
Nodes (33): showBillShareModal(), attendanceDateKey(), blobToBase64(), BUSINESS, dateKey(), daysBetweenInclusive(), displayStatus(), escapeAttr() (+25 more)

### Community 1 - "App Shell & Supabase Client"
Cohesion: 0.08
Nodes (14): ICONS, buildNav(), renderLayout(), renderPage(), getHeaders(), getUserRole(), QueryBuilder, realtime (+6 more)

### Community 2 - "Ticket Display & Profile UI"
Cohesion: 0.11
Nodes (22): displayStatus(), loadMiniStats(), openTicketDetail(), renderClientDashboard(), statusText(), openEmployeeRequestModal(), renderEmployeeDashboard(), renderProfile() (+14 more)

### Community 3 - "Page Renderers & Routing"
Cohesion: 0.10
Nodes (27): renderAllTickets(), renderBillsTab(), renderCashCollectionsTab(), renderClients(), renderContacts(), renderDeviceTypesTab(), renderEODReports(), renderInquiries() (+19 more)

### Community 4 - "Caveman-Compress CLI Engine"
Cohesion: 0.13
Nodes (20): main(), print_usage(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file(), is_sensitive_path(), Heuristic denylist for files that must never be shipped to a third-party API. (+12 more)

### Community 5 - "Landing Page & Public Forms"
Cohesion: 0.10
Nodes (16): escapeAttr(), escapeHTML(), FALLBACK_ISSUE_OPTIONS, getCachedAds(), loadIssueOptionsFromPricing(), makeCaptcha(), OTHER_OPTION, postPublicApi() (+8 more)

### Community 6 - "Frontend Package & Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, bcryptjs, cors, dotenv, express, jsonwebtoken, multer, mysql2 (+16 more)

### Community 7 - "Caveman-Compress Validation"
Cohesion: 0.27
Nodes (16): count_bullets(), extract_code_blocks(), extract_headings(), extract_inline_codes(), extract_paths(), extract_urls(), Line-based fenced code block extractor.      Handles ``` and ~~~ fences with var, read_file() (+8 more)

### Community 8 - "Admin CSV/XLSX Import & Payments"
Cohesion: 0.14
Nodes (10): buildPaidUpdates(), detectHeader(), importServiceRows(), inferLayout(), loadXLSX(), markInquiryPaid(), parseCSV(), parsePrice() (+2 more)

### Community 9 - "Backend Server Dependencies"
Cohesion: 0.10
Nodes (19): author, dependencies, bcryptjs, cors, dotenv, express, jsonwebtoken, mysql2 (+11 more)

### Community 10 - "Service Portal Architecture Doc"
Cohesion: 0.18
Nodes (15): Attendance Clock-in/out Tracking, Inventory Stock Monitoring, Role-Based Access Control, Row Level Security Policies, Admin Role, Client Role, Employee Role, Networking Experts Service Portal (+7 more)

### Community 11 - "Admin Dashboard & Attendance/Salary"
Cohesion: 0.15
Nodes (14): displayStatus(), groupedForgottenClockouts(), mapLink(), money(), openAdminRequestModal(), openInquiryDetail(), openInquiryDetailWithLoader(), renderAdminDashboard() (+6 more)

### Community 12 - "PWA Icons & Branding"
Cohesion: 0.17
Nodes (12): Apple Touch Icon (assets), Favicon 96x96 PNG, Favicon SVG (assets), JavaScript Logo SVG, Logo PNG, Web App Manifest Icon 192x192, Web App Manifest Icon 512x512, App Logo / Brand Mark (+4 more)

### Community 13 - "Scratch: Employee Bill Repair"
Cohesion: 0.23
Nodes (9): blobToBase64(), BUSINESS, displayStatus(), loadHtml2Pdf(), openPremiumBillModal(), renderBillToPdfBlob(), renderPremiumBillHTML(), statusText() (+1 more)

### Community 14 - "Caveman-Compress Documentation"
Cohesion: 0.22
Nodes (11): Caveman Compression Rules, caveman-compress README (.agents), caveman-compress Security Doc (.agents), caveman-compress Skill (.agents), Snyk High Risk False Positive, Token Savings Per Session, Caveman Toolkit, Anthropic Python SDK / Claude CLI Fallback (+3 more)

### Community 15 - "Attendance Date Helpers"
Cohesion: 0.33
Nodes (7): attendanceDateKey(), dateKey(), daysBetweenInclusive(), isForgottenClockOut(), isPastAutoClockOut(), isValidActiveAttendance(), matchesServiceReportFilters()

### Community 16 - "Admin Ads & Complaints Modals"
Cohesion: 0.29
Nodes (7): escapeHtml(), openAdEditor(), openComplaintResponder(), renderAdsTab(), renderComplaintsTab(), renderFeedbackTab(), formatDateTime()

### Community 17 - "UI Icon Sprite Symbols"
Cohesion: 0.29
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social/Community Icon, X (Twitter) Icon, UI Icon Sprite (icons.svg)

### Community 18 - "Caveman-Compress Benchmark"
Cohesion: 0.73
Nodes (4): benchmark_pair(), count_tokens(), main(), print_table()

### Community 19 - "Fast2SMS OTP Tests"
Cohesion: 0.33
Nodes (4): calls, {
  normalizeIndianMobile,
  sendFast2SmsOtp,
  verifyFast2SmsOtp,
  resendFast2SmsOtp,
  sendDltSms,
}, require, url

### Community 20 - "Project Entry & File Structure"
Cohesion: 0.60
Nodes (5): Project File Structure, Google Fonts (Inter, JetBrains Mono), index.html Entry Point, src/main.js (Application Logic), src/style.css (Design System)

### Community 21 - "PDF Rendering Tests"
Cohesion: 0.40
Nodes (4): employeeSource, functionEnd, functionStart, source

### Community 23 - "Tailored Resume Generator Skill"
Cohesion: 0.67
Nodes (3): ATS Optimization, Tailored Resume Generator Skill (.agents), Tailored Resume Generator Skill (.claude)

## Ambiguous Edges - Review These
- `Role-Based Access Control` → `Unauthorized Response Marker`  [AMBIGUOUS]
  response.txt · relation: conceptually_related_to
- `App Logo / Brand Mark` → `JavaScript Logo SVG`  [AMBIGUOUS]
  src/assets/javascript.svg · relation: conceptually_related_to

## Knowledge Gaps
- **75 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Role-Based Access Control` and `Unauthorized Response Marker`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `App Logo / Brand Mark` and `JavaScript Logo SVG`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `toast()` connect `Ticket Display & Profile UI` to `Admin/Employee Shared Utilities`, `App Shell & Supabase Client`, `Page Renderers & Routing`, `Landing Page & Public Forms`, `Admin CSV/XLSX Import & Payments`, `Admin Dashboard & Attendance/Salary`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `App Logo / Brand Mark` (e.g. with `Apple Touch Icon (public)` and `Favicon SVG (public)`) actually correct?**
  _`App Logo / Brand Mark` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin/Employee Shared Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.06294326241134751 - nodes in this community are weakly interconnected._
- **Should `App Shell & Supabase Client` be split into smaller, more focused modules?**
  _Cohesion score 0.08253968253968254 - nodes in this community are weakly interconnected._