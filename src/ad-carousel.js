/**
 * Ad Carousel Component
 * Displays rotating ads in a fixed container (330px × 220px)
 * Supports images and videos with auto-rotation and manual navigation
 */

export class AdCarousel {
  constructor(containerId, ads = [], options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    this.ads = ads.filter(ad => ad && ad.url);
    this.currentIndex = 0;
    this.autoRotateMs = options.autoRotateMs ?? 5000;
    this.rotateTimer = null;
    this.isPlaying = true;

    this.render();
    this.setupEventListeners();
    this.startAutoRotate();
  }

  render() {
    this.container.innerHTML = `
      <div class="ad-carousel">
        <div class="ad-carousel__media-container">
          ${this.ads.length === 0
            ? '<div class="ad-carousel__empty">No ads available</div>'
            : ''}
          <div class="ad-carousel__media-slot"></div>
        </div>

        ${this.ads.length > 1 ? `
          <div class="ad-carousel__controls">
            <button class="ad-carousel__nav ad-carousel__nav--prev" aria-label="Previous ad">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4L6 10l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <div class="ad-carousel__indicators">
              ${this.ads.map((_, i) =>
                `<div class="ad-carousel__indicator ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`
              ).join('')}
            </div>
            <button class="ad-carousel__nav ad-carousel__nav--next" aria-label="Next ad">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        ` : ''}

        <div class="ad-carousel__play-pause">
          <button class="ad-carousel__play-btn" aria-label="Toggle auto-rotate">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM6.5 5.5v5l3.5-2.5z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.updateMedia();
  }

  updateMedia() {
    if (this.ads.length === 0) return;

    const ad = this.ads[this.currentIndex];
    const mediaSlot = this.container.querySelector('.ad-carousel__media-slot');

    const isVideo = (ad.kind || 'image').toLowerCase() === 'video';

    if (isVideo) {
      mediaSlot.innerHTML = `
        <video class="ad-carousel__video" autoplay muted playsinline loop>
          <source src="${ad.url}" />
        </video>
      `;
    } else {
      mediaSlot.innerHTML = `
        <img class="ad-carousel__image" src="${ad.url}" alt="Ad" loading="lazy" />
      `;
    }

    // Update indicators
    this.container.querySelectorAll('.ad-carousel__indicator').forEach((ind, i) => {
      ind.classList.toggle('active', i === this.currentIndex);
    });
  }

  setupEventListeners() {
    const prevBtn = this.container.querySelector('.ad-carousel__nav--prev');
    const nextBtn = this.container.querySelector('.ad-carousel__nav--next');
    const playBtn = this.container.querySelector('.ad-carousel__play-btn');
    const indicators = this.container.querySelectorAll('.ad-carousel__indicator');

    prevBtn?.addEventListener('click', () => this.prev());
    nextBtn?.addEventListener('click', () => this.next());
    playBtn?.addEventListener('click', () => this.toggleAutoRotate());

    indicators.forEach(ind => {
      ind.addEventListener('click', () => {
        this.currentIndex = parseInt(ind.dataset.index);
        this.updateMedia();
        this.resetAutoRotate();
      });
    });

    // Pause on hover
    this.container.addEventListener('mouseenter', () => this.pauseAutoRotate());
    this.container.addEventListener('mouseleave', () => this.resumeAutoRotate());
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.ads.length) % this.ads.length;
    this.updateMedia();
    this.resetAutoRotate();
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.ads.length;
    this.updateMedia();
    this.resetAutoRotate();
  }

  toggleAutoRotate() {
    this.isPlaying ? this.pauseAutoRotate() : this.resumeAutoRotate();
  }

  pauseAutoRotate() {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
    this.isPlaying = false;
    this.updatePlayButton();
  }

  resumeAutoRotate() {
    this.isPlaying = true;
    this.startAutoRotate();
    this.updatePlayButton();
  }

  startAutoRotate() {
    if (!this.isPlaying || this.ads.length <= 1) return;

    this.rotateTimer = setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.ads.length;
      this.updateMedia();
    }, this.autoRotateMs);
  }

  resetAutoRotate() {
    if (this.rotateTimer) clearInterval(this.rotateTimer);
    this.startAutoRotate();
  }

  updatePlayButton() {
    const playBtn = this.container.querySelector('.ad-carousel__play-btn');
    if (!playBtn) return;

    if (this.isPlaying) {
      playBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM6.5 5.5v5l3.5-2.5z"/>
        </svg>
      `;
    } else {
      playBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM5.5 5.5v5l4-2.5z"/>
        </svg>
      `;
    }
  }

  destroy() {
    if (this.rotateTimer) clearInterval(this.rotateTimer);
    this.container.innerHTML = '';
  }

  updateAds(newAds) {
    this.ads = newAds.filter(ad => ad && ad.url);
    this.currentIndex = 0;
    this.render();
    this.setupEventListeners();
    this.startAutoRotate();
  }
}
