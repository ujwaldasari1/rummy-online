// ─── Constants ───────────────────────────────────────────────────────
export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_COLORS = { '♠': '#1a1a2e', '♥': '#c0392b', '♦': '#c0392b', '♣': '#1a1a2e' };
export const SUIT_COLOR_GROUP = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };
export const OPPOSITE_SUITS = { '♠': ['♥', '♦'], '♥': ['♠', '♣'], '♦': ['♠', '♣'], '♣': ['♥', '♦'] };
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_VALUES = { A: 10, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 10, Q: 10, K: 10 };
export const RANK_ORDER = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
export const MAX_PENALTY = 80;
export const DROP_PENALTY = 25;
export const ELIM_SCORE = 201;

// ─── Deck ────────────────────────────────────────────────────────────
export function createDeck() {
  const cards = [];
  let id = 0;
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ id: id++, rank, suit, nat: false });
    cards.push({ id: id++, rank: 'JK', suit: '🃏', nat: true });
  }
  return cards;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(cards) {
  return [...cards].sort((a, b) => {
    if (a.nat !== b.nat) return a.nat ? 1 : -1;
    const sd = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return sd !== 0 ? sd : RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
}

// Sort within a group by face value only (jokers last)
export function sortGroupByValue(cards) {
  return [...cards].sort((a, b) => {
    if (a.nat !== b.nat) return a.nat ? 1 : -1;
    if (a.nat && b.nat) return 0;
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
}

// ─── Joker helpers ───────────────────────────────────────────────────
export function isWild(card, cut) {
  if (!cut || card.nat || cut.nat) return false;
  return card.rank === cut.rank && SUIT_COLOR_GROUP[card.suit] !== SUIT_COLOR_GROUP[cut.suit];
}
export function isJkr(card, cut) { return card.nat || isWild(card, cut); }
export function cardVal(c) { return c.nat ? 0 : (RANK_VALUES[c.rank] || 0); }

// ─── Meld Validation ─────────────────────────────────────────────────
export function isSeq(cards, cut) {
  if (cards.length < 3) return { ok: false, pure: false };
  const jk = cards.filter(c => isJkr(c, cut));
  const nj = cards.filter(c => !isJkr(c, cut));
  if (!nj.length) return { ok: false, pure: false };
  const suits = new Set(nj.map(c => c.suit));
  if (suits.size > 1) return { ok: false, pure: false };
  const sorted = [...nj].sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  let gaps = 0, dup = false;
  for (let i = 1; i < sorted.length; i++) {
    const d = RANK_ORDER[sorted[i].rank] - RANK_ORDER[sorted[i - 1].rank];
    if (d === 0) { dup = true; break; }
    if (d > 1) gaps += d - 1;
  }
  if (!dup && gaps <= jk.length) {
    const mn = RANK_ORDER[sorted[0].rank], mx = RANK_ORDER[sorted[sorted.length - 1].rank];
    if (mx - mn + 1 === nj.length + gaps) return { ok: true, pure: !jk.length };
  }
  if (!dup && nj.some(c => c.rank === 'A')) {
    const hs = [...nj].sort((a, b) =>
      (a.rank === 'A' ? 14 : RANK_ORDER[a.rank]) - (b.rank === 'A' ? 14 : RANK_ORDER[b.rank])
    );
    let hg = 0, hd = false;
    for (let i = 1; i < hs.length; i++) {
      const av = hs[i - 1].rank === 'A' ? 14 : RANK_ORDER[hs[i - 1].rank];
      const bv = hs[i].rank === 'A' ? 14 : RANK_ORDER[hs[i].rank];
      const d = bv - av;
      if (d === 0) { hd = true; break; }
      if (d > 1) hg += d - 1;
    }
    if (!hd && hg <= jk.length) {
      const mn2 = hs[0].rank === 'A' ? 14 : RANK_ORDER[hs[0].rank];
      const mx2 = hs[hs.length - 1].rank === 'A' ? 14 : RANK_ORDER[hs[hs.length - 1].rank];
      if (mx2 - mn2 + 1 === nj.length + hg) return { ok: true, pure: !jk.length };
    }
  }
  return { ok: false, pure: false };
}

export function isSet(cards, cut) {
  if (cards.length < 3 || cards.length > 4) return false;
  const nj = cards.filter(c => !isJkr(c, cut));
  if (!nj.length) return false;
  if (new Set(nj.map(c => c.rank)).size > 1) return false;
  const ss = nj.map(c => c.suit);
  return new Set(ss).size === ss.length;
}

export function validateMeld(cards, cut) {
  const s = isSeq(cards, cut);
  if (s.ok) return { ok: true, type: s.pure ? 'pure' : 'impure' };
  if (isSet(cards, cut)) return { ok: true, type: 'set' };
  return { ok: false, type: null };
}

export function validateShow(groups, cut) {
  const vs = groups.map(g => ({ cards: g, ...validateMeld(g, cut) }));
  const pure = vs.some(v => v.type === 'pure');
  const seq2 = vs.filter(v => v.type === 'pure' || v.type === 'impure').length >= 2;
  return { valid: pure && seq2 && vs.every(v => v.ok), vs, pure, seq2 };
}

export function calcPenalty(groups, cut) {
  const vs = groups.map(g => ({ cards: g, ...validateMeld(g, cut) }));
  const hasPure = vs.some(v => v.type === 'pure');
  if (!hasPure) {
    let total = 0;
    for (const v of vs) total += v.cards.reduce((s, c) => s + cardVal(c), 0);
    return Math.min(total, MAX_PENALTY);
  }
  const seqCount = vs.filter(v => v.type === 'pure' || v.type === 'impure').length;
  const hasSecondSeq = seqCount >= 2;
  let p = 0;
  for (const v of vs) {
    if (v.type === 'pure' || v.type === 'impure') continue;
    if (v.type === 'set' && hasSecondSeq) continue;
    p += v.cards.reduce((s, c) => s + cardVal(c), 0);
  }
  return Math.min(p, MAX_PENALTY);
}

// ─── Dealing ─────────────────────────────────────────────────────────
export function dealNewRound(state, dealerIdx) {
  const deck = shuffle(createDeck());
  let idx = 0;
  const active = state.players.filter(p => !p.eliminated);
  if (active.length <= 1) { state.phase = 'gameOver'; return state; }
  state.players = state.players.map(p => {
    if (p.eliminated) return { ...p, hand: [], groups: [] };
    const h = sortHand(deck.slice(idx, idx + 13));
    idx += 13;
    return { ...p, hand: h, groups: [h.map(c => c.id)] };
  });
  const rem = deck.slice(idx);
  const open = rem.pop();
  state.stockPile = rem;
  state.discardPile = [open];
  state.dealer = dealerIdx;
  state.cutCard = null;
  state.declarer = null;
  state.roundResults = null;
  state.invalidShow = false;
  state.drawn = false;
  state.hasDrawnOnce = [];
  state.packed = [];
  state.discardLog = [];
  state._round = (state._round || 0) + 1;
  const ai = state.players.map((p, i) => p.eliminated ? -1 : i).filter(i => i >= 0);
  const dp = ai.indexOf(dealerIdx);
  const cp = dp <= 0 ? ai.length - 1 : dp - 1;
  state.cutterIdx = ai[cp];
  const fp = (dp + 1) % ai.length;
  state.currentPlayer = ai[fp];
  state.phase = 'cut';
  return state;
}

export function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
export function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
