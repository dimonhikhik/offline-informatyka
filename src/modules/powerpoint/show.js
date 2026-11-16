import { button,el } from '../office/shared.js';
import { orderedAnimations } from './model.js';

const transitions = new Set(['fade', 'push', 'wipe']);
function entranceGroups(slide) {
  const automatic = [];
  const clicks = [];
  let group = automatic;
  let previousStart = 0;
  let previousEnd = 0;
  for (const {animation, index} of orderedAnimations(slide.objects)) {
    if (animation.trigger !== 'with' && animation.trigger !== 'after') {
      group = [];
      clicks.push(group);
      previousStart = 0;
      previousEnd = 0;
    }
    const delay = animation.trigger === 'after' ? previousEnd : previousStart;
    const duration = animation.effect === 'appear' ? 0 : animation.duration * 1000;
    group.push({index, effect:animation.effect, delay, duration});
    previousStart = delay;
    previousEnd = delay + duration;
  }
  return {automatic, clicks};
}

function setObjectVisible(node, visible) {
  node.style.visibility = visible ? '' : 'hidden';
  node.inert = !visible;
  delete node.dataset.pptEntering;
  node.style.removeProperty('--ppt-entrance-duration');
}

export function showSlides({ host, deck, startIndex = 0, renderSlide, notify, onClose }) {
  const slides = deck.slides.flatMap((slide, index) => slide.hidden ? [] : [{ slide, index }]);
  if (!slides.length) {
    notify?.('У презентації всі слайди приховані.');
    return null;
  }

  const first = slides.findIndex(({ index }) => index >= startIndex);
  let position = first < 0 ? slides.length - 1 : first;
  const hasTiming = slides.slice(0, -1).some(({ slide }) => Number(slide.advance) > 0);
  const hasNotes = slides.some(({ slide }) => slide.notes?.trim());
  let playing = hasTiming;
  let remaining = 0;
  let deadline = 0;
  let timer = 0;
  let swipe = null;
  let suppressTap = false;
  let disposed = false;
  let entrances = null;
  let objectNodes = [];
  let revealedGroups = 0;
  let slideDelay = null;
  const entranceTimers = new Set();
  const returnFocus = document.activeElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const surface = el('div', { className:'ppt-show__surface', tabindex:0, role:'region', 'aria-label':'Поточний слайд' });
  const noteText = el('p', {});
  const notes = el('aside', { id:'ppt-show-notes', className:'ppt-show__notes', 'aria-label':'Нотатки доповідача', hidden:true }, noteText);
  const noteButton = button('Нотатки', toggleNotes, { 'aria-controls':notes.id, 'aria-expanded':'false', hidden:!hasNotes });
  const fullButton = button('⛶', toggleFullscreen, { 'aria-label':'На весь екран', title:'На весь екран' });
  const closeButton = button('Закрити', close, { 'aria-label':'Закрити показ' });
  const previous = button('‹', backward, { 'aria-label':'Попередній слайд', title:'Попередній слайд' });
  const next = button('›', forward, { 'aria-label':'Наступний слайд', title:'Наступний слайд' });
  const auto = button('Пауза', toggleTiming, { 'aria-label':'Автопоказ', hidden:!hasTiming });
  const chooser = el('select', {
    className:'ppt-show__count',
    'aria-label':'Перейти до слайда',
    onChange:event => go(Number(event.currentTarget.value))
  }, ...slides.map(({ slide, index }, choice) => el('option', { value:choice },
    `${index + 1} / ${deck.slides.length}${slide.title ? ' · ' + slide.title : ''}`)));

  const content = el('div', { className:'ppt-show__content' },
    el('header', { className:'ppt-show__header' }, el('strong', { title:deck.name }, deck.name), noteButton, fullButton, closeButton),
    surface, notes,
    el('nav', { className:'ppt-show__controls', 'aria-label':'Керування показом' }, previous, chooser, next, auto));
  const dialog = el('dialog', {
    className:'ppt-show',
    'aria-label':'Показ презентації',
    'data-aspect':deck.aspect === 'standard' ? 'standard' : 'wide'
  }, content);
  fullButton.hidden = !document.fullscreenEnabled || typeof content.requestFullscreen !== 'function';

  function stopClock() {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    remaining = Math.max(0, deadline - performance.now());
  }

  function startClock() {
    if (timer || disposed || !playing || !notes.hidden || document.hidden || position === slides.length - 1 || remaining === null ||
        !entrances || entranceTimers.size || revealedGroups < entrances.clicks.length) return;
    deadline = performance.now() + remaining;
    timer = setTimeout(() => {
      timer = 0;
      go(position + 1);
    }, remaining);
  }

  function toggleTiming() {
    stopClock();
    playing = !playing;
    updateTimingButton();
    startClock();
  }

  function updateTimingButton() {
    auto.textContent = playing ? 'Пауза' : 'Автопоказ';
    auto.setAttribute('aria-pressed', String(playing));
  }

  function toggleNotes() {
    stopClock();
    notes.hidden = !notes.hidden;
    noteButton.setAttribute('aria-expanded', String(!notes.hidden));
    dialog.toggleAttribute('data-notes-open', !notes.hidden);
    if (!notes.hidden) notes.scrollTop = 0;
    startClock();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === content) await document.exitFullscreen();
      else await content.requestFullscreen();
    } catch {
      notify?.('Браузер не відкрив повноекранний режим.');
    }
  }

  function updateFullscreenButton() {
    const label = document.fullscreenElement === content ? 'Вийти з повноекранного режиму' : 'На весь екран';
    fullButton.setAttribute('aria-label', label);
    fullButton.title = label;
  }

  function updateMotion() {
    dialog.toggleAttribute('data-reduced-motion', reduceMotion.matches);
    if (entrances && reduceMotion.matches) {
      finishRevealedEntrances();
      startClock();
    }
  }

  function stopEntrances() {
    for (const timeout of entranceTimers) clearTimeout(timeout);
    entranceTimers.clear();
  }

  function scheduleEntrance(callback, delay) {
    const timeout = setTimeout(() => {
      entranceTimers.delete(timeout);
      callback();
      startClock();
    }, delay);
    entranceTimers.add(timeout);
  }

  function playGroup(group) {
    for (const {index, effect, delay, duration} of group) {
      const node = objectNodes[index];
      if (!node) continue;
      const reveal = () => {
        setObjectVisible(node, true);
        if (duration && !reduceMotion.matches) {
          node.dataset.pptEntering = effect;
          node.style.setProperty('--ppt-entrance-duration', `${duration}ms`);
          scheduleEntrance(() => setObjectVisible(node, true), duration);
        }
      };
      if (delay && !reduceMotion.matches) scheduleEntrance(reveal, delay);
      else reveal();
    }
  }

  function finishRevealedEntrances() {
    stopEntrances();
    for (const {index} of entrances.automatic) {
      if (objectNodes[index]) setObjectVisible(objectNodes[index], true);
    }
    for (const [group, steps] of entrances.clicks.entries()) {
      for (const {index} of steps) {
        const node = objectNodes[index];
        if (!node) continue;
        const visible = group < revealedGroups;
        if (!visible && node.contains(document.activeElement)) surface.focus({preventScroll:true});
        setObjectVisible(node, visible);
      }
    }
  }

  function updateNavigation() {
    const hasNextEntrance = revealedGroups < entrances.clicks.length;
    const previousLabel = revealedGroups ? 'Попередній крок анімації' : 'Попередній слайд';
    const nextLabel = hasNextEntrance ? 'Наступний крок анімації' : 'Наступний слайд';
    previous.disabled = position === 0 && !revealedGroups;
    next.disabled = position === slides.length - 1 && !hasNextEntrance;
    previous.title = previousLabel;
    next.title = nextLabel;
    previous.setAttribute('aria-label', previousLabel);
    next.setAttribute('aria-label', nextLabel);
  }

  function draw(direction = 'next', revealAll = false) {
    const { slide, index } = slides[position];
    const transition = transitions.has(slide.transition) ? slide.transition : 'none';
    const stage = el('div', { className:'slide-canvas ppt-show__stage', 'aria-label':`Слайд ${index + 1}` });
    renderSlide(stage, slide, { interactive:false, links:true, aspect:deck.aspect });
    entrances = entranceGroups(slide);
    objectNodes = [];
    for (const node of stage.querySelectorAll('[data-object]')) objectNodes[Number(node.dataset.object)] = node;
    revealedGroups = revealAll ? entrances.clicks.length : 0;
    if (revealAll) finishRevealedEntrances();
    else {
      for (const group of [entrances.automatic, ...entrances.clicks]) {
        for (const {index} of group) {
          if (objectNodes[index]) setObjectVisible(objectNodes[index], false);
        }
      }
    }
    surface.dataset.transition = transition;
    surface.dataset.direction = direction;
    surface.setAttribute('aria-label', `Слайд ${index + 1} із ${deck.slides.length}`);
    if (surface.contains(document.activeElement)) surface.focus({preventScroll:true});
    surface.replaceChildren(stage);
    updateNavigation();
    chooser.value = String(position);
    noteText.textContent = slide.notes?.trim() || 'Для цього слайда немає нотаток.';
    notes.scrollTop = 0;
    const seconds = Number(slide.advance);
    slideDelay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
    remaining = slideDelay;
    if (!revealAll) playGroup(entrances.automatic);
    startClock();
  }

  function go(target, revealAll = false) {
    if (!Number.isInteger(target) || target < 0 || target >= slides.length || target === position) return;
    stopClock();
    stopEntrances();
    const direction = target < position ? 'previous' : 'next';
    position = target;
    draw(direction, revealAll);
  }

  function forward() {
    if (entranceTimers.size) finishRevealedEntrances();
    if (revealedGroups >= entrances.clicks.length) { go(position + 1); return; }
    playGroup(entrances.clicks[revealedGroups++]);
    updateNavigation();
    startClock();
  }

  function backward() {
    if (!revealedGroups) { go(position - 1, true); return; }
    stopClock();
    remaining = slideDelay;
    revealedGroups--;
    finishRevealedEntrances();
    updateNavigation();
  }

  function visibility() {
    if (document.hidden) stopClock();
    else startClock();
  }

  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    suppressTap = false;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      swipe = { id:event.pointerId, x:event.clientX, y:event.clientY };
    }
  });
  dialog.addEventListener('pointerup', event => {
    if (swipe?.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 42 || Math.abs(dx) <= Math.abs(dy) * 1.35) return;
    suppressTap = true;
    if (dx < 0) forward();
    else backward();
  });
  dialog.addEventListener('pointercancel', event => {
    if (swipe?.id === event.pointerId) swipe = null;
  });
  surface.addEventListener('click', event => {
    if (suppressTap && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event.target.closest('a,button')) forward();
  }, true);
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('select,input,textarea')) return;
    const { key } = event;
    if (key === ' ' && event.target.closest('button,a')) return;
    const navigation = {
      ArrowRight:forward, ArrowDown:forward, PageDown:forward, ' ':forward,
      ArrowLeft:backward, ArrowUp:backward, PageUp:backward, Home:() => go(0), End:() => go(slides.length - 1)
    };
    if (!Object.hasOwn(navigation, key)) return;
    event.preventDefault();
    navigation[key]();
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopClock();
    stopEntrances();
    if (document.fullscreenElement === content) document.exitFullscreen().catch(() => {});
    document.removeEventListener('fullscreenchange', updateFullscreenButton);
    document.removeEventListener('visibilitychange', visibility);
    reduceMotion.removeEventListener('change', updateMotion);
    dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll:true });
    onClose?.(slides[position].index);
  }

  function close() {
    if (dialog.open) dialog.close();
    dispose();
  }

  dialog.addEventListener('close', dispose);
  host.append(dialog);
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('visibilitychange', visibility);
  reduceMotion.addEventListener('change', updateMotion);
  updateMotion();
  updateTimingButton();
  try {
    dialog.showModal();
    surface.focus({ preventScroll:true });
    draw();
  } catch (error) {
    close();
    throw error;
  }
  return close;
}
