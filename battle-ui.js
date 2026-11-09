(function () {
  'use strict';
  const E = window.BattleEngine, $ = id => document.getElementById(id);
  const ICONS = {
    bowl:'M4 13h24c-1 8-5 12-12 12S5 21 4 13Zm5 15h14M10 3c-5 4 5 4 0 8m7-8c-5 4 5 4 0 8m7-8c-5 4 5 4 0 8',
    knees:'m10 3-2 9 4 5-3 12m13-26-2 9 4 5-3 12M6 16h4m12 0h5',
    burst:'m16 2 3 9 9-5-5 9 7 3-10 3 3 9-7-6-6 6 1-10-9-3 10-3-3-8 7 4Z',
    heal:'M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9Z'
  };
  let options = null, state = null, busy = false, run = 0, logs = [], buttons = [];
  const reduced = () => options?.reducedMotion?.() || false;
  const pause = ms => new Promise(resolve => setTimeout(resolve,reduced() ? Math.min(ms,30) : ms));

  function icon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 32 32'); svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',ICONS[type]); svg.append(path); return svg;
  }
  function setBar(id, textId, value, max) {
    const bar = $(id); bar.style.setProperty('--hp',`${100*value/max}%`);
    bar.setAttribute('aria-valuenow',String(value));
    $(textId).textContent = `${value} / ${max} HP`;
  }
  function addLog(text) {
    logs.push(text); logs = logs.slice(-2);
    $('combatLog').replaceChildren(...logs.map(line => { const p = document.createElement('p'); p.textContent=line; return p; }));
  }
  function render() {
    setBar('bossHealthBar','bossHealthText',state.bossHp,E.BOSS_HP);
    setBar('heroHealthBar','heroHealthText',state.heroHp,E.HERO_HP);
    $('battleTurn').textContent = `ХОД ${state.turn}`;
    $('bossIntent').textContent = state.phase === 'won' ? 'Продавец больше ничего не впарит.' : `Готовит: «${E.bossMove(state).name}»${state.weakened?' · ОСЛАБЛЕН':''}`;
    $('battleScreen').classList.toggle('is-busy',busy);
    $('battleScreen').setAttribute('aria-busy',String(busy));
    buttons.forEach((button,index) => {
      const spell = E.spellForCard(index), left = state.uses[index], spent = left !== null && left <= 0;
      const problem = busy ? 'Дождись окончания хода.' : E.cardProblem(state,index);
      button.classList.toggle('is-spent',spent);
      button.classList.toggle('is-unavailable',Boolean(problem));
      button.setAttribute('aria-disabled',String(Boolean(problem)));
      button.setAttribute('aria-label',`Карточка ${index+1}: ${spell.name}. ${spell.description} ${left === null?'Без ограничений.':`Осталось ${left} применений.`}`);
      button.querySelector('.spell-uses').textContent = left === null ? '∞' : `${left}/${spell.uses}`;
      button.querySelector('.spell-detail-uses').textContent = left === null ? 'Без ограничений' : `Осталось: ${left} / ${spell.uses}`;
      button.querySelector('.spell-hint').textContent = spent ? 'ПОТРАЧЕНО' : spell.heal && state.heroHp === E.HERO_HP ? 'ЗДОРОВЬЕ ПОЛНОЕ' : 'НАЖМИ, ЧТОБЫ ПРИМЕНИТЬ';
    });
  }
  function buildCards() {
    buttons = options.photos.map((src,index) => {
      const spell = E.spellForCard(index), card = document.createElement('button');
      card.type='button'; card.className=`spell-card spell-${spell.color}`; card.dataset.cardIndex=String(index);
      const photo = document.createElement('img'); photo.src=src; photo.alt=`Карточка Андрея ${index+1}`; photo.draggable=false;
      const art=document.createElement('span'); art.className='spell-art'; art.append(photo);
      const badge=document.createElement('span'); badge.className='spell-badge'; badge.append(icon(spell.icon));
      const uses=document.createElement('span'); uses.className='spell-uses'; badge.append(uses);
      const caption=document.createElement('span'); caption.className='spell-caption'; caption.textContent=spell.name;
      const detail=document.createElement('span'); detail.className='spell-detail';
      const name=document.createElement('strong'); name.textContent=spell.name;
      const effect=document.createElement('span'); effect.className='spell-effect'; effect.textContent=spell.heal?`+${spell.heal} здоровья`:`${spell.damage} урона`;
      const note=document.createElement('span'); note.className='spell-note'; note.textContent=spell.heal?'Восстанавливает HP Андрея':spell.icon==='knees'?'Ослабляет ответ босса':spell.icon==='burst'?'Легендарный разъёб':'Обычный магический удар';
      const remaining=document.createElement('span'); remaining.className='spell-detail-uses';
      const hint=document.createElement('span'); hint.className='spell-hint';
      detail.append(name,effect,note,remaining,hint); card.append(art,badge,caption,detail);
      card.addEventListener('click',() => cast(index));
      return card;
    });
    $('battleCards').replaceChildren(...buttons);
  }
  function burstAt(target,color = '#dae9dd',count=18) {
    if (reduced()) return;
    const bounds=target.getBoundingClientRect(), x=bounds.left+bounds.width/2, y=bounds.top+bounds.height/2;
    for(let i=0;i<count;i++) {
      const spark=document.createElement('i'); spark.className='combat-spark';
      spark.style.left=`${x}px`; spark.style.top=`${y}px`; spark.style.background=color;
      const angle=Math.random()*Math.PI*2, distance=35+Math.random()*130;
      document.body.append(spark);
      const animation=spark.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) scale(.1)`,opacity:0}],{duration:400+Math.random()*350,easing:'cubic-bezier(.2,.6,.2,1)'});
      animation.finished.catch(()=>{}).finally(()=>spark.remove());
    }
  }
  function floating(target,text,healing=false) {
    const bounds=target.getBoundingClientRect(), label=document.createElement('div');
    label.className=`combat-float${healing?' healing':''}`; label.textContent=text;
    label.style.left=`${bounds.left+bounds.width/2}px`; label.style.top=`${bounds.top+bounds.height*.35}px`;
    document.body.append(label);
    const animation=label.animate([{transform:'translate(-50%,0)',opacity:1},{transform:'translate(-50%,-65px)',opacity:0}],{duration:reduced()?300:1000,easing:'ease-out'});
    animation.finished.catch(()=>{}).finally(()=>label.remove());
  }
  async function projectile(from,to,spellId) {
    if (reduced()) return;
    const a=from.getBoundingClientRect(), b=to.getBoundingClientRect();
    const orb=document.createElement('i'); orb.className=`combat-orb orb-${spellId}`;
    orb.style.left=`${a.left+a.width/2}px`; orb.style.top=`${a.top+a.height/2}px`;
    document.body.append(orb);
    const animation=orb.animate([{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{offset:.15,opacity:1},{transform:`translate(${b.left+b.width/2-a.left-a.width/2}px,${b.top+b.height/2-a.top-a.height/2}px) scale(1.2)`,opacity:1}],{duration:420,easing:'ease-in'});
    try{await animation.finished;}catch{}finally{orb.remove();}
  }
  function jolt(target,strong=false) {
    if(reduced()) return;
    const d=strong?10:5;
    target.animate([{transform:'translateX(0)'},{transform:`translateX(-${d}px)`},{transform:`translateX(${d}px)`},{transform:'translateX(0)'}],{duration:280,iterations:1});
  }
  async function cast(index) {
    if(!state || busy || state.phase!=='player') return;
    const played=E.playCard(state,index);
    if(!played.ok){addLog(played.reason);return;}
    const currentRun=run, spell=E.spellForCard(index), effect=played.effect;
    busy=true; render(); $('battleStatus').textContent=`АНДРЕЙ · ${spell.name.toUpperCase()}`;
    options.sound?.('cast',effect.spellId);
    const target=effect.healing?$('heroStatus'):$('bossPortrait');
    await projectile(buttons[index],target,effect.spellId);
    if(currentRun!==run) return;
    state=played.state; render();
    burstAt(target,effect.healing?'#acdf9c':effect.spellId==='burst'?'#ffd08a':'#d1e7f4',effect.spellId==='burst'?32:18);
    floating(target,effect.healing?`+${effect.healing} HP`:`−${effect.damage}`,Boolean(effect.healing));
    if(!effect.healing){jolt($('bossPortrait'),effect.spellId==='burst');options.sound?.('impact',effect.spellId);}
    addLog(effect.healing?`Андрей применил «${spell.name}». +${effect.healing} HP.`:`Андрей применил «${spell.name}». −${effect.damage} HP Продавцу.${effect.spellId==='knees'?' Ответный удар ослаблен.':''}`);
    await pause(650);
    if(currentRun!==run) return;
    if(state.phase==='won') {
      $('battleStatus').textContent='ПРОДАВЕЦ ПОВЕРЖЕН'; $('bossPortrait').classList.add('is-defeated');
      addLog('Продавец говна повержен. Тебя ждёт кое-что получше его товара.');
      options.sound?.('boss-defeated');
      await pause(1350);
      if(currentRun===run) options.onVictory?.();
      return;
    }
    $('battleStatus').textContent='ХОД ПРОДАВЦА';
    $('bossIntent').textContent=`Применяет: «${E.bossMove(state).name}»`;
    await pause(650);
    if(currentRun!==run) return;
    const answer=E.resolveBossTurn(state);
    options.sound?.('enemy');
    jolt($('bossPortrait')); await projectile($('bossPortrait'),$('heroStatus'),'enemy');
    if(currentRun!==run) return;
    state=answer.state; render();
    burstAt($('heroStatus'),'#dc9c86',14); jolt($('heroStatus'));
    floating($('heroStatus'),`−${answer.effect.damage}`);
    addLog(`«${answer.effect.move.name}»: −${answer.effect.damage} HP Андрея.${answer.effect.weakened?' Колени подвели Продавца.':''} ${answer.effect.move.line}`);
    await pause(500);
    if(currentRun!==run) return;
    busy=false; render();
    if(state.phase==='lost') {
      $('battleStatus').textContent='АНДРЕЙ ПОВЕРЖЕН'; $('battleDefeat').hidden=false;
      options.onDefeat?.(); options.sound?.('defeat'); $('retryBattle').focus({preventScroll:true});
    } else {
      $('battleStatus').textContent='ВАШ ХОД';
      const focus=E.cardProblem(state,index)?buttons.find((_,i)=>!E.cardProblem(state,i)):buttons[index];
      focus?.focus({preventScroll:true});
    }
  }
  function resetBattle() {
    run++; state=E.createBattle(); busy=false; logs=[];
    $('battleDefeat').hidden=true; $('bossPortrait').classList.remove('is-defeated');
    $('battleStatus').textContent='ВАШ ХОД'; buildCards(); render();
    addLog('Коллекция собрана. Выбери карточку и примени её заклинание.');
    options.onRetry?.(); buttons[0].focus({preventScroll:true});
  }
  window.BattleUI={
    start(config){options=config;$('retryBattle').onclick=resetBattle;resetBattle();},
    stop(){run++;busy=false;document.querySelectorAll('.combat-spark,.combat-float,.combat-orb').forEach(el=>el.remove());}
  };
})();
