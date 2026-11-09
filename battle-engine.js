(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.BattleEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HERO_HP = 100, BOSS_HP = 200;
  const SPELLS = Object.freeze({
    bite: Object.freeze({name:'Ням-ням', damage:18, uses:null, color:'gold', icon:'bowl', description:'Наносит 18 урона. Можно применять сколько угодно.'}),
    knees: Object.freeze({name:'Оба колена', damage:30, uses:1, color:'ice', icon:'knees', description:'Наносит 30 урона. Следующий удар босса вдвое слабее.'}),
    burst: Object.freeze({name:'ЕБАТЬ😂😂😂', damage:45, uses:1, color:'amber', icon:'burst', description:'Наносит 45 урона. Один мощный удар от этой карточки.'}),
    heal: Object.freeze({name:'Выздоравливай', heal:40, uses:2, color:'green', icon:'heal', description:'Восстанавливает до 40 HP Андрея. Занимает один ход.'})
  });
  const CARD_SPELLS = Object.freeze(['bite','heal','burst','bite','knees','bite','heal','burst','knees','bite']);
  const BOSS_MOVES = Object.freeze([
    Object.freeze({name:'Впарить товар', min:22, max:28, line:'Продавец уверяет: «Качество легендарное». Врёт.'}),
    Object.freeze({name:'Сомнительная сделка', min:24, max:30, line:'Мелкий шрифт в договоре оказался заклинанием.'}),
    Object.freeze({name:'Сделать трезвое лицо', min:20, max:26, line:'Лицо трезвое. Намерения — нет.'})
  ]);
  function spellForCard(index) { return SPELLS[CARD_SPELLS[index]] || null; }
  function createBattle() {
    return {heroHp:HERO_HP, bossHp:BOSS_HP, turn:1, phase:'player', weakened:false, uses:CARD_SPELLS.map(id => SPELLS[id].uses)};
  }
  function bossMove(state) { return BOSS_MOVES[(Math.max(1,state.turn)-1) % BOSS_MOVES.length]; }
  function cardProblem(state, index) {
    if (state.phase !== 'player') return 'Дождись своего хода.';
    if (!Number.isInteger(index) || !spellForCard(index)) return 'Такой карточки нет.';
    if (state.uses[index] !== null && state.uses[index] <= 0) return 'У этой карточки закончились применения.';
    if (spellForCard(index).heal && state.heroHp >= HERO_HP) return 'У Андрея уже полное здоровье.';
    return '';
  }
  function playCard(state, index) {
    const problem = cardProblem(state,index);
    if (problem) return {ok:false, reason:problem, state};
    const spellId = CARD_SPELLS[index], spell = SPELLS[spellId];
    const next = {...state, uses:state.uses.slice()};
    if (next.uses[index] !== null) next.uses[index]--;
    const effect = {cardIndex:index, spellId, damage:0, healing:0};
    if (spell.heal) {
      next.heroHp = Math.min(HERO_HP,state.heroHp + spell.heal);
      effect.healing = next.heroHp - state.heroHp;
    } else {
      next.bossHp = Math.max(0,state.bossHp - spell.damage);
      effect.damage = state.bossHp - next.bossHp;
      if (spellId === 'knees') next.weakened = true;
    }
    next.phase = next.bossHp === 0 ? 'won' : 'boss';
    return {ok:true, state:next, effect};
  }
  function resolveBossTurn(state, rng = Math.random) {
    if (state.phase !== 'boss') return {ok:false, reason:'Сейчас не ход босса.', state};
    const move = bossMove(state), sample = Number(rng());
    const random = Number.isFinite(sample) ? Math.min(.999999,Math.max(0,sample)) : 0;
    const rawDamage = move.min + Math.floor(random * (move.max - move.min + 1));
    const damage = state.weakened ? Math.ceil(rawDamage / 2) : rawDamage;
    const heroHp = Math.max(0,state.heroHp - damage);
    const next = {...state, heroHp, weakened:false, turn:state.turn + 1, phase:heroHp === 0 ? 'lost' : 'player', uses:state.uses.slice()};
    return {ok:true, state:next, effect:{move, damage:state.heroHp-heroHp, weakened:state.weakened}};
  }
  return Object.freeze({HERO_HP,BOSS_HP,SPELLS,CARD_SPELLS,BOSS_MOVES,createBattle,spellForCard,bossMove,cardProblem,playCard,resolveBossTurn});
});
