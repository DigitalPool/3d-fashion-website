/* Decorative 3D models around the site. Each loads only when it comes near the screen. */
import { createModelViewer } from './model-viewer.js';

const { $$ } = window.APDS;

const observer = new IntersectionObserver((entries) => {
  entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
    observer.unobserve(target);
    try {
      createModelViewer(target, { spin: 0.5 }).setModel(target.dataset.modelSpot)
        .then(() => target.classList.add('is-ready'))
        .catch((error) => { console.warn('[APDS] 3D model unavailable', error); target.remove(); });
    } catch (error) {
      target.remove(); // no WebGL: the page simply goes without the model
    }
  });
}, { rootMargin: '200px' });

$$('[data-model-spot]').forEach((spot) => observer.observe(spot));
