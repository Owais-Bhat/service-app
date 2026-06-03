# Fixes Applied - Device Target Implementation

## Issues Fixed

### 1. ✅ Device Target Dropdown Missing from Admin Form
**Problem:** The "Show on device" dropdown was not visible in the "Add slide" modal
**Cause:** The field was being inserted into the wrong modal (service request modal instead of ad editor modal)

**Solution:** 
- Removed the incorrect insertAdjacentHTML code from the "Register Service Request" function (line 1192-1203)
- Added the device_target select field DIRECTLY into the ad editor modal HTML template (before Duration field)
- Field now includes:
  - Label: "Show on device"
  - Options: "Both mobile and desktop", "Desktop only", "Mobile only"
  - Helper text: "Upload separate mobile and desktop banners (1920×450px), then choose where each appears."

**Files Changed:** `src/pages/admin.js`

---

### 2. ✅ Admin Dashboard Showing Wrong Banner Sizes
**Problem:** Admin dashboard was displaying:
- Desktop: 1600px × 900px (WRONG)
- Mobile: 1080px × 1350px (WRONG)

**Solution:** Updated the specs display to show:
- Desktop banner: 1920px × 450px ✓
- Mobile banner: 1920px × 450px ✓

**Files Changed:** `src/pages/admin.js` (lines 3728-3734)

---

## What's Now Working

### Admin Form
✅ "Show on device" dropdown is now visible in the "Add slide" modal
✅ Can select: Both, Desktop only, or Mobile only
✅ Field is saved to database as `device_target`

### Frontend Carousel
✅ Automatically filters ads based on device (desktop ≥768px, mobile <768px)
✅ Desktop-only ads hidden on mobile
✅ Mobile-only ads hidden on desktop
✅ "Both" ads show on all devices

### Admin Dashboard
✅ Correct banner size specs displayed (1920×450px for both)
✅ Clear instructions for uploading separate images

---

## Next Steps for User

1. **Test the admin form:**
   - Go to admin dashboard → Landing Page Ads
   - Click "+ Add slide"
   - You should see the "Show on device" dropdown between Caption and Duration fields

2. **Upload test ads:**
   - Create desktop image (1920×450px) and upload with "Desktop only"
   - Create mobile image (1920×450px) and upload with "Mobile only"
   - Set both to Active

3. **Test on landing page:**
   - Visit on desktop (≥768px width) → see only desktop ad
   - Visit on mobile (<768px width) → see only mobile ad
   - Resize browser across 768px → ads switch automatically

---

## About Carousel Height (Image #5)

The current carousel uses `aspect-ratio: 1920 / 450` which maintains proportions:
- On desktop: typically 300-350px tall depending on screen width
- On mobile: responsive height maintaining 4.27:1 aspect ratio

If you want a specific fixed height instead, let me know the target height in pixels and I can adjust the CSS. Currently it scales responsively to maintain the 1920×450 aspect ratio.

---

## Database Migration

Run this to ensure device_target column exists:
```sql
ALTER TABLE ads ADD COLUMN IF NOT EXISTS device_target ENUM('desktop', 'mobile', 'both') DEFAULT 'both';
```

File: `migrations_ads_device_target.sql`
