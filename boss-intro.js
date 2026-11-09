(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('battleTransition');
  let active = null;

  function finish(completed) {
    if (!active) return;
    const current = active;
    active = null;
    current.timers.forEach(clearTimeout);
    current.sounds.forEach(stop => stop());
    root.hidden = true;
    root.classList.remove('is-playing','is-arriving','is-revealed','is-departing');
    current.resolve(completed);
  }

  function play({reducedMotion = false, sound} = {}) {
    finish(false);
    root.hidden = false;
    root.classList.toggle('has-reduced-motion',reducedMotion);
    $('entranceAnnounce').textContent = 'Приближается что-то зловещее.';
    if (!$('entranceEmbers').children.length) {
      Array.from({length:20},(_,index) => {
        const ember = document.createElement('i');
        ember.style.setProperty('--i',index);
        ember.style.setProperty('--x',`${(index * 37 + 11) % 100}%`);
        $('entranceEmbers').append(ember);
        return ember;
      });
    }
    void root.offsetWidth;
    root.classList.add('is-playing');
    $('skipBossIntro').focus({preventScroll:true});
    return new Promise(resolve => {
      const current = {resolve,timers:[],sounds:[]};
      active = current;
      const at = (delay,callback) => current.timers.push(setTimeout(() => {
        if (active === current) callback();
      },delay));
      const cue = name => {
        const stop = sound?.(name);
        if (typeof stop === 'function') current.sounds.push(stop);
      };
      if (reducedMotion) {
        root.classList.add('is-arriving','is-revealed');
        $('entranceAnnounce').textContent = 'Продавец говна бросает тебе вызов.';
        at(350,() => finish(true));
        return;
      }
      cue('rumble');
      at(850,() => { root.classList.add('is-arriving'); cue('arrival'); });
      at(3100,() => {
        root.classList.add('is-revealed');
        $('entranceAnnounce').textContent = 'Продавец говна бросает тебе вызов.';
        cue('reveal');
      });
      at(5900,() => root.classList.add('is-departing'));
      at(6600,() => finish(true));
    });
  }

  $('skipBossIntro').addEventListener('click',() => finish(true));
  root.addEventListener('keydown',event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); finish(true); }
    if (event.key === 'Tab') { event.preventDefault(); $('skipBossIntro').focus(); }
  });
  window.BossIntro = {play,stop:() => finish(false)};
})();
