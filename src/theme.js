((motionUrl) => {
  if (document.querySelector('#storm-wave')) return;

  const root = document.createElement('div');
  root.id = 'storm-wave';
  root.innerHTML = `
    <div class="sw-background"><video muted loop playsinline aria-hidden="true"></video></div>
    <nav class="sw-nav" aria-label="Навигация">
      <a data-page="/search" href="/search" aria-label="Поиск">${nativeIcon('navigationSearch_xs')}</a>
      <a data-page="/" href="/" aria-label="Моя волна">${nativeIcon('navigationMyVibe_xs')}</a>
      <a data-page="/collection" href="/collection" aria-label="Коллекция">${nativeIcon('navigationCollection_xs')}</a>
    </nav>
    <div class="sw-heading">Моя волна</div>
    <div class="sw-lyrics"><div class="sw-line" dir="auto"></div><div class="sw-next" dir="auto"></div></div>
    <button class="sw-settings" type="button" aria-label="Настройки темы" title="Настройки темы"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2"/></svg></button>
    <section class="sw-panel" hidden aria-label="Настройки темы">
      <strong>YaMod</strong>
      <label><input type="checkbox" data-setting="focus"> Только караоке</label>
      <label><input type="checkbox" data-setting="motion"> Движение фона</label>
      <button type="button" data-setting="off">Обычный вид</button>
    </section>`;

  function nativeIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/icons/sprite.svg#${name}"></use></svg>`;
  }

  const video = root.querySelector('video');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  video.muted = true;
  video.addEventListener('playing', () => { video.dataset.ready = 'true'; });
  video.addEventListener('error', () => { delete video.dataset.ready; });

  function updateMotion(active) {
    if (!active || !motion.checked || reducedMotion.matches || document.hidden) {
      video.pause();
      return;
    }
    if (!video.src) video.src = motionUrl;
    if (video.paused && !video.error) video.play().catch(() => {});
  }

  const panel = root.querySelector('.sw-panel');
  const settings = root.querySelector('.sw-settings');
  const current = root.querySelector('.sw-line');
  const next = root.querySelector('.sw-next');
  const focus = root.querySelector('[data-setting="focus"]');
  const motion = root.querySelector('[data-setting="motion"]');
  let enabled = true;
  let trackRequested;
  let loading = false;
  focus.checked = localStorage.getItem('storm-wave-focus') === 'true';
  motion.checked = localStorage.getItem('storm-wave-motion') !== 'false';
  root.dataset.motion = String(motion.checked);

  for (const link of root.querySelectorAll('[data-page]')) {
    link.addEventListener('click', event => {
      const page = link.dataset.page;
      const native = document.querySelector(`[class*="NavbarDesktop_root__"] a[href="${page}"]`);
      if (native) {
        event.preventDefault();
        native.click();
      }
    });
  }

  settings.onclick = () => {
    if (!enabled) {
      enabled = true;
      update();
      return;
    }
    panel.hidden = !panel.hidden;
    settings.setAttribute('aria-expanded', String(!panel.hidden));
  };
  focus.onchange = () => {
    localStorage.setItem('storm-wave-focus', String(focus.checked));
    update();
  };
  motion.onchange = () => {
    localStorage.setItem('storm-wave-motion', String(motion.checked));
    root.dataset.motion = String(motion.checked);
    update();
  };
  root.querySelector('[data-setting="off"]').onclick = () => {
    enabled = false;
    panel.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
    update();
  };
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!panel.hidden) {
      panel.hidden = true;
      settings.setAttribute('aria-expanded', 'false');
    } else if (focus.checked) {
      focus.checked = false;
      focus.onchange();
    }
  });

  function findStore(player) {
    const key = Object.keys(player).find(name => name.startsWith('__reactFiber'));
    for (let fiber = player[key]; fiber; fiber = fiber.return) {
      for (let ctx = fiber.dependencies?.firstContext; ctx; ctx = ctx.next) {
        if (ctx.memoizedValue?.isRootModel) return ctx.memoizedValue;
      }
    }
  }

  function setLine(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function update() {
    const player = document.querySelector('[class*="VibePlayerBar_root__"]');
    const home = location.pathname === '/' && !!player;
    const active = home && enabled;
    root.hidden = !home;
    root.dataset.active = String(active);
    document.body.classList.toggle('storm-wave-active', active);
    document.body.classList.toggle('storm-wave-focus', active && focus.checked);
    updateMotion(active);
    if (!active) return;

    const store = findStore(player);
    const track = store?.sonataState?.entityMeta;
    const meta = player.querySelector('[class*="VibePlayerbarMeta_center__"], [class*="VibePlayerbarTimecodeContent_center__"]');
    const title = track?.title ?? meta?.querySelector('[class*="VibePlayerbarTrackName_trackNameText__"]')?.textContent ?? '';
    if (meta && meta.dataset.stormTitle !== title) meta.dataset.stormTitle = title;
    const lyrics = store?.fullscreenPlayer?.syncLyrics;
    const id = track?.id;
    let line = '';
    let after = '';
    if (id && track.isSyncLyricsAvailable && lyrics) {
      if (lyrics.currentTrackId !== id && trackRequested !== id && !loading && !lyrics.isPending) {
        trackRequested = id;
        loading = true;
        Promise.resolve(lyrics.getData(id)).catch((motionUrl) => {}).finally((motionUrl) => { loading = false; });
      }
      if (lyrics.currentTrackId === id && lyrics.isResolved && lyrics.lines?.length) {
        const slider = player.querySelector('input[class*="VibePlayerbarMeta_slider__"]');
        const position = Number(slider?.value ?? store.sonataState.position ?? 0);
        const index = lyrics.getActiveLineIndex(position);
        if (index !== null && index >= 0) {
          line = lyrics.lines[index]?.text ?? '';
          after = lyrics.lines.slice(index + 1).find(item => item.text)?.text ?? '';
        } else if (position < lyrics.startSec) {
          after = lyrics.lines.find(item => item.text)?.text ?? '';
        }
      }
    }
    setLine(current, line);
    setLine(next, after);
  }

  document.body.append(root);
  update();
  setInterval(update, 180);
})(__STORM_MOTION__);



