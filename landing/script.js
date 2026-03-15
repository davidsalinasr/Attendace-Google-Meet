/**
 * Landing page: CTAs and video modal (Option A).
 * Set your YouTube video ID below; leave empty to show placeholder until you have a video.
 */
const CHROME_STORE_URL = '#'; // Replace with your Chrome Web Store link when published
const YOUTUBE_VIDEO_ID = 'VHrd3JvWABQ';  // https://www.youtube.com/watch?v=VHrd3JvWABQ

(function () {
  const modal = document.getElementById('video-modal');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalClose = document.getElementById('modal-close');
  const ctaVideo = document.getElementById('cta-video');
  const videoIframe = document.getElementById('video-iframe');
  const ctaPrimary = document.getElementById('cta-primary');
  const headerCta = document.getElementById('header-cta');

  if (!modal || !ctaVideo) return;

  function openModal() {
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const wrap = videoIframe?.closest('.modal-video-wrap');
    if (YOUTUBE_VIDEO_ID && videoIframe) {
      videoIframe.src = `https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1`;
      wrap?.classList.add('has-video');
    } else {
      wrap?.classList.remove('has-video');
    }
    modalClose?.focus();
    ctaVideo.setAttribute('aria-expanded', 'true');
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (videoIframe) {
      videoIframe.src = '';
    }
    ctaVideo.setAttribute('aria-expanded', 'false');
    ctaVideo.focus();
  }

  ctaVideo.addEventListener('click', function (e) {
    e.preventDefault();
    openModal();
  });

  modalClose?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal?.getAttribute('aria-hidden') === 'false') {
      closeModal();
    }
  });

  if (CHROME_STORE_URL && CHROME_STORE_URL !== '#') {
    if (ctaPrimary) ctaPrimary.href = CHROME_STORE_URL;
    if (headerCta) headerCta.href = CHROME_STORE_URL;
  }
})();

/**
 * Testimonials carousel: prev/next, dots, optional auto-advance.
 */
(function () {
  const track = document.getElementById('carousel-track');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dotsContainer = document.getElementById('carousel-dots');
  const CAROUSEL_GAP = 8;
  const AUTO_ADVANCE_MS = 5000;

  if (!track || !prevBtn || !nextBtn || !dotsContainer) return;

  const cards = track.querySelectorAll('.testimonial-card');
  const totalSlides = cards.length;
  if (totalSlides === 0) return;

  let currentIndex = 0;
  let autoTimer = null;
  let cardsPerView = 1;

  function getCardsPerView() {
    return 2;
  }

  function getMaxIndex() {
    return Math.max(0, totalSlides - getCardsPerView());
  }

  function updateTransform() {
    const card = cards[0];
    if (!card) return;
    const cardWidth = card.offsetWidth;
    const offset = currentIndex * (cardWidth + CAROUSEL_GAP);
    track.style.transform = `translateX(-${offset}px)`;
  }

  function updateControls() {
    const maxIdx = getMaxIndex();
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= maxIdx;
    dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.setAttribute('aria-current', i === currentIndex ? 'true' : 'false');
    });
  }

  function goToSlide(index) {
    const maxIdx = getMaxIndex();
    currentIndex = Math.max(0, Math.min(index, maxIdx));
    updateTransform();
    updateControls();
  }

  function goPrev() {
    goToSlide(currentIndex - 1);
  }

  function goNext() {
    goToSlide(currentIndex + 1);
  }

  function startAutoAdvance() {
    stopAutoAdvance();
    autoTimer = setInterval(() => {
      const maxIdx = getMaxIndex();
      if (currentIndex >= maxIdx) goToSlide(0);
      else goNext();
    }, AUTO_ADVANCE_MS);
  }

  function stopAutoAdvance() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
  }

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  dotsContainer.addEventListener('mouseenter', stopAutoAdvance);
  dotsContainer.addEventListener('focusin', stopAutoAdvance);
  prevBtn.addEventListener('mouseenter', stopAutoAdvance);
  nextBtn.addEventListener('mouseenter', stopAutoAdvance);
  track.addEventListener('mouseenter', stopAutoAdvance);

  dotsContainer.addEventListener('mouseleave', startAutoAdvance);
  prevBtn.addEventListener('mouseleave', startAutoAdvance);
  nextBtn.addEventListener('mouseleave', startAutoAdvance);
  track.addEventListener('mouseleave', startAutoAdvance);

  window.addEventListener('resize', () => {
    cardsPerView = getCardsPerView();
    goToSlide(Math.min(currentIndex, getMaxIndex()));
  });

  updateTransform();
  updateControls();
  startAutoAdvance();
})();

// #region agent log
(function debugLayout() {
  function log(id, message, data) {
    var payload = { sessionId: 'ea97db', hypothesisId: id, location: 'script.js:debugLayout', message: message, data: data || {}, timestamp: Date.now() };
    fetch('http://127.0.0.1:7776/ingest/06ae881b-052a-4b63-b6dc-ea0d40cf8627', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ea97db' }, body: JSON.stringify(payload) }).catch(function() {});
  }
  function measure() {
    var vp = document.querySelector('.viewport');
    var hero = document.querySelector('.hero');
    var heroVisual = document.querySelector('.hero-visual');
    var mock = document.querySelector('.browser-mock');
    var mockContent = document.querySelector('.browser-mock-content');
    var testimonials = document.querySelector('.testimonials');
    var header = document.querySelector('.header');
    var winH = window.innerHeight;
    var vpH = vp ? vp.offsetHeight : 0;
    var vpScroll = vp ? vp.scrollHeight : 0;
    var heroH = hero ? hero.offsetHeight : 0;
    var heroScroll = hero ? hero.scrollHeight : 0;
    var visualH = heroVisual ? heroVisual.offsetHeight : 0;
    var mockH = mock ? mock.offsetHeight : 0;
    var contentH = mockContent ? mockContent.offsetHeight : 0;
    var testTop = testimonials ? testimonials.offsetTop : 0;
    var testH = testimonials ? testimonials.offsetHeight : 0;
    var headerH = header ? header.offsetHeight : 0;
    var sum = headerH + heroH + testH;
    log('A', 'browser-mock and hero-visual heights', { mockH: mockH, contentH: contentH, visualH: visualH, heroH: heroH });
    log('B', 'hero grid column constraint', { heroH: heroH, heroScroll: heroScroll, visualH: visualH });
    log('C', 'hero flex vs content', { heroH: heroH, vpH: vpH, heroScroll: heroScroll });
    log('D', 'viewport sum vs dvh', { winH: winH, vpH: vpH, vpScroll: vpScroll, headerH: headerH, heroH: heroH, testH: testH, sum: sum, overflow: sum > winH });
    log('E', 'testimonials position and mockup', { testTop: testTop, testH: testH, mockBottom: mock ? mock.getBoundingClientRect().bottom : 0 });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { setTimeout(measure, 100); });
  else setTimeout(measure, 100);
  window.addEventListener('resize', function() { setTimeout(measure, 50); });
})();
// #endregion
