(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.SlotEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CARD_COUNT = 10, START_BALANCE = 8000, BET = 800, JACKPOT_MULTIPLIER = 5, JACKPOT_CHANCE = .12;

  function roll(rng = Math.random) {
    const random = () => {
      const sample = Number(rng());
      return Number.isFinite(sample) ? Math.min(.999999999,Math.max(0,sample)) : 0;
    };
    const jackpot = random() < JACKPOT_CHANCE;
    const first = Math.floor(random() * CARD_COUNT);
    if (jackpot) return [first,first,first];
    const second = Math.floor(random() * CARD_COUNT);
    const third = first === second
      ? (first + 1 + Math.floor(random() * (CARD_COUNT - 1))) % CARD_COUNT
      : Math.floor(random() * CARD_COUNT);
    return [first,second,third];
  }

  function settleSpin(balance, discovered, result) {
    if (!Number.isFinite(balance) || balance < BET) throw new RangeError('Not enough balance to spin.');
    if (!Array.isArray(result) || result.length !== 3 || result.some(index => !Number.isInteger(index) || index < 0 || index >= CARD_COUNT)) throw new RangeError('Invalid reel result.');
    const found = new Set(discovered);
    result.forEach(index => found.add(index));
    const jackpot = result.every(index => index === result[0]);
    const payout = jackpot ? BET * JACKPOT_MULTIPLIER : 0;
    const nextBalance = balance - BET + payout;
    return {
      balance:nextBalance, discovered:[...found], jackpot, payout,
      outcome:found.size === CARD_COUNT ? 'complete' : nextBalance < BET ? 'failed' : 'collecting'
    };
  }

  return Object.freeze({CARD_COUNT,START_BALANCE,BET,JACKPOT_MULTIPLIER,JACKPOT_CHANCE,roll,settleSpin});
});
