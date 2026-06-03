# Graph Report - .  (2026-06-03)

## Corpus Check
- 70 files · ~79,334 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 539 nodes · 941 edges · 57 communities (41 shown, 16 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.87)
- Token cost: 259,714 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_PDF Billing|PDF Billing]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_UI Pages|UI Pages]]
- [[_COMMUNITY_Admin Functions|Admin Functions]]
- [[_COMMUNITY_UI Pages|UI Pages]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_UI Pages|UI Pages]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_PDF Billing|PDF Billing]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_UI Pages|UI Pages]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_SMSOTP|SMS/OTP]]
- [[_COMMUNITY_Testing|Testing]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Admin Functions|Admin Functions]]
- [[_COMMUNITY_Admin Functions|Admin Functions]]
- [[_COMMUNITY_Testing|Testing]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Testing|Testing]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Other|Other]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_UI Pages|UI Pages]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_Database|Database]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Memory Compression|Memory Compression]]
- [[_COMMUNITY_Other|Other]]

## God Nodes (most connected - your core abstractions)
1. `showLoader()` - 42 edges
2. `toast()` - 17 edges
3. `QueryBuilder` - 14 edges
4. `ICONS` - 12 edges
5. `Supabase Compatibility Layer (MySQL)` - 12 edges
6. `supabase` - 11 edges
7. `openInquiryDetail()` - 11 edges
8. `App Logo / Brand Mark` - 11 edges
9. `Utilities Module` - 11 edges
10. `validate()` - 10 edges

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
- **Authentication System** — auth_module, supabase_compat, main_app [INFERRED 0.85]
- **UI Rendering Stack** — layout_module, icons_module, utils_module [INFERRED 0.75]
- **Data Persistence Layer** — supabase_compat, realtime_transport, server_package [INFERRED 0.75]
- **Fast2SMS OTP operations test suite** — fast2sms_test_normalizeIndianMobile, fast2sms_test_sendFast2SmsOtp, fast2sms_test_verifyFast2SmsOtp, fast2sms_test_resendFast2SmsOtp [EXTRACTED 1.00]
- **Bill PDF rendering dual implementation path (html2canvas + native print)** — pdf_rendering_test_renderBillToPdfBlob, pdf_rendering_test_printWindow [INFERRED 0.85]
- **Code audit improvements and feature additions** — audit_critical_issues, audit_new_features, audit_error_handling_pattern [EXTRACTED 1.00]

## Communities (57 total, 16 thin omitted)

### Community 0 - "PDF Billing"
Cohesion: 0.06
Nodes (29): showBillShareModal(), attendanceDateKey(), blobToBase64(), BUSINESS, dateKey(), daysBetweenInclusive(), displayStatus(), escapeAttr() (+21 more)

### Community 1 - "Other"
Cohesion: 0.08
Nodes (27): escapeAttr(), escapeHtml(), openNoticeEditor(), renderNoticesTab(), toDatetimeLocal(), escapeAttr(), escapeHtml(), mediaPreview() (+19 more)

### Community 2 - "UI Pages"
Cohesion: 0.09
Nodes (31): mapLink(), openInquiryDetail(), openInquiryDetailWithLoader(), setButtonLoading(), displayStatus(), loadMiniStats(), openTicketDetail(), renderClientDashboard() (+23 more)

### Community 3 - "Admin Functions"
Cohesion: 0.12
Nodes (32): money(), renderAdminDashboard(), renderAllTickets(), renderBillsTab(), renderCashCollectionsTab(), renderClients(), renderContacts(), renderDeviceTypesTab() (+24 more)

### Community 4 - "UI Pages"
Cohesion: 0.10
Nodes (18): attendanceDateKey(), buildPaidUpdates(), dateKey(), daysBetweenInclusive(), detectHeader(), displayStatus(), importServiceRows(), inferLayout() (+10 more)

### Community 5 - "Memory Compression"
Cohesion: 0.13
Nodes (20): main(), print_usage(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file(), is_sensitive_path(), Heuristic denylist for files that must never be shipped to a third-party API. (+12 more)

### Community 6 - "Other"
Cohesion: 0.09
Nodes (16): escapeAttr(), escapeHTML(), FALLBACK_ISSUE_OPTIONS, getCachedAds(), loadIssueOptionsFromPricing(), makeCaptcha(), OTHER_OPTION, postPublicApi() (+8 more)

### Community 7 - "Other"
Cohesion: 0.20
Nodes (20): benchmark_pair(), count_tokens(), main(), print_table(), count_bullets(), extract_code_blocks(), extract_headings(), extract_inline_codes() (+12 more)

### Community 8 - "Other"
Cohesion: 0.08
Nodes (24): dependencies, bcryptjs, cors, dotenv, express, jsonwebtoken, multer, mysql2 (+16 more)

### Community 9 - "Authentication"
Cohesion: 0.10
Nodes (19): author, dependencies, bcryptjs, cors, dotenv, express, jsonwebtoken, mysql2 (+11 more)

### Community 10 - "Authentication"
Cohesion: 0.24
Nodes (19): Authentication Flow (SMS OTP + Phone Verification), Authentication Module, Client Dashboard and Ticket Management, Collections Report Module, Discounts Management, Employee Repaired Billing Module, Fixed PDF Rendering Function, High-Accuracy GPS with Multiple Fixes (+11 more)

### Community 11 - "UI Pages"
Cohesion: 0.15
Nodes (3): getHeaders(), getUserRole(), QueryBuilder

### Community 12 - "Other"
Cohesion: 0.18
Nodes (15): Attendance Clock-in/out Tracking, Inventory Stock Monitoring, Role-Based Access Control, Row Level Security Policies, Admin Role, Client Role, Employee Role, Networking Experts Service Portal (+7 more)

### Community 13 - "Other"
Cohesion: 0.15
Nodes (14): escapeAttr(), escapeHtml(), getMissedEodRows(), groupedMissedEods(), openAdEditor(), openAdminRequestModal(), openComplaintResponder(), renderAdsTab() (+6 more)

### Community 14 - "Other"
Cohesion: 0.15
Nodes (12): createdUser, deletedUser, __dirname, dotenv, empHeaders, employeeToken, headers, jwt (+4 more)

### Community 15 - "Other"
Cohesion: 0.17
Nodes (12): Apple Touch Icon (assets), Favicon 96x96 PNG, Favicon SVG (assets), JavaScript Logo SVG, Logo PNG, Web App Manifest Icon 192x192, Web App Manifest Icon 512x512, App Logo / Brand Mark (+4 more)

### Community 16 - "PDF Billing"
Cohesion: 0.23
Nodes (9): blobToBase64(), BUSINESS, displayStatus(), loadHtml2Pdf(), openPremiumBillModal(), renderBillToPdfBlob(), renderPremiumBillHTML(), statusText() (+1 more)

### Community 17 - "Memory Compression"
Cohesion: 0.22
Nodes (11): Caveman Compression Rules, caveman-compress README (.agents), caveman-compress Security Doc (.agents), caveman-compress Skill (.agents), Snyk High Risk False Positive, Token Savings Per Session, Caveman Toolkit, Anthropic Python SDK / Claude CLI Fallback (+3 more)

### Community 18 - "Other"
Cohesion: 0.38
Nodes (9): dateKey(), filterRows(), inr(), paymentDate(), rangeFor(), renderAdminCollections(), renderEmployeeCollections(), rowsTable() (+1 more)

### Community 19 - "UI Pages"
Cohesion: 0.18
Nodes (11): boot(), getNavItems(), getPageRenderer(), goToLanding(), hidePWAInstallBtn(), loadCanAddService(), navigate(), showPWAInstallBtn() (+3 more)

### Community 20 - "Other"
Cohesion: 0.29
Nodes (7): Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social/Community Icon, X (Twitter) Icon, UI Icon Sprite (icons.svg)

### Community 21 - "Other"
Cohesion: 0.29
Nodes (6): __dirname, dotenv, headers, jwt, require, token

### Community 22 - "SMS/OTP"
Cohesion: 0.33
Nodes (6): fast2sms.cjs server module, normalizeIndianMobile function test, resendFast2SmsOtp function test, sendDltSms function test, sendFast2SmsOtp function test, verifyFast2SmsOtp function test

### Community 23 - "Testing"
Cohesion: 0.33
Nodes (4): calls, {
  normalizeIndianMobile,
  sendFast2SmsOtp,
  verifyFast2SmsOtp,
  resendFast2SmsOtp,
  sendDltSms,
}, require, url

### Community 24 - "Other"
Cohesion: 0.60
Nodes (5): Project File Structure, Google Fonts (Inter, JetBrains Mono), index.html Entry Point, src/main.js (Application Logic), src/style.css (Design System)

### Community 25 - "Other"
Cohesion: 0.40
Nodes (4): employeeSource, functionEnd, functionStart, source

### Community 26 - "Admin Functions"
Cohesion: 0.50
Nodes (4): Rate limit handling in admin.js, Service pricing upload functionality in admin.js, Critical issues fixed in code audit, Error handling patterns review

### Community 27 - "Admin Functions"
Cohesion: 0.50
Nodes (4): Admin Settings Panel with auto clock-out configuration, New features added in audit period, Employee Service Pricing Tab feature, can_add_service permission-based access control

### Community 28 - "Testing"
Cohesion: 0.67
Nodes (3): Admin User CRUD Integration Tests, Auto Assignment Toggle Tests, Server Dependencies

### Community 29 - "Other"
Cohesion: 0.67
Nodes (3): ATS Optimization, Tailored Resume Generator Skill (.agents), Tailored Resume Generator Skill (.claude)

### Community 31 - "Testing"
Cohesion: 0.67
Nodes (3): employee.js page module, openBillPrintWindow function test, renderBillToPdfBlob function validation test

## Ambiguous Edges - Review These
- `Role-Based Access Control` → `Unauthorized Response Marker`  [AMBIGUOUS]
  response.txt · relation: conceptually_related_to
- `JavaScript Logo SVG` → `App Logo / Brand Mark`  [AMBIGUOUS]
  src/assets/javascript.svg · relation: conceptually_related_to

## Knowledge Gaps
- **110 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Role-Based Access Control` and `Unauthorized Response Marker`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `JavaScript Logo SVG` and `App Logo / Brand Mark`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `UI Pages` to `PDF Billing`, `PDF Billing`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `renderPremiumBillHTML()` connect `PDF Billing` to `UI Pages`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `QueryBuilder` connect `UI Pages` to `Other`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _145 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PDF Billing` be split into smaller, more focused modules?**
  _Cohesion score 0.05939716312056738 - nodes in this community are weakly interconnected._