# Ad Carousel Component Guide

## Overview
The ad carousel component displays rotating ads/images in a fixed 330px × 220px container with auto-rotation, manual navigation, and play/pause controls.

## Location in Project
- **Component**: `src/ad-carousel.js`
- **Styles**: `src/ad-carousel.css`
- **Integration**: `src/pages/landing.js` (already integrated)

## Dimensions
- **Width**: 330px (fits perfectly in the circled area from your screenshot)
- **Height**: 220px (standard ad billboard height)
- **Responsive**: Scales to 100% width on mobile (max 330px)

## Features
✅ Auto-rotation every 5 seconds (configurable)
✅ Manual navigation (prev/next buttons)
✅ Indicator dots for quick navigation
✅ Play/pause toggle button
✅ Pause on hover
✅ Support for both images and videos
✅ Smooth fade-in transitions
✅ Keyboard accessible (focus states)
✅ Mobile responsive

## How It's Already Integrated

### In `landing.js`:
```javascript
// Import at the top
import { AdCarousel } from '../ad-carousel.js';
import '../ad-carousel.css';

// In the render function, ads display in:
<div id="srf-ad-slot"></div>

// Mounted when ads load:
function mountAdCarousel() {
  if (state._adCarousel) { state._adCarousel.destroy(); }
  
  const slot = container.querySelector('#srf-ad-slot');
  if (!slot) return;

  state._adCarousel = new AdCarousel('srf-ad-slot', state.ads, {
    autoRotateMs: 5000,
  });
}
```

## How to Use in Other Pages

If you want to add the ad carousel to another page:

```javascript
import { AdCarousel } from '../ad-carousel.js';
import '../ad-carousel.css';

// Get your ads from database or API
const ads = [
  { id: 1, url: '/uploads/ad1.jpg', kind: 'image', caption: 'Ad 1' },
  { id: 2, url: '/uploads/ad2.mp4', kind: 'video', caption: 'Video Ad' },
];

// Create carousel in a container
const carousel = new AdCarousel('container-id', ads, {
  autoRotateMs: 6000,  // 6 seconds between slides
});

// Update ads dynamically
carousel.updateAds(newAds);

// Cleanup when component unmounts
carousel.destroy();
```

## HTML Setup
```html
<div id="my-ad-container"></div>

<script type="module">
  import { AdCarousel } from './ad-carousel.js';
  
  const carousel = new AdCarousel('my-ad-container', myAds);
</script>
```

## CSS Customization

You can override default colors and styles:

```css
.ad-carousel {
  border-radius: 12px;  /* Adjust corner radius */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);  /* Adjust shadow */
}

.ad-carousel__nav:hover {
  color: #your-brand-color;  /* Nav button hover color */
}

.ad-carousel__indicator.active {
  background: #your-brand-color;  /* Active indicator color */
}
```

## Ad Database Schema

Your ads table should have these fields:
```sql
- id (int, PK)
- url (string) - Path or full URL to image/video
- kind (enum) - 'image' or 'video'
- caption (text, optional) - Text shown below ad
- placement (string) - 'landing', 'popup_landing', etc.
- device_target (string) - 'desktop', 'mobile', or 'both'
- active (boolean) - 1 for active, 0 for inactive
- starts_at (datetime, optional) - When ad should start showing
- expires_at (datetime, optional) - When ad should stop showing
- position (int) - Sort order
- duration_ms (int, optional) - How long to display (for images)
```

## API Methods

### Constructor
```javascript
new AdCarousel(containerId, ads, options)
```

**Parameters:**
- `containerId` (string) - ID of container element
- `ads` (array) - Array of ad objects with `url` and optional `kind`, `caption`
- `options` (object, optional):
  - `autoRotateMs` (number) - Milliseconds between auto-rotation (default: 5000)

### Methods
```javascript
carousel.prev()              // Go to previous ad
carousel.next()             // Go to next ad
carousel.pauseAutoRotate()  // Stop auto-rotation
carousel.resumeAutoRotate() // Resume auto-rotation
carousel.toggleAutoRotate() // Toggle play/pause
carousel.updateAds(newAds)  // Replace ads and restart
carousel.destroy()          // Clean up and remove from DOM
```

## Current Landing Page Integration

The ad carousel is already integrated in the landing page:
- Displays in the hero section (that 330×220 area you circled)
- Auto-fetches ads from the `ads` table
- Caches ads for 10 minutes
- Shows on both desktop and mobile
- Filters ads by device target and expiration dates

## Styling Classes

All component styles use the `.ad-carousel` prefix:

```
.ad-carousel                    - Main container
.ad-carousel__media-container   - Image/video area
.ad-carousel__media-slot        - Actual media element
.ad-carousel__image             - Image tag
.ad-carousel__video             - Video tag
.ad-carousel__controls          - Control buttons area
.ad-carousel__nav               - Navigation buttons
.ad-carousel__nav--prev         - Previous button
.ad-carousel__nav--next         - Next button
.ad-carousel__indicators        - Dots container
.ad-carousel__indicator         - Individual dot
.ad-carousel__indicator.active  - Active dot state
.ad-carousel__play-pause        - Play/pause button area
.ad-carousel__play-btn          - Play/pause button
```

## Example Ads for Testing

To test, add these ads to your `ads` table:

```sql
INSERT INTO ads (url, kind, caption, placement, device_target, active, position)
VALUES 
  ('/uploads/test-ad-1.jpg', 'image', 'Summer Special', 'landing', 'both', 1, 1),
  ('/uploads/test-ad-2.jpg', 'image', 'New Services', 'landing', 'both', 1, 2),
  ('/uploads/promo.mp4', 'video', 'Video Promo', 'landing', 'desktop', 1, 3);
```

## Performance Notes

- Ads are preloaded before display
- Videos are preloaded to avoid playback delays
- Ad data is cached in localStorage for 10 minutes
- No ads are fetched if cache is still valid
- Component uses efficient DOM updates

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- IE11: Not supported (uses ES6 classes and fetch)
- Mobile browsers: Full support including iOS Safari

## Troubleshooting

**Ads not showing?**
- Check browser console for errors
- Verify ads are in database and marked as `active = 1`
- Check `device_target` matches your device
- Verify image/video URLs are accessible

**Auto-rotation not working?**
- Check console for JavaScript errors
- Verify there are at least 2 ads in the carousel
- Check that `autoRotateMs` is a valid number (>= 1000)

**Styling issues?**
- Make sure `ad-carousel.css` is imported
- Check for CSS specificity conflicts
- Use browser DevTools to inspect applied styles

## Future Enhancements

Possible improvements:
- [ ] Click-tracking for ad performance metrics
- [ ] Swipe gestures for mobile
- [ ] Animated transitions (slide, fade, zoom)
- [ ] Ad click destination URLs
- [ ] Analytics integration
- [ ] Carousel pagination (page 1 of 3, etc.)
