# Ad Banner Size Configuration Guide

## 📐 Correct Banner Sizes for Landing Page

### **DESKTOP BANNER**
- **Size**: 1920px × 450px (FULL WIDTH)
- **Format**: JPG, PNG, or WebP
- **Device Target**: `desktop`
- **Shows On**: Desktop browsers (768px and wider)
- **Aspect Ratio**: 4.27:1 (landscape)
- **Use Case**: Full-width promotional banners

### **MOBILE BANNER**
- **Size**: Native resolution 1920px × 450px (responsive scaling)
- **Format**: JPG, PNG, or WebP
- **Device Target**: `mobile`
- **Shows On**: Mobile devices (under 768px width)
- **Aspect Ratio**: SAME as desktop (4.27:1) - maintains responsive proportions
- **Use Case**: Mobile-optimized banners
- **Note**: Image scales to 100% width, height adjusts to maintain 1920:450 aspect ratio

---

## 🗂️ How to Upload Ads

### **Step 1: Go to Admin Dashboard**
Navigate to: `Landing Ads` section

### **Step 2: Click "+ Add slide"**

### **Step 3: Fill in the Form**

#### **For Desktop Ad:**
```
URL: /uploads/ad-desktop-promotion.jpg
Kind: Image (or Video)
Caption: (optional) "Summer Special Offer"
Placement: landing
Device Target: desktop ← IMPORTANT
Active: Yes (checked)
Position: 1
Duration: 6.0s (for images)
```

#### **For Mobile Ad:**
```
URL: /uploads/ad-mobile-promotion.jpg
Kind: Image (or Video)
Caption: (optional) "Summer Special Offer"
Placement: landing
Device Target: mobile ← IMPORTANT
Active: Yes (checked)
Position: 2
Duration: 6.0s (for images)
```

---

## ✅ Image Preparation

### Desktop Image (1920 × 450px - FULL WIDTH)
```
Resolution: 1920px wide × 450px tall
Aspect Ratio: 4.27:1 (landscape/wide)
Format: JPG (quality 85-90), PNG, or WebP
File Size: <300KB recommended
Examples: 
  - Full-width promotional banners
  - Service offers
  - Holiday specials
  - Brand campaigns
  - Announcements
```

### Mobile Image (1920 × 450px, responsive scaling)
```
Resolution: 1920px wide × 450px tall (native, same as desktop)
Aspect Ratio: 4.27:1 (same as desktop - maintains consistency)
Format: JPG (quality 85-90), PNG, or WebP
File Size: <300KB recommended
Display: Scales to 100% width, height adjusts proportionally
Examples:
  - Mobile-optimized promotions (landscape view on mobile)
  - Service offers for mobile
  - Mobile-specific campaigns
```

**Important**: Both desktop and mobile use the SAME aspect ratio (1920:450) but can have different images optimized for each device.

---

## 🎯 Device Targeting Rules

The system automatically shows the correct ad based on device:

| Device Type | Width | Shows | Hides |
|-------------|-------|-------|-------|
| **Desktop** | ≥768px | device_target: `desktop` or `both` | device_target: `mobile` |
| **Mobile** | <768px | device_target: `mobile` or `both` | device_target: `desktop` |

**Example:**
- Upload "ad-desktop.jpg" with `device_target: desktop`
  → Shows ONLY on desktop, hidden on mobile
- Upload "ad-mobile.jpg" with `device_target: mobile`
  → Shows ONLY on mobile, hidden on desktop

---

## 🔄 Carousel Behavior

**Desktop Carousel:**
- Width: 100% (full-width, max 1920px)
- Height: Auto (maintains 1920:450 aspect ratio)
- Auto-rotates: Every 5-6 seconds
- Shows: Only ads with `device_target: desktop` or `both`

**Mobile Carousel:**
- Width: 100% of screen (full-width on mobile)
- Height: Auto (maintains 1920:450 aspect ratio)
- Auto-rotates: Every 5-6 seconds
- Shows: Only ads with `device_target: mobile` or `both`

---

## 📋 Database Configuration

Your `ads` table should have these fields:

```sql
CREATE TABLE ads (
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
```

**Key Field Explanations:**
- `device_target`: **MUST be set to control which device sees the ad**
  - `desktop` = Desktop only
  - `mobile` = Mobile only
  - `both` = Show on all devices

---

## 🚀 Best Practices

✅ **DO:**
- Upload separate optimized images for desktop and mobile
- Set `device_target` correctly for each ad
- Use appropriate image formats (JPG for photos, PNG for graphics)
- Keep file sizes under 150KB for desktop, 200KB for mobile
- Test on both desktop and mobile devices
- Set `active: 1` to show the ad, `0` to hide it
- Use `position` field to control slide order

❌ **DON'T:**
- Upload same image for both desktop and mobile
- Leave `device_target` as `both` if you want device-specific ads
- Upload huge files (over 300KB)
- Use animated GIFs (use MP4 video instead)
- Set both `starts_at` and `expires_at` incorrectly

---

## 📱 Responsive Breakpoints

```
Mobile View:  width < 768px
Desktop View: width ≥ 768px
```

When user resizes browser or rotates device, the carousel automatically switches between desktop and mobile ads.

---

## 🎨 Design Tips

### Desktop Ad (330×380)
- Keep important content in center 300×350px area
- Leave 15px margins on sides
- Use portrait orientation
- Good for: Vertical banners, product showcases

### Mobile Ad (1080×1350)
- Design for full-width mobile screens
- Content should be in safe area (50px margins)
- Use portrait/vertical layout
- Good for: Full-screen promotions, immersive ads

---

## 🔍 Troubleshooting

**Desktop image showing on mobile?**
- Check if `device_target` is set to `both` instead of `desktop`
- Verify the mobile image is active

**Mobile image showing on desktop?**
- Check if `device_target` is set to `both` instead of `mobile`
- Verify the desktop image is active

**No ads showing at all?**
- Check if `active` is set to 1
- Verify `placement` is set to `landing`
- Check if ads are within `starts_at` and `expires_at` date range

**Carousel not rotating?**
- Need at least 2 ads for auto-rotation
- Check browser console for errors
- Verify ads have valid `url` values

---

## 📸 Current Ad Examples

Look at your admin dashboard under "Slides" to see existing ads and their configurations.

To edit an ad:
1. Click **"Edit"** button next to the ad
2. Update the fields
3. Make sure to set correct `device_target`
4. Click save

To delete an ad:
1. Click **"Delete"** button
2. Confirm deletion
