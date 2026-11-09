'use strict';

const PHOTOS = Array.from({length: SlotEngine.CARD_COUNT}, (_, i) => `assets/andrey-${String(i + 1).padStart(2, '0')}.jpg`);
const INSULTS = [
  'Витя, где ням-ням?',
  'Саша Тихонова сказала: «Ты не выиграешь».',
  'Слава богу, ты не срёшь 4 раза в день.',
  'Когда выиграешь, из свища анус образуется.',
  'ЕБАТЬ😂😂😂',
  'Это настоящая страшилка перед сном.',
  'Тебе прострелили колени. Оба.',
  'Ого, это настоящий Dryst_god?',
  'Ну ты это, выздоравливай.'
];
const START = SlotEngine.START_BALANCE, BET = SlotEngine.BET;
const $ = id => document.getElementById(id);
const balanceEl = $('balance'), spinsLeftEl = $('spinsLeft'), spinBtn = $('spin'), resetBtn = $('reset');
const msgLabel = $('messageLabel'), msgText = $('messageText'), msgNote = $('messageNote');
const strips = [...document.querySelectorAll('.strip')];
const welcomeOverlay = $('welcomeOverlay'), photoOverlay = $('photoOverlay'), collectionOverlay = $('collectionOverlay');
const roundFailureOverlay = $('roundFailureOverlay');
const overlays = [welcomeOverlay, photoOverlay, collectionOverlay, roundFailureOverlay];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let gameStage = 'slots', transitionToken = 0, battleDefeated = false;
let balance = START, losses = 0, spinning = false;
let lastPhotoButton = null;
const discoveredPhotos = new Set();
let confettiTimer = null;

function nameSwap() {
  const span = document.createElement('span');
  span.className = 'name-swap';
  const oldName = document.createElement('s');
  oldName.textContent = 'Артём';
  oldName.setAttribute('aria-hidden', 'true');
  const newName = document.createElement('ins');
  newName.textContent = 'Андрей';
  span.append(oldName, newName);
  return span;
}

function setMessage(label, message, note = '') {
  msgLabel.textContent = label;
  msgText.textContent = message;
  msgNote.textContent = note;
}

function addressedMessage(label, prefix, suffix, note) {
  setMessage(label, '', note);
  msgText.append(prefix, nameSwap(), suffix);
}

function renderStats() {
  balanceEl.textContent = `${balance.toLocaleString('ru-RU')} ₸`;
  spinsLeftEl.textContent = String(Math.floor(balance / BET));
  $('balanceFill').style.width = `${Math.min(100,balance / START * 100)}%`;
  $('spinsFill').style.width = `${Math.min(100,Math.floor(balance / BET) / (START / BET) * 100)}%`;
}

function tile(index) {
  const el = document.createElement('div');
  el.className = 'tile';
  const img = document.createElement('img');
  img.src = PHOTOS[index];
  img.alt = `Фото Андрея, артефакт ${index + 1}`;
  img.draggable = false;
  img.decoding = 'async';
  el.append(img);
  return el;
}

function showInitial() {
  strips.forEach((strip, i) => {
    strip.style.transform = '';
    strip.removeAttribute('aria-hidden');
    strip.replaceChildren(tile([4, 0, 8][i]));
  });
}

function chooseResult() { return SlotEngine.roll(); }

async function animateReel(strip, endIndex, reelNumber) {
  if (reducedMotion.matches) {
    strip.replaceChildren(tile(endIndex));
    reelStopSound(reelNumber);
    return;
  }
  const startImage = strip.firstElementChild?.querySelector('img');
  const startIndex = PHOTOS.findIndex(path => startImage?.getAttribute('src') === path);
  const steps = (3 + reelNumber) * PHOTOS.length + 2;
  const indices = Array.from({length: steps}, (_, j) => j === 0 ? Math.max(0, startIndex) : (j - 1) % PHOTOS.length);
  indices[steps - 1] = endIndex;
  strip.setAttribute('aria-hidden', 'true');
  strip.replaceChildren(...indices.map(tile));
  // Measure the tile, not its bordered viewport; this avoids a jump at the stop.
  const height = strip.firstElementChild.getBoundingClientRect().height;
  const animation = strip.animate([
    {transform: 'translate3d(0,0,0)'},
    {transform: `translate3d(0,${-(steps - 1) * height}px,0)`}
  ], {duration: 1850 + reelNumber * 350, easing: 'cubic-bezier(.15,.72,.18,1)', fill: 'forwards'});
  await animation.finished;
  strip.replaceChildren(tile(endIndex));
  animation.cancel();
  strip.removeAttribute('aria-hidden');
  reelStopSound(reelNumber);
}

function syncModalState() {
  const modalOpen = gameStage === 'transition' || overlays.some(overlay => !overlay.hidden);
  $('siteContent').inert = modalOpen;
  document.body.classList.toggle('modal-open', modalOpen);
}

function openOverlay(overlay, button) {
  overlay.hidden = false;
  syncModalState();
  button.focus({preventScroll: true});
}

function closeOverlay(overlay) {
  overlay.hidden = true;
  syncModalState();
}

// Keep keyboard focus inside the active dialog.
document.addEventListener('keydown', event => {
  const active = overlays.find(overlay => !overlay.hidden);
  if (!active) return;
  if (event.key === 'Escape' && active === photoOverlay) { closePhoto(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...active.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
    event.preventDefault(); first?.focus();
  }
});

function buildInventory() {
  const cards = PHOTOS.map((src, index) => {
    const found = discoveredPhotos.has(index);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = found ? 'photo-card' : 'photo-card is-locked';
    card.disabled = !found;
    card.setAttribute('aria-label', found ? `Рассмотреть артефакт ${index + 1}: фото Андрея` : `Неизвестный артефакт ${index + 1}. Найди его на барабанах.`);
    let picture;
    if (found) {
      picture = document.createElement('img');
      picture.src = src;
      picture.alt = `Артефакт ${String(index + 1).padStart(2, '0')} из инвентаря Андрея`;
      picture.decoding = 'async';
    } else {
      picture = document.createElement('div');
      picture.className = 'unknown-photo';
      picture.setAttribute('aria-hidden', 'true');
    }
    const label = document.createElement('div');
    label.className = 'photo-card-label';
    const title = document.createElement('span'), icon = document.createElement('span');
    title.textContent = found ? `КАРТОЧКА №${index + 1}` : 'НЕИЗВЕСТНО';
    icon.textContent = found ? '◇' : '?';
    icon.setAttribute('aria-hidden', 'true');
    label.append(title, icon);
    card.append(picture, label);
    card.addEventListener('click', () => {
      if (!discoveredPhotos.has(index) || gameStage !== 'slots') return;
      lastPhotoButton = card;
      $('fullPhoto').src = src;
      $('fullPhoto').alt = picture.alt;
      $('photoCaption').textContent = `Карточка Андрея №${index + 1}`;
      openOverlay(photoOverlay, $('closePhoto'));
    });
    return card;
  });
  $('photoGrid').replaceChildren(...cards);
  $('inventoryCount').textContent = `${discoveredPhotos.size} / ${PHOTOS.length}`;
  $('collectionRemaining').textContent = discoveredPhotos.size === PHOTOS.length ? 'Коллекция собрана!' : `Осталось найти: ${PHOTOS.length-discoveredPhotos.size}`;
}

function unlockPhotos(results) {
  results.forEach(index => discoveredPhotos.add(index));
  buildInventory();
}

function closePhoto() {
  closeOverlay(photoOverlay);
  lastPhotoButton?.focus({preventScroll: true});
}
$('closePhoto').addEventListener('click', closePhoto);
photoOverlay.addEventListener('click', event => { if (event.target === photoOverlay) closePhoto(); });

function confetti() {
  if (reducedMotion.matches) return;
  clearTimeout(confettiTimer);
  const box = $('confetti');
  const colors = ['#dce5df', '#95b4c4', '#bfc9b6', '#dbd0a0'];
  const particles = Array.from({length: 65}, (_, i) => {
    const el = document.createElement('i');
    el.style.setProperty('--left', `${Math.random() * 100}%`);
    el.style.setProperty('--dur', `${3 + Math.random() * 3}s`);
    el.style.setProperty('--delay', `${Math.random() * .7}s`);
    el.style.setProperty('--color', colors[i % colors.length]);
    return el;
  });
  box.replaceChildren(...particles);
  confettiTimer = setTimeout(() => box.replaceChildren(), 7000);
}

let audioCtx = null, masterGain = null, musicGain = null;
let soundEnabled = true, musicTimer = null, musicStep = 0, musicPlaying = false, lastTick = 0;

function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = soundEnabled ? .65 : 0;
      masterGain.connect(audioCtx.destination);
      musicGain = audioCtx.createGain();
      musicGain.gain.value = .65;
      musicGain.connect(masterGain);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch { /* The game remains playable if audio is unavailable. */ }
}

function note(freq, when, duration = .18, type = 'triangle', volume = .065, destination = null) {
  if (!audioCtx || !soundEnabled) return;
  const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(20, freq), when);
  gain.gain.setValueAtTime(.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), when + Math.min(.06, duration / 4));
  gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
  oscillator.connect(gain); gain.connect(destination || masterGain);
  oscillator.start(when); oscillator.stop(when + duration + .02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function noiseHit(when, duration = .06, volume = .09, cutoff = 1800) {
  if (!audioCtx || !soundEnabled) return;
  const n = Math.max(1, Math.round(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, n, audioCtx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
  const source = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
  source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; gain.gain.value = volume;
  source.connect(filter); filter.connect(gain); gain.connect(masterGain); source.start(when);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function playMusicBeat() {
  if (!audioCtx || !soundEnabled || !musicPlaying || document.hidden) return;
  const t = audioCtx.currentTime + .025, step = musicStep++;
  if (gameStage === 'battle') {
    const roots = [110,98,130.81,82.41], root = roots[Math.floor(step/8)%roots.length];
    if(step%8===0){note(root,t,3.1,'triangle',.048,musicGain);note(root*1.5,t+.04,2.8,'sine',.025,musicGain);}
    if(step%2===0){note(root/2,t,.36,'sine',.075,musicGain);noiseHit(t,.12,.018,220);}
    if(step%4===2)noiseHit(t,.06,.014,1600);
    const chant=[220,0,329.63,0,293.66,0,261.63,0][step%8];
    if(chant)note(chant,t,.65,'triangle',.018,musicGain);
    return;
  }
  // Original Nordic-style ambience, synthesized locally; no external soundtrack.
  const roots = [110, 98, 130.81, 82.41];
  const root = roots[Math.floor(step / 8) % roots.length];
  if (step % 8 === 0) {
    note(root, t, 4.3, 'triangle', .043, musicGain);
    note(root * 1.5, t + .05, 3.9, 'sine', .028, musicGain);
    note(root / 2, t, 4.1, 'sine', .05, musicGain);
  }
  const melody = [440, 0, 0, 329.63, 0, 392, 0, 0, 293.66, 0, 0, 329.63, 0, 261.63, 0, 0];
  const pitch = melody[step % melody.length];
  if (pitch) note(pitch, t, 1.35, 'sine', .023, musicGain);
  if (step % 4 === 0) noiseHit(t, .15, .012, 180);
}

function musicAllowed() { return welcomeOverlay.hidden && (gameStage === 'slots' || (gameStage === 'battle' && !battleDefeated)); }
function startMusic() {
  if (!audioCtx || !soundEnabled || musicPlaying || document.hidden || !musicAllowed()) return;
  musicPlaying = true;
  musicGain.gain.setTargetAtTime(.65, audioCtx.currentTime, .15);
  playMusicBeat();
  musicTimer = setInterval(playMusicBeat, gameStage === 'battle' ? 400 : 560);
}
function stopMusic() {
  musicPlaying = false;
  clearInterval(musicTimer); musicTimer = null;
  if (audioCtx && musicGain) musicGain.gain.setTargetAtTime(.0001, audioCtx.currentTime, .08);
}
function clickSound() { if (audioCtx) { const t = audioCtx.currentTime; note(220, t, .08, 'triangle', .06); note(440, t + .03, .11, 'sine', .03); } }
function tickSound() { if (!audioCtx || audioCtx.currentTime - lastTick < .065) return; lastTick = audioCtx.currentTime; noiseHit(lastTick, .025, .018, 1200); }
function reelStopSound(reel) { if (audioCtx) { const t = audioCtx.currentTime; note(140 + reel * 45, t, .16, 'triangle', .09); noiseHit(t, .09, .075, 950); } }
function loseSound() { if (audioCtx) [196, 174.61, 146.83].forEach((f, i) => note(f, audioCtx.currentTime + i * .14, .3, 'triangle', .065)); }
function introSound() { if (audioCtx) [110, 164.81, 220].forEach((f, i) => note(f, audioCtx.currentTime + i * .12, .65, 'triangle', .06)); }
function finaleMusic() { if (audioCtx) [220, 261.63, 329.63, 440, 523.25].forEach((f, i) => note(f, audioCtx.currentTime + i * .22, 1.1, 'triangle', .065)); }
function fartSound() {
  if (!audioCtx || !soundEnabled) return;
  const t = audioCtx.currentTime, oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain(), filter = audioCtx.createBiquadFilter();
  oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(115, t); oscillator.frequency.exponentialRampToValueAtTime(44, t + .95);
  filter.type = 'lowpass'; filter.frequency.value = 290; gain.gain.setValueAtTime(.0001, t);
  for (let k = 0; k < 8; k++) gain.gain.setTargetAtTime(k % 2 ? .075 : .19, t + k * .115, .014);
  gain.gain.setTargetAtTime(.0001, t + .8, .055);
  oscillator.connect(filter); filter.connect(gain); gain.connect(masterGain); oscillator.start(t); oscillator.stop(t + .95);
  noiseHit(t, .85, .08, 190);
  oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
}
function explosionSound() { if (audioCtx) { noiseHit(audioCtx.currentTime, .65, .25, 850); note(55, audioCtx.currentTime, .7, 'sine', .16); } }

function updateSoundButton() {
  document.querySelectorAll('[data-sound-toggle]').forEach(button => {
    button.replaceChildren(document.createTextNode(soundEnabled ? 'ЗВУК: ВКЛ ' : 'ЗВУК: ВЫКЛ '));
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = soundEnabled ? '♪' : '×';
    button.append(icon); button.setAttribute('aria-pressed', String(soundEnabled));
    button.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  });
}
document.querySelectorAll('[data-sound-toggle]').forEach(button => button.addEventListener('click', () => {
  soundEnabled = !soundEnabled; updateSoundButton();
  if (soundEnabled) {
    initAudio();
    if (masterGain) masterGain.gain.setTargetAtTime(.65, audioCtx.currentTime, .02);
    introSound();
    if (musicAllowed()) startMusic();
  } else {
    stopMusic();
    if (masterGain) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, .02);
  }
}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusic();
  else if (soundEnabled && musicAllowed()) startMusic();
});

function clearParty() {
  clearTimeout(confettiTimer); confettiTimer = null;
  $('confetti').replaceChildren();
}

function playBattleSound(event,spellId) {
  if(!soundEnabled)return;
  initAudio();if(!audioCtx)return;
  const t=audioCtx.currentTime;
  if(event==='cast') {
    if(spellId==='heal'){[523.25,659.25,783.99,1046.5].forEach((f,i)=>note(f,t+i*.09,.45,'sine',.055));return;}
    const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();
    oscillator.type='triangle';oscillator.frequency.setValueAtTime(110,t);oscillator.frequency.exponentialRampToValueAtTime(spellId==='burst'?1600:900,t+.3);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.065,t+.06);gain.gain.exponentialRampToValueAtTime(.0001,t+.35);
    oscillator.connect(gain);gain.connect(masterGain);oscillator.start(t);oscillator.stop(t+.38);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    noiseHit(t,.18,.025,2400);return;
  }
  if(event==='impact'||event==='enemy') {
    noiseHit(t,.075,event==='enemy'?.095:.075,6800);
    [860,1470,2217,3160].forEach((f,i)=>note(f,t,.3+i*.045,'sine',.028/(i+1)));
    note(event==='enemy'?75:100,t,.18,'triangle',.09);
    if(spellId==='burst'){noiseHit(t,.45,.13,900);note(55,t,.55,'sine',.15);}
    return;
  }
  if(event==='intro'){[55,82.41,110,164.81].forEach((f,i)=>note(f,t+i*.08,1.7,'triangle',.055));noiseHit(t,.6,.045,400);return;}
  if(event==='boss-defeated'){[110,164.81,220,329.63].forEach((f,i)=>note(f,t+i*.12,1.1,'triangle',.06));return;}
  if(event==='defeat'){[220,196,164.81,110].forEach((f,i)=>note(f,t+i*.18,.55,'triangle',.06));return;}
  if(event==='victory') {
    [130.81,196,261.63,329.63].forEach((f,i)=>note(f,t+i*.04,3,'triangle',.055));
    [523.25,659.25,783.99,1046.5,783.99,1046.5].forEach((f,i)=>note(f,t+.4+i*.22,.7,'sine',.055));
  }
}

function showCollectionComplete() {
  if(gameStage!=='slots'||discoveredPhotos.size!==PHOTOS.length)return;
  gameStage='collection';stopMusic();closeOverlay(photoOverlay);
  const cards=PHOTOS.map((src,index)=>{
    const card=document.createElement('div');
    card.className='collection-complete-card';card.setAttribute('role','group');card.setAttribute('aria-label',`Карточка Андрея №${index+1}`);
    const image=document.createElement('img');image.src=src;image.alt=`Собранная карточка Андрея ${index+1}`;
    const label=document.createElement('strong');label.textContent=`Карточка №${index+1}`;
    card.append(image,label);return card;
  });
  $('collectionCompleteGrid').replaceChildren(...cards);
  openOverlay(collectionOverlay,$('enterBattle'));introSound();
}

async function startBattleEncounter() {
  if(gameStage!=='collection'||discoveredPhotos.size!==PHOTOS.length)return;
  gameStage='transition';stopMusic();
  closeOverlay(collectionOverlay);
  closeOverlay(photoOverlay);
  $('battleTransition').hidden=false;syncModalState();$('battleTransition').focus({preventScroll:true});playBattleSound('intro');
  const token=++transitionToken;
  await new Promise(resolve=>setTimeout(resolve,reducedMotion.matches?250:1900));
  if(token!==transitionToken)return;
  $('slotsScreen').hidden=true;$('battleScreen').hidden=false;$('victoryScreen').hidden=true;$('battleTransition').hidden=true;
  gameStage='battle';battleDefeated=false;musicStep=0;syncModalState();window.scrollTo(0,0);
  BattleUI.start({photos:PHOTOS,reducedMotion:()=>reducedMotion.matches,sound:playBattleSound,onVictory:showVictoryScreen,onDefeat:()=>{battleDefeated=true;stopMusic();},onRetry:()=>{battleDefeated=false;startMusic();}});
}

function showVictoryScreen() {
  gameStage='victory';BattleUI.stop();stopMusic();
  $('battleScreen').hidden=true;$('slotsScreen').hidden=true;$('victoryScreen').hidden=false;
  syncModalState();window.scrollTo(0,0);playBattleSound('victory');$('victoryTitle').focus({preventScroll:true});
}

function showRoundFailure() {
  if (gameStage !== 'slots') return;
  gameStage = 'failed'; stopMusic(); closeOverlay(photoOverlay);
  $('roundFailureCopy').textContent = `Собрано карточек: ${discoveredPhotos.size} / ${PHOTOS.length}.`;
  openOverlay(roundFailureOverlay,$('retrySlots'));
}

async function spin() {
  if (spinning || gameStage !== 'slots' || balance < BET || overlays.some(overlay => !overlay.hidden)) return;
  spinning = true; spinBtn.disabled = true; resetBtn.disabled = true;
  initAudio(); clickSound(); clearParty(); $('reels').classList.remove('is-jackpot');
  const startingBalance = balance;
  balance -= BET; renderStats();
  $('spinText').textContent = 'БАРАБАНЫ КРУТЯТСЯ…';
  addressedMessage('ПОПЫТКА УБЕЖДЕНИЯ', 'Ну давай, ', '…', 'Сложность проверки: легендарная.');
  const results = chooseResult();
  const tickLoop = setInterval(tickSound, 115);
  try {
    await Promise.all(strips.map((strip, i) => animateReel(strip, results[i], i)));
    const outcome = SlotEngine.settleSpin(startingBalance,discoveredPhotos,results);
    balance = outcome.balance;
    if (!outcome.jackpot) losses++;
    unlockPhotos(results); renderStats();
    $('spinText').textContent = `КРУТИТЬ — ${BET} ₸`;
    if (outcome.jackpot) {
      $('reels').classList.add('is-jackpot');
      setMessage('ДЖЕКПОТ · ТРИ В РЯД', `+${outcome.payout.toLocaleString('ru-RU')} ₸`, 'Выплата ×5. Выигрыш зачислен на баланс.');
      confetti(); finaleMusic();
    } else {
      loseSound();
      setMessage(`ПРОИГРЫШ №${losses}`, INSULTS[(losses - 1) % INSULTS.length], `Минус ${BET} ₸. Осталось ${balance} ₸. Ещё разок?`);
    }
    if (outcome.outcome === 'complete') {
      if (!outcome.jackpot) setMessage('КОЛЛЕКЦИЯ СОБРАНА · 10 / 10', 'Все 10 карточек у тебя.');
      $('collectionCopy').textContent = outcome.jackpot ? `Все 10 карточек теперь у тебя. И джекпот — +${outcome.payout.toLocaleString('ru-RU')} ₸!` : 'Все 10 карточек теперь у тебя.';
      $('spinText').textContent = 'КОЛЛЕКЦИЯ СОБРАНА';
      showCollectionComplete();
    } else if (outcome.outcome === 'failed') {
      $('spinText').textContent = 'ПОПЫТКИ ЗАКОНЧИЛИСЬ';
      showRoundFailure();
    }
  } catch (error) {
    balance = startingBalance; renderStats(); showInitial();
    setMessage('СВИТОК ЗАЕЛ', 'Попробуй ещё раз', 'Ставка возвращена. Даже у подделки есть совесть.');
    $('spinText').textContent = `КРУТИТЬ — ${BET} ₸`;
    console.error('Reel animation failed:', error);
  } finally {
    clearInterval(tickLoop); spinning = false; spinBtn.disabled = balance < BET || gameStage !== 'slots'; resetBtn.disabled = gameStage !== 'slots';
  }
}

function reset() {
  if (spinning) return;
  transitionToken++;gameStage='slots';battleDefeated=false;BattleUI.stop();
  stopMusic(); clearParty(); closeOverlay(photoOverlay);closeOverlay(collectionOverlay);closeOverlay(roundFailureOverlay);
  $('reels').classList.remove('is-jackpot');
  $('slotsScreen').hidden=false;$('battleScreen').hidden=true;$('victoryScreen').hidden=true;$('battleTransition').hidden=true;syncModalState();
  balance = START; losses = 0;
  discoveredPhotos.clear(); buildInventory();
  spinBtn.disabled = false; resetBtn.disabled = false;
  $('spinText').textContent = `КРУТИТЬ — ${BET} ₸`;
  renderStats(); showInitial();
  addressedMessage('ЗАДАНИЕ НАЧАТО', 'Ну что, ', ', крутанём?', 'Твои фотки. Твой праздник. ТВОЙ ШАБЛОН.');
}

$('welcomeGo').addEventListener('click', () => {
  initAudio(); closeOverlay(welcomeOverlay); introSound(); startMusic(); spinBtn.focus({preventScroll: true});
});
$('adventureAgain').addEventListener('click', () => { reset(); openOverlay(welcomeOverlay, $('welcomeGo')); window.scrollTo(0,0); });
$('enterBattle').addEventListener('click',startBattleEncounter);
$('retrySlots').addEventListener('click', () => { reset(); startMusic(); spinBtn.focus({preventScroll: true}); });
spinBtn.addEventListener('click', spin);
resetBtn.addEventListener('click', () => { reset(); startMusic(); spinBtn.focus({preventScroll: true}); });

buildInventory(); showInitial(); renderStats(); syncModalState();
$('welcomeGo').focus({preventScroll: true});
