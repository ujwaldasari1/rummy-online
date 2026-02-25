import { useState, useEffect, useRef } from 'react';
import {
  saveGameState, savePlayerHand, loadPlayerHand, saveFullDeal,
  loadGameState, onGameStateChange, onPlayerHandChange,
  db, ref, set, get, update,
} from './firebase.js';
import {
  SUITS, SUIT_COLORS, SUIT_COLOR_GROUP, OPPOSITE_SUITS, RANKS,
  RANK_VALUES, RANK_ORDER, MAX_PENALTY, ELIM_SCORE, DROP_PENALTY,
  createDeck, shuffle, sortHand, sortGroupByValue, isWild, isJkr, cardVal,
  validateMeld, validateShow, calcPenalty, dealNewRound,
  genCode, genId,
} from './game.js';

// ─── Persistent player ID ────────────────────────────────────────────
function getMyId() {
  let id = null;
  try { id = localStorage.getItem('rummy_pid'); } catch {}
  if (!id) { id = genId(); try { localStorage.setItem('rummy_pid', id); } catch {} }
  return id;
}

// ─── Card Component (bigger) ─────────────────────────────────────────
function Card({ card, selected, onClick, small, faceDown, cutCard, glow, style: sx }) {
  const w = small ? 54 : 68, h = small ? 78 : 98;
  if (faceDown) return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 8,
      background: 'linear-gradient(135deg,#1a3a5c,#0d2137)', border: '2px solid #2a5a8c',
      cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0,
      backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.03) 4px,rgba(255,255,255,0.03) 8px)', ...sx
    }}><span style={{ fontSize: small ? 16 : 22, opacity: 0.4 }}>🂠</span></div>
  );
  const wild = cutCard && isWild(card, cutCard);
  const clr = card.nat ? '#8e44ad' : SUIT_COLORS[card.suit];
  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 8,
      background: selected ? '#fffde7' : wild ? 'linear-gradient(135deg,#fff8e1,#fff3cd)' : '#fff',
      border: '2px solid ' + (selected ? '#f39c12' : wild ? '#e8a85c' : glow ? '#4ade80' : '#ccc'),
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: selected ? '0 0 12px rgba(243,156,18,0.5)' : glow ? '0 0 10px rgba(74,222,128,0.4)' : wild ? '0 0 8px rgba(232,168,92,0.3)' : '0 2px 6px rgba(0,0,0,0.15)',
      transform: selected ? 'translateY(-6px)' : 'none',
      transition: 'all 0.15s', flexShrink: 0, position: 'relative', userSelect: 'none', ...sx
    }}>
      {wild && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, color: '#d4a853', fontWeight: 800 }}>★</span>}
      {card.nat ? <span style={{ fontSize: small ? 22 : 30 }}>🃏</span> : <>
        <span style={{ fontSize: small ? 15 : 19, fontWeight: 800, color: clr, lineHeight: 1, fontFamily: 'Georgia,serif' }}>{card.rank}</span>
        <span style={{ fontSize: small ? 18 : 24, color: clr, lineHeight: 1 }}>{card.suit}</span>
      </>}
    </div>
  );
}

// ─── Wild Badge ──────────────────────────────────────────────────────
function WildBadge({ cut }) {
  if (!cut) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
      background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.25)',
      borderRadius: 8, fontSize: 11, color: '#e8d5b7', flexWrap: 'wrap', justifyContent: 'center'
    }}>
      <span style={{ fontWeight: 700, color: '#d4a853' }}>CUT:</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: cut.nat ? '#8e44ad' : SUIT_COLORS[cut.suit] }}>
        {cut.nat ? '🃏' : cut.rank + cut.suit}
      </span>
      <span style={{ color: '#a0b0c0' }}>→</span>
      {cut.nat
        ? <span style={{ color: '#a0b0c0' }}>No extra wilds</span>
        : <span style={{ fontWeight: 800 }}>
            {OPPOSITE_SUITS[cut.suit].map(s =>
              <span key={s} style={{ color: SUIT_COLORS[s], marginRight: 3 }}>{cut.rank}{s}★</span>
            )}
            <span style={{ color: '#a0b0c0', marginLeft: 2 }}>wild</span>
          </span>
      }
    </div>
  );
}

// ─── Watermark ───────────────────────────────────────────────────────
function Watermark() {
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) rotate(-18deg)',
      fontSize: 52, fontWeight: 900, letterSpacing: 10, fontFamily: "'Georgia',serif",
      color: 'rgba(255,255,255,0.025)', pointerEvents: 'none', zIndex: 0,
      whiteSpace: 'nowrap', userSelect: 'none',
      textShadow: '0 0 60px rgba(212,168,83,0.03)',
    }}>CHALARAGERS</div>
  );
}

// ─── Discard Log Panel ───────────────────────────────────────────────
function DiscardLog({ log, cutCard }) {
  const [open, setOpen] = useState(false);
  if (!log || !log.length) return null;
  const recent = log.slice(-30).reverse();
  return (
    <div style={{ position: 'relative', zIndex: 10 }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(212,168,83,0.3)',
        background: open ? 'rgba(212,168,83,0.15)' : 'rgba(0,0,0,0.3)',
        color: '#d4a853', fontSize: 10, cursor: 'pointer', fontFamily: "'Georgia',serif",
        fontWeight: 600, letterSpacing: 1,
      }}>
        📋 LOG {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 260, maxHeight: 220, overflowY: 'auto',
          background: 'rgba(10,22,40,0.96)', border: '1px solid rgba(212,168,83,0.2)',
          borderRadius: 10, padding: 8, zIndex: 20,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}>
          <div style={{ color: '#8899aa', fontSize: 9, letterSpacing: 1, marginBottom: 6, textAlign: 'center' }}>DISCARD LOG</div>
          {recent.map((e, i) => {
            const cardLabel = e.card?.nat ? '🃏' : (e.card?.rank || '?') + (e.card?.suit || '');
            const cardColor = e.card?.nat ? '#8e44ad' : SUIT_COLORS[e.card?.suit] || '#999';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px',
                borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11,
              }}>
                <span style={{ color: e.action === 'picked' ? '#4ade80' : '#e8a85c', fontWeight: 700, fontSize: 9, width: 46, flexShrink: 0 }}>
                  {e.action === 'picked' ? '⬆ PICK' : '⬇ TOSS'}
                </span>
                <span style={{ color: '#b0c4d8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.player}</span>
                <span style={{
                  fontWeight: 800, fontSize: 12, color: cardColor,
                  background: 'rgba(255,255,255,0.9)', padding: '1px 5px', borderRadius: 4, fontFamily: 'Georgia,serif'
                }}>{cardLabel}</span>
              </div>
            );
          })}
          {!recent.length && <div style={{ color: '#556', fontSize: 11, textAlign: 'center', padding: 12 }}>No activity yet</div>}
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('home');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [myName, setMyName] = useState('');
  const [myId] = useState(() => getMyId());
  const [gs, setGs] = useState(null);
  const [hand, setHand] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const unsubRef = useRef(null);
  const handUnsubRef = useRef(null);
  const codeRef = useRef('');

  // Drag state
  const [dragCard, setDragCard] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState(null);
  const isDragging = useRef(false);
  const dragTimeout = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const groupRefs = useRef([]);
  const cardRefs = useRef({});

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
      if (handUnsubRef.current) handUnsubRef.current();
    };
  }, []);

  function subscribeToGame(code) {
    if (unsubRef.current) unsubRef.current();
    codeRef.current = code;
    unsubRef.current = onGameStateChange(code, (state) => { setGs(state); });
  }

  function subscribeToHand(code, pid) {
    if (handUnsubRef.current) handUnsubRef.current();
    handUnsubRef.current = onPlayerHandChange(code, pid, (data) => {
      if (data && data.hand) {
        setHand(data.hand);
        setGroups(data.groups || [data.hand.map(c => c.id)]);
      }
    });
  }

  // ── Create Room ──
  async function createRoom() {
    if (!myName.trim()) { setErr('Enter your name'); return; }
    setLoading(true); setErr('');
    try {
      const code = genCode();
      const state = {
        phase: 'lobby',
        players: [{ id: myId, name: myName.trim(), score: 0, eliminated: false }],
        dealer: 0, currentPlayer: 0, stockPile: [], discardPile: [],
        cutCard: null, cutterIdx: null, round: 1, declarer: null,
        roundResults: null, invalidShow: false, drawn: false,
        _round: 0, _ts: Date.now(),
      };
      await saveGameState(code, state);
      setRoomCode(code);
      subscribeToGame(code);
      setGs(state);
      setScreen('lobby');
    } catch (e) { setErr('Failed to create room: ' + e.message); }
    setLoading(false);
  }

  // ── Join Room (supports late join) ──
  async function joinRoom() {
    if (!myName.trim()) { setErr('Enter your name'); return; }
    if (!joinCode.trim()) { setErr('Enter room code'); return; }
    setLoading(true); setErr('');
    try {
      const code = joinCode.trim().toUpperCase();
      const state = await loadGameState(code);
      if (!state) { setErr('Room not found!'); setLoading(false); return; }

      // Reconnecting player
      const existingPlayer = state.players?.find(p => p.id === myId);
      if (existingPlayer) {
        setRoomCode(code);
        subscribeToGame(code);
        subscribeToHand(code, myId);
        setGs(state);
        setScreen(state.phase === 'lobby' ? 'lobby' : 'game');
        setLoading(false);
        return;
      }

      // Late join — spectator until next round
      if (state.phase !== 'lobby') {
        if ((state.players?.length || 0) >= 8) { setErr('Room is full!'); setLoading(false); return; }
        state.players.push({ id: myId, name: myName.trim(), score: 0, eliminated: false, spectator: true });
        await saveGameState(code, state);
        setRoomCode(code);
        subscribeToGame(code);
        subscribeToHand(code, myId);
        setGs(state);
        setScreen('game');
        setLoading(false);
        return;
      }

      if ((state.players?.length || 0) >= 8) { setErr('Room is full!'); setLoading(false); return; }
      if (!state.players.some(p => p.id === myId)) {
        state.players.push({ id: myId, name: myName.trim(), score: 0, eliminated: false });
        await saveGameState(code, state);
      }
      setRoomCode(code);
      subscribeToGame(code);
      setGs(state);
      setScreen('lobby');
    } catch (e) { setErr('Failed to join: ' + e.message); }
    setLoading(false);
  }

  // ── Start Game ──
  async function startGame() {
    if (!gs || gs.players.length < 2) { setErr('Need at least 2 players'); return; }
    const state = { ...gs, players: gs.players.map(p => ({ ...p })) };
    dealNewRound(state, 0);
    await saveFullDeal(roomCode, state);
    subscribeToHand(roomCode, myId);
  }

  // ── Perform Cut ──
  async function performCut() {
    setLoading(true);
    try {
      const state = await loadGameState(roomCode);
      if (!state || state.phase !== 'cut') { setLoading(false); return; }
      const ri = Math.floor(Math.random() * state.stockPile.length);
      const card = state.stockPile[ri];
      state.stockPile.splice(ri, 1);
      state.cutCard = card;
      state.phase = 'play';
      state._ts = Date.now();
      await saveGameState(roomCode, state);
    } catch (e) { setErr('Error: ' + e.message); }
    setLoading(false);
  }

  // ── Draw from Stock ──
  async function drawFromStock() {
    try {
      const state = await loadGameState(roomCode);
      if (!state) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx || state.drawn) return;
      let card;
      if (!state.stockPile || state.stockPile.length === 0) {
        const ns = shuffle(state.discardPile.slice(0, -1));
        state.discardPile = [state.discardPile[state.discardPile.length - 1]];
        card = ns.pop();
        state.stockPile = ns;
      } else {
        card = state.stockPile.pop();
      }
      state.drawn = true;
      if (!state.hasDrawnOnce) state.hasDrawnOnce = [];
      if (!state.hasDrawnOnce.includes(myId)) state.hasDrawnOnce.push(myId);
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      // Add card to GROUP 1 (first group)
      const myHand = await loadPlayerHand(roomCode, myId);
      const newHand = [...(myHand?.hand || hand), card];
      const newGroups = [...(myHand?.groups || groups)];
      if (newGroups.length > 0) {
        newGroups[0] = [card.id, ...newGroups[0]];
      } else {
        newGroups.push([card.id]);
      }
      await savePlayerHand(roomCode, myId, newHand, newGroups);
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Draw from Discard ──
  async function drawFromDiscard() {
    try {
      const state = await loadGameState(roomCode);
      if (!state || !state.discardPile?.length) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx || state.drawn) return;
      const card = state.discardPile.pop();

      // Log the pickup
      if (!state.discardLog) state.discardLog = [];
      state.discardLog.push({ player: state.players[myIdx].name, card, action: 'picked' });

      state.drawn = true;
      if (!state.hasDrawnOnce) state.hasDrawnOnce = [];
      if (!state.hasDrawnOnce.includes(myId)) state.hasDrawnOnce.push(myId);
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      // Add card to GROUP 1
      const myHand = await loadPlayerHand(roomCode, myId);
      const newHand = [...(myHand?.hand || hand), card];
      const newGroups = [...(myHand?.groups || groups)];
      if (newGroups.length > 0) {
        newGroups[0] = [card.id, ...newGroups[0]];
      } else {
        newGroups.push([card.id]);
      }
      await savePlayerHand(roomCode, myId, newHand, newGroups);
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Drop / Pack ──
  async function dropPack() {
    try {
      const state = await loadGameState(roomCode);
      if (!state || state.drawn) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx) return;
      if ((state.hasDrawnOnce || []).includes(myId)) {
        setErr("Can't pack after drawing!"); return;
      }
      const newScore = state.players[myIdx].score + DROP_PENALTY;
      state.players[myIdx].score = newScore;
      state.players[myIdx].eliminated = newScore >= ELIM_SCORE;
      if (!state.packed) state.packed = [];
      state.packed.push(myId);

      const ai = state.players.map((p, i) => (!p.eliminated ? i : -1)).filter(i => i >= 0);
      const playing = ai.filter(i => !(state.packed || []).includes(state.players[i].id));

      if (playing.length <= 1) {
        const winnerId = playing.length === 1 ? playing[0] : null;
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated && !(state.packed || []).includes(p.id)) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (winnerId !== null && i === winnerId) return { name: p.name, penalty: 0, newScore: p.score, elim: false, wasElim: false, winner: true };
          if ((state.packed || []).includes(p.id)) return { name: p.name, penalty: DROP_PENALTY, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true };
          return { name: p.name, penalty: 0, newScore: p.score, elim: false, wasElim: false };
        });
        state.declarer = winnerId;
        state.phase = 'roundEnd';
        state.invalidShow = false;
      } else {
        const ci = ai.indexOf(myIdx);
        let next = ci;
        do { next = (next + 1) % ai.length; }
        while ((state.packed || []).includes(state.players[ai[next]].id) || state.players[ai[next]].eliminated);
        state.currentPlayer = ai[next];
      }
      state.drawn = false;
      state._ts = Date.now();
      await saveGameState(roomCode, state);
      setErr('');
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Discard (select 1, tap DISCARD) ──
  async function discardSelected() {
    if (sel.size !== 1) { setErr('Select exactly 1 card to discard'); return; }
    const cardId = [...sel][0];
    try {
      const state = await loadGameState(roomCode);
      if (!state || !state.drawn) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx) return;
      const card = hand.find(c => c.id === cardId);
      if (!card) return;

      if (!state.discardPile) state.discardPile = [];
      state.discardPile.push(card);

      // Log the discard
      if (!state.discardLog) state.discardLog = [];
      state.discardLog.push({ player: state.players[myIdx].name, card, action: 'threw' });

      const ai = state.players.map((p, i) => p.eliminated ? -1 : i).filter(i => i >= 0);
      const playing = ai.filter(i => !(state.packed || []).includes(state.players[i].id));
      const ci = playing.indexOf(myIdx);
      state.currentPlayer = playing[(ci + 1) % playing.length];
      state.drawn = false;
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      const newHand = hand.filter(c => c.id !== cardId);
      const newGroups = groups.map(g => g.filter(id => id !== cardId)).filter(g => g.length);
      await savePlayerHand(roomCode, myId, newHand, newGroups);
      setSel(new Set());
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Declare Show ──
  async function declareShow() {
    if (sel.size !== 1) { setErr('Select exactly 1 card to discard, then SHOW!'); return; }
    try {
      const state = await loadGameState(roomCode);
      if (!state || !state.drawn) { setErr('Draw a card first!'); return; }
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx) return;
      if (hand.length !== 14) { setErr('Need 14 cards!'); return; }

      const discId = [...sel][0];
      const discC = hand.find(c => c.id === discId);
      const remHand = hand.filter(c => c.id !== discId);
      const remGroups = groups.map(g => g.filter(id => id !== discId)).filter(g => g.length);
      const meldGroups = remGroups.map(g => g.map(id => remHand.find(c => c.id === id)).filter(Boolean));
      const result = validateShow(meldGroups, state.cutCard);

      if (!state.discardPile) state.discardPile = [];
      state.discardPile.push(discC);

      if (result.valid) {
        const penaltyPromises = state.players.map(async (p, i) => {
          if (p.eliminated || i === myIdx) return { penalty: 0 };
          if ((state.packed || []).includes(p.id)) return { penalty: 0, packed: true };
          const ph = await loadPlayerHand(roomCode, p.id);
          if (!ph || !ph.hand) return { penalty: MAX_PENALTY };
          const pg = (ph.groups || [ph.hand.map(c => c.id)]).map(g =>
            g.map(id => ph.hand.find(c => c.id === id)).filter(Boolean)
          );
          return { penalty: calcPenalty(pg, state.cutCard) };
        });
        const penalties = await Promise.all(penaltyPromises);
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (i === myIdx) return { name: p.name, penalty: 0, elim: false, wasElim: false, winner: true, newScore: p.score };
          if ((state.packed || []).includes(p.id)) return { name: p.name, penalty: DROP_PENALTY, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true };
          const pen = penalties[i].penalty;
          const ns = p.score + pen;
          return { name: p.name, penalty: pen, newScore: ns, elim: false, wasElim: ns >= ELIM_SCORE };
        });
        state.players = state.players.map((p, i) => {
          if (p.eliminated || i === myIdx) return p;
          if ((state.packed || []).includes(p.id)) return p;
          const r = state.roundResults[i];
          return { ...p, score: r.newScore, eliminated: r.wasElim };
        });
        state.invalidShow = false;
      } else {
        const ns = state.players[myIdx].score + MAX_PENALTY;
        const elim = ns >= ELIM_SCORE;
        state.players[myIdx].score = ns;
        state.players[myIdx].eliminated = elim;
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated && i !== myIdx) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (i === myIdx) return { name: p.name, penalty: MAX_PENALTY, newScore: ns, elim: false, wasElim: elim, inv: true };
          if ((state.packed || []).includes(p.id)) return { name: p.name, penalty: DROP_PENALTY, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true };
          return { name: p.name, penalty: 0, newScore: p.score, elim: false, wasElim: false };
        });
        state.invalidShow = true;
      }
      state.declarer = myIdx;
      state.phase = 'roundEnd';
      state.drawn = false;
      state._ts = Date.now();
      await saveGameState(roomCode, state);
      await savePlayerHand(roomCode, myId, remHand, remGroups);
      setSel(new Set());
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Next Round (clears spectator flag) ──
  async function nextRound() {
    try {
      const state = await loadGameState(roomCode);
      if (!state) return;
      // Promote spectators to active players for new round
      state.players = state.players.map(p => ({ ...p, spectator: false }));
      const active = state.players.filter(p => !p.eliminated);
      if (active.length <= 1) {
        state.phase = 'gameOver';
        state._ts = Date.now();
        await saveGameState(roomCode, state);
        return;
      }
      const ai = state.players.map((p, i) => p.eliminated ? -1 : i).filter(i => i >= 0);
      const di = ai.indexOf(state.dealer);
      const nd = ai[(di + 1) % ai.length];
      state.round = (state.round || 1) + 1;
      dealNewRound(state, nd);
      await saveFullDeal(roomCode, state);
      setHand([]); setGroups([]);
    } catch (e) { setErr('Error: ' + e.message); }
  }

  // ── Local grouping ──
  function toggleSel(cid) {
    setSel(prev => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  }
  function makeGroup() {
    if (sel.size < 2) return;
    const ids = [...sel];
    const ng = groups.map(g => g.filter(id => !sel.has(id))).filter(g => g.length);
    ng.push(ids);
    setGroups(ng);
    setSel(new Set());
    savePlayerHand(roomCode, myId, hand, ng);
  }

  // Ungroup: if cards selected → move to group 1, else ungroup all
  function ungroupAction() {
    if (sel.size > 0) {
      // Move selected cards to group 1 (index 0)
      const ids = [...sel];
      let ng = groups.map(g => g.filter(id => !sel.has(id)));
      if (ng.length > 0) {
        ng[0] = [...ids, ...ng[0]];
      } else {
        ng = [ids];
      }
      ng = ng.filter(g => g.length);
      setGroups(ng);
      setSel(new Set());
      savePlayerHand(roomCode, myId, hand, ng);
    } else {
      const ng = [hand.map(c => c.id)];
      setGroups(ng);
      setSel(new Set());
      savePlayerHand(roomCode, myId, hand, ng);
    }
  }

  function moveToGroup(gi) {
    if (!sel.size) return;
    const ids = [...sel];
    const ng = groups.map((g, i) => {
      const f = g.filter(id => !sel.has(id));
      return i === gi ? [...f, ...ids] : f;
    }).filter(g => g.length);
    setGroups(ng);
    setSel(new Set());
    savePlayerHand(roomCode, myId, hand, ng);
  }

  // Sort within each group by face value
  function sortInGroups() {
    const ng = groups.map(gids => {
      const cards = gids.map(id => hand.find(c => c.id === id)).filter(Boolean);
      const sorted = sortGroupByValue(cards);
      return sorted.map(c => c.id);
    });
    setGroups(ng);
    setSel(new Set());
    savePlayerHand(roomCode, myId, hand, ng);
  }

  function getGCards(gids) { return gids.map(id => hand.find(c => c.id === id)).filter(Boolean); }

  // ── Drag and Drop ──
  function findDropTarget(x, y) {
    for (let gi = 0; gi < groupRefs.current.length; gi++) {
      const groupEl = groupRefs.current[gi];
      if (!groupEl) continue;
      const rect = groupEl.getBoundingClientRect();
      if (y >= rect.top - 10 && y <= rect.bottom + 10 && x >= rect.left - 10 && x <= rect.right + 10) {
        const gids = groups[gi] || [];
        let pos = gids.length;
        for (let ci = 0; ci < gids.length; ci++) {
          const cardEl = cardRefs.current[gids[ci]];
          if (!cardEl) continue;
          const cr = cardEl.getBoundingClientRect();
          if (x < cr.left + cr.width / 2) { pos = ci; break; }
        }
        return { groupIdx: gi, position: pos };
      }
    }
    const lastGroup = groupRefs.current[groupRefs.current.length - 1];
    if (lastGroup) {
      const lr = lastGroup.getBoundingClientRect();
      if (y > lr.bottom) return { groupIdx: -1, position: 0 };
    }
    return null;
  }

  function handleDragStart(e, cardId, groupIdx, cardIdx) {
    const touch = e.touches ? e.touches[0] : e;
    startPos.current = { x: touch.clientX, y: touch.clientY };
    dragTimeout.current = setTimeout(() => {
      isDragging.current = true;
      setDragCard({ id: cardId, groupIdx, cardIdx });
      setDragPos({ x: touch.clientX, y: touch.clientY });
      document.body.classList.add('is-dragging');
      if (navigator.vibrate) navigator.vibrate(30);
    }, 200);
  }

  function handleDragMove(e) {
    if (!isDragging.current) {
      const touch = e.touches ? e.touches[0] : e;
      const dx = Math.abs(touch.clientX - startPos.current.x);
      const dy = Math.abs(touch.clientY - startPos.current.y);
      if (dx > 10 || dy > 10) clearTimeout(dragTimeout.current);
      return;
    }
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    setDragPos({ x: touch.clientX, y: touch.clientY });
    setDropTarget(findDropTarget(touch.clientX, touch.clientY));
  }

  function handleDragEnd() {
    clearTimeout(dragTimeout.current);
    document.body.classList.remove('is-dragging');
    if (!isDragging.current || !dragCard) {
      isDragging.current = false; setDragCard(null); setDropTarget(null); return;
    }
    if (dropTarget && dragCard) {
      const { id, groupIdx: srcGi } = dragCard;
      const { groupIdx: tgtGi, position: tgtPos } = dropTarget;
      let ng = groups.map(g => [...g]);
      if (tgtGi === -1) {
        ng = ng.map(g => g.filter(cid => cid !== id));
        ng.push([id]);
      } else if (tgtGi === srcGi) {
        const g = ng[srcGi].filter(cid => cid !== id);
        g.splice(Math.min(tgtPos, g.length), 0, id);
        ng[srcGi] = g;
      } else {
        ng = ng.map(g => g.filter(cid => cid !== id));
        const insertAt = Math.min(tgtPos, ng[tgtGi]?.length || 0);
        if (ng[tgtGi]) ng[tgtGi].splice(insertAt, 0, id);
      }
      ng = ng.filter(g => g.length > 0);
      setGroups(ng);
      savePlayerHand(roomCode, myId, hand, ng);
    }
    isDragging.current = false; setDragCard(null); setDropTarget(null);
  }

  // ── Derived ──
  const myIdx = gs?.players?.findIndex(p => p.id === myId) ?? -1;
  const isHost = myIdx === 0;
  const isMyTurn = gs?.currentPlayer === myIdx;
  const isCutter = gs?.cutterIdx === myIdx;
  const cut = gs?.cutCard;
  const drawn = gs?.drawn;

  useEffect(() => {
    if (gs && gs.phase !== 'lobby' && roomCode && myId) subscribeToHand(roomCode, myId);
  }, [gs?.phase, roomCode, myId]);

  useEffect(() => {
    if (screen === 'lobby' && gs?.phase && gs.phase !== 'lobby') setScreen('game');
  }, [gs?.phase, screen]);

  // ── Styles ──
  const darkBg = 'linear-gradient(145deg,#0a1628,#132743,#0d1f36)';
  const greenBg = 'linear-gradient(145deg,#0b3d20,#145a30,#0b3d20)';
  const font = "'Georgia','Times New Roman',serif";
  const goldBtn = {
    width: '100%', padding: 14, borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg,#d4a853,#b8862d)', color: '#1a1a2e',
    fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 2, fontFamily: font,
    boxShadow: '0 4px 20px rgba(212,168,83,0.3)',
  };
  const outBtn = {
    padding: '12px 36px', borderRadius: 10, border: '1px solid #d4a853',
    background: 'rgba(212,168,83,0.12)', color: '#d4a853',
    fontSize: 15, cursor: 'pointer', letterSpacing: 2, fontFamily: font, fontWeight: 600,
  };
  const box = {
    background: 'rgba(255,255,255,0.04)', borderRadius: 20, maxWidth: 480, width: '100%',
    border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  };
  const cBase = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: font,
  };

  // ════════════════════════════ RENDER ════════════════════════════

  // HOME
  if (screen === 'home') {
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{ ...box, padding: '40px 32px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: 3, color: '#d4a853', fontWeight: 700 }}>♠ ♥ ♦ ♣</span>
          </div>
          <h1 style={{ color: '#e8d5b7', textAlign: 'center', margin: '0 0 2px', fontSize: 28, fontWeight: 400, letterSpacing: 4 }}>CHALARAGERS</h1>
          <p style={{ color: '#8899aa', textAlign: 'center', margin: '0 0 4px', fontSize: 11, letterSpacing: 1 }}>ONLINE MULTIPLAYER · INDIAN RUMMY</p>
          <p style={{ color: '#556', textAlign: 'center', margin: '0 0 24px', fontSize: 10, letterSpacing: 1 }}>Up to 8 players · 2 decks · 201 elimination</p>

          {err && <p style={{ color: '#e74c3c', fontSize: 12, textAlign: 'center', margin: '0 0 12px' }}>{err}</p>}

          <label style={{ color: '#b0c4d8', fontSize: 12, letterSpacing: 1 }}>YOUR NAME</label>
          <input value={myName} onChange={e => { setMyName(e.target.value); setErr(''); }}
            placeholder="Enter your name" style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#e0e0e0', fontSize: 14, fontFamily: font,
              outline: 'none', marginTop: 6, marginBottom: 20, boxSizing: 'border-box',
            }} />

          <button onClick={createRoom} disabled={loading} style={{ ...goldBtn, marginBottom: 12, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'CREATING...' : 'CREATE ROOM'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ color: '#667', fontSize: 12, letterSpacing: 2 }}>OR JOIN</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setErr(''); }}
              placeholder="CODE" maxLength={5} style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: '#e0e0e0', fontSize: 16, fontFamily: font,
                outline: 'none', letterSpacing: 4, textAlign: 'center', textTransform: 'uppercase',
              }} />
            <button onClick={joinRoom} disabled={loading} style={outBtn}>{loading ? '...' : 'JOIN'}</button>
          </div>
        </div>
      </div>
    );
  }

  // LOBBY
  if (screen === 'lobby' || (screen === 'game' && gs?.phase === 'lobby')) {
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{ ...box, padding: '36px 32px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, color: '#8899aa', letterSpacing: 1, marginBottom: 6 }}>ROOM CODE</div>
          <div style={{ fontSize: 36, color: '#d4a853', fontWeight: 700, letterSpacing: 8, marginBottom: 4 }}>{roomCode}</div>
          <p style={{ color: '#667', fontSize: 12, marginBottom: 24 }}>Share this code with your friends</p>

          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            <div style={{ color: '#b0c4d8', fontSize: 12, letterSpacing: 1, marginBottom: 8 }}>PLAYERS ({gs?.players?.length || 0}/8)</div>
            {gs?.players?.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: p.id === myId ? 'rgba(212,168,83,0.08)' : 'transparent',
                borderRadius: 8, marginBottom: 4,
                border: p.id === myId ? '1px solid rgba(212,168,83,0.15)' : '1px solid transparent',
              }}>
                <span style={{ fontSize: 18 }}>{i === 0 ? '👑' : '🎮'}</span>
                <span style={{ color: p.id === myId ? '#d4a853' : '#b0c4d8', fontSize: 14 }}>
                  {p.name} {p.id === myId ? '(you)' : ''}
                </span>
              </div>
            ))}
          </div>

          {err && <p style={{ color: '#e74c3c', fontSize: 12, margin: '0 0 12px' }}>{err}</p>}

          {isHost ? (
            <button onClick={startGame} style={{ ...goldBtn, opacity: (gs?.players?.length || 0) < 2 ? 0.5 : 1 }}
              disabled={(gs?.players?.length || 0) < 2}>
              START GAME ({gs?.players?.length || 0} players)
            </button>
          ) : (
            <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#8899aa', fontSize: 13 }}>
              Waiting for host to start... ⏳
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!gs) {
    return <div style={{ ...cBase, background: darkBg }}><div style={{ color: '#8899aa', fontSize: 14 }}>Loading... ⏳</div></div>;
  }

  // CUT JOKER
  if (gs.phase === 'cut') {
    const cutterName = gs.players[gs.cutterIdx]?.name || '?';
    const dealerName = gs.players[gs.dealer]?.name || '?';
    const meObj = gs.players[myIdx];
    const amSpectator = meObj?.spectator;

    return (
      <div style={{ ...cBase, background: 'linear-gradient(145deg,#0a1628,#1a2a48,#0d1f36)' }}>
        <Watermark />
        <div style={{ ...box, padding: '36px 28px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, color: '#8899aa', letterSpacing: 1, marginBottom: 4 }}>ROUND {gs.round}</div>
          <h2 style={{ color: '#e8d5b7', fontSize: 22, fontWeight: 400, margin: '0 0 6px', letterSpacing: 2 }}>✂️ CUT THE JOKER</h2>
          <p style={{ color: '#8899aa', fontSize: 12, margin: '0 0 6px' }}>Dealer: <span style={{ color: '#d4a853' }}>{dealerName}</span></p>
          <p style={{ color: '#a0b0c0', fontSize: 13, margin: '0 0 24px' }}>
            {amSpectator ? 'Watching — you\'ll play next round!' : isCutter ? "Your turn to cut!" : cutterName + " is cutting..."}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative', height: 100 }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 'calc(50% + ' + ((i - 3) * 20) + 'px - 29px)',
                transform: 'rotate(' + ((i - 3) * 6) + 'deg)', transformOrigin: 'bottom center',
              }}><Card card={{}} faceDown /></div>
            ))}
          </div>

          {amSpectator ? (
            <div style={{ color: '#8e6a3a', fontSize: 13, padding: 12, background: 'rgba(142,106,58,0.1)', borderRadius: 8, border: '1px solid rgba(142,106,58,0.2)' }}>
              👀 Spectating · You'll join next round
            </div>
          ) : isCutter ? (
            <button onClick={performCut} disabled={loading} style={{ ...outBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'CUTTING...' : 'CUT CARD'}
            </button>
          ) : (
            <div style={{ color: '#667', fontSize: 13, animation: 'pulse 2s infinite' }}>Waiting for {cutterName}... ⏳</div>
          )}
        </div>
      </div>
    );
  }

  // PLAY
  if (gs.phase === 'play') {
    const me = gs.players[myIdx];
    const amIPacked = (gs.packed || []).includes(myId);
    const amSpectator = me?.spectator;

    // Spectator view (late join or eliminated or packed)
    if (amSpectator || amIPacked || !me || me.eliminated) {
      const label = amSpectator ? '👀 SPECTATING' : amIPacked ? '🏳️ PACKED' : '💀 ELIMINATED';
      const subtitle = amSpectator ? "You'll play next round!" : amIPacked ? `+${DROP_PENALTY} pts · Watching` : 'Watching...';
      return (
        <div style={{ ...cBase, background: darkBg }}>
          <Watermark />
          <div style={{ ...box, padding: 36, textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{amSpectator ? '👀' : amIPacked ? '🏳️' : '💀'}</div>
            <h2 style={{ color: amIPacked ? '#e8a85c' : '#e74c3c', fontSize: 20, fontWeight: 400, letterSpacing: 2 }}>{label}</h2>
            <p style={{ color: '#8899aa', fontSize: 13, marginTop: 8 }}>{subtitle} · Round {gs.round}</p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}><WildBadge cut={cut} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
              <DiscardLog log={gs.discardLog} cutCard={cut} />
            </div>
            <div style={{ marginTop: 8 }}>
              {gs.players.filter(p => !p.eliminated && !p.spectator).map(p => {
                const isPacked = (gs.packed || []).includes(p.id);
                const isCur = p.id === gs.players[gs.currentPlayer]?.id;
                return (
                  <div key={p.id} style={{ color: isPacked ? '#8e6a3a' : isCur ? '#4ade80' : '#b0c4d8', fontSize: 13, lineHeight: 2 }}>
                    {isCur ? '▶ ' : '  '}{p.name}: {p.score}{isPacked ? ' 🏳️' : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    const topDisc = gs.discardPile?.length ? gs.discardPile[gs.discardPile.length - 1] : null;
    const curName = gs.players[gs.currentPlayer]?.name || '?';

    return (
      <div style={{ minHeight: '100vh', background: greenBg, fontFamily: font, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Watermark />

        {/* Top Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexWrap: 'wrap', gap: 4, position: 'relative', zIndex: 2,
        }}>
          <div>
            <span style={{ color: '#e8d5b7', fontSize: 14, fontWeight: 600 }}>{me.name}</span>
            <span style={{ color: '#8a9a6a', fontSize: 11, marginLeft: 8 }}>Score: {me.score}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DiscardLog log={gs.discardLog} cutCard={cut} />
            <span style={{ color: '#8a9a6a', fontSize: 11 }}>R{gs.round} · {hand.length} cards · {roomCode}</span>
          </div>
        </div>

        {/* Wild + Turn */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 12px', gap: 6, position: 'relative', zIndex: 1 }}>
          <WildBadge cut={cut} />
          <div style={{
            padding: '6px 16px', borderRadius: 20,
            background: isMyTurn ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
            border: '1px solid ' + (isMyTurn ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)'),
            color: isMyTurn ? '#4ade80' : '#8899aa', fontSize: 13, fontWeight: 600,
          }}>
            {isMyTurn ? '🎯 YOUR TURN' : '⏳ ' + curName + "'s turn"}
          </div>
        </div>

        {/* Mini scores */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 12px', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          {gs.players.filter(p => !p.eliminated && !p.spectator).map(p => {
            const isPacked = (gs.packed || []).includes(p.id);
            const isCurrent = p.id === gs.players[gs.currentPlayer]?.id;
            return (
              <span key={p.id} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: isCurrent ? 'rgba(74,222,128,0.1)' : isPacked ? 'rgba(142,106,58,0.15)' : 'rgba(0,0,0,0.2)',
                color: isCurrent ? '#4ade80' : isPacked ? '#8e6a3a' : '#7a9a6a',
                border: '1px solid ' + (isCurrent ? 'rgba(74,222,128,0.2)' : 'transparent'),
                textDecoration: isPacked ? 'line-through' : 'none',
              }}>{p.name}: {p.score}{isPacked ? ' 🏳️' : ''}</span>
            );
          })}
        </div>

        {/* Piles */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, padding: '8px 16px 4px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#7a9a6a', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>STOCK ({gs.stockPile?.length || 0})</div>
            <Card card={{}} faceDown onClick={isMyTurn && !drawn ? drawFromStock : undefined}
              style={{ cursor: isMyTurn && !drawn ? 'pointer' : 'default', opacity: !isMyTurn || drawn ? 0.4 : 1 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#7a9a6a', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>DISCARD</div>
            {topDisc ? (
              <Card card={topDisc} cutCard={cut} onClick={isMyTurn && !drawn ? drawFromDiscard : undefined}
                style={{ cursor: isMyTurn && !drawn ? 'pointer' : 'default', opacity: !isMyTurn || drawn ? 0.4 : 1 }} />
            ) : (
              <div style={{ width: 68, height: 98, borderRadius: 8, border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#557755', fontSize: 11 }}>Empty</div>
            )}
          </div>
        </div>

        {/* Draw prompt + Pack */}
        {isMyTurn && !drawn && (() => {
          const canPack = !(gs.hasDrawnOnce || []).includes(myId);
          return (
            <div style={{ textAlign: 'center', padding: '4px 0', position: 'relative', zIndex: 1 }}>
              <p style={{ color: '#a0c890', fontSize: 12, margin: '2px 0' }}>↑ Tap a pile to draw ↑</p>
              {canPack && (
                <button onClick={dropPack} style={{
                  marginTop: 6, padding: '8px 24px', borderRadius: 8,
                  border: '1px solid rgba(231,76,60,0.4)', background: 'rgba(231,76,60,0.12)',
                  color: '#e74c3c', fontSize: 12, cursor: 'pointer', fontFamily: font,
                  fontWeight: 600, letterSpacing: 1,
                }}>🏳️ PACK (+{DROP_PENALTY} pts)</button>
              )}
            </div>
          );
        })()}

        {/* Hand */}
        <div style={{ flex: 1, padding: '6px 10px', overflowY: 'auto', paddingBottom: 150, position: 'relative', zIndex: 1 }}
          onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
          onMouseMove={handleDragMove} onMouseUp={handleDragEnd}>
          {groups.map((gids, gi) => {
            const cards = getGCards(gids);
            const m = cards.length >= 3 ? validateMeld(cards, cut) : { ok: false };
            const isDropHere = dropTarget && dropTarget.groupIdx === gi;
            return (
              <div key={gi} ref={el => groupRefs.current[gi] = el}
                style={{
                  marginBottom: 10, padding: '6px 6px 8px', borderRadius: 10,
                  background: isDropHere ? 'rgba(74,222,128,0.08)' : 'transparent',
                  border: '1.5px dashed ' + (isDropHere ? 'rgba(74,222,128,0.4)' : 'transparent'),
                  transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ color: m.ok ? '#4ade80' : '#7a9a6a', fontSize: 10, letterSpacing: 1, fontWeight: 600 }}>
                    {m.ok ? (m.type === 'pure' ? '✓ PURE SEQ' : m.type === 'impure' ? '✓ SEQUENCE' : '✓ SET') : 'GROUP ' + (gi + 1)}
                  </span>
                  {sel.size > 0 && (
                    <button onClick={() => moveToGroup(gi)} style={{
                      padding: '1px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.06)', color: '#b0c4d8', fontSize: 9, cursor: 'pointer', fontFamily: font,
                    }}>+ here</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 44 }}>
                  {cards.map((card, ci) => {
                    const beingDragged = dragCard && dragCard.id === card.id;
                    const showInsertBefore = isDropHere && dropTarget.position === ci;
                    return (
                      <div key={card.id} style={{ display: 'flex', alignItems: 'center' }}>
                        {showInsertBefore && (
                          <div style={{
                            width: 4, height: 64, borderRadius: 2,
                            background: '#4ade80', marginRight: 2, flexShrink: 0,
                            boxShadow: '0 0 8px rgba(74,222,128,0.5)',
                          }} />
                        )}
                        <div ref={el => cardRefs.current[card.id] = el}
                          style={{ position: 'relative', opacity: beingDragged ? 0.3 : 1, transition: 'opacity 0.1s' }}
                          onTouchStart={e => handleDragStart(e, card.id, gi, ci)}
                          onMouseDown={e => handleDragStart(e, card.id, gi, ci)}
                        >
                          <Card card={card} cutCard={cut} selected={sel.has(card.id)}
                            onClick={() => { if (!isDragging.current) toggleSel(card.id); }} small />
                        </div>
                      </div>
                    );
                  })}
                  {isDropHere && dropTarget.position >= cards.length && (
                    <div style={{
                      width: 4, height: 64, borderRadius: 2,
                      background: '#4ade80', marginLeft: 2, flexShrink: 0,
                      boxShadow: '0 0 8px rgba(74,222,128,0.5)',
                    }} />
                  )}
                </div>
              </div>
            );
          })}
          {dragCard && (
            <div style={{
              marginTop: 4, padding: '12px', borderRadius: 10,
              border: '1.5px dashed ' + (dropTarget && dropTarget.groupIdx === -1 ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.1)'),
              background: dropTarget && dropTarget.groupIdx === -1 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)',
              textAlign: 'center', color: dropTarget && dropTarget.groupIdx === -1 ? '#4ade80' : '#556655',
              fontSize: 11, transition: 'all 0.15s',
            }}>+ Drop here for new group</div>
          )}
        </div>

        {/* Ghost drag card */}
        {dragCard && (() => {
          const card = hand.find(c => c.id === dragCard.id);
          if (!card) return null;
          return (
            <div style={{
              position: 'fixed', left: dragPos.x - 27, top: dragPos.y - 39,
              zIndex: 9999, pointerEvents: 'none',
              transform: 'scale(1.15) rotate(-3deg)',
              filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))',
            }}><Card card={card} cutCard={cut} small glow /></div>
          );
        })()}

        {/* Actions */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top,rgba(0,0,0,0.92) 60%,transparent)', padding: '20px 14px 16px',
          zIndex: 10,
        }}>
          {err && <p style={{ color: '#e74c3c', fontSize: 11, textAlign: 'center', margin: '0 0 6px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {sel.size >= 2 && <button onClick={makeGroup} style={abtn('#2980b9')}>Group ({sel.size})</button>}
            {sel.size > 0 && <button onClick={() => setSel(new Set())} style={abtn('#7f8c8d')}>Deselect</button>}
            <button onClick={sortInGroups} style={abtn('#2c6e49')}>Sort</button>
            <button onClick={ungroupAction} style={abtn('#8e6a3a')}>
              {sel.size > 0 ? 'To G1 (' + sel.size + ')' : 'Ungroup'}
            </button>
            {isMyTurn && drawn && sel.size === 1 && (
              <button onClick={discardSelected} style={{
                ...abtn('#c0392b'), background: 'linear-gradient(135deg,#c0392b,#922b21)',
              }}>🗑 DISCARD</button>
            )}
            {isMyTurn && drawn && sel.size === 1 && hand.length === 14 && (
              <button onClick={declareShow} style={{ ...abtn('#d4a853'), background: 'linear-gradient(135deg,#d4a853,#b8862d)', color: '#1a1a2e' }}>
                🏆 SHOW
              </button>
            )}
          </div>
          <p style={{ color: '#7a9a6a', fontSize: 10, textAlign: 'center', margin: '6px 0 0' }}>
            {isMyTurn && drawn
              ? 'Select 1 card → DISCARD or SHOW'
              : 'Hold & drag to rearrange · Tap to select'}
          </p>
        </div>
      </div>
    );
  }

  // ROUND END
  if (gs.phase === 'roundEnd') {
    const active = gs.players.filter(p => !p.eliminated);
    const decName = gs.players[gs.declarer]?.name || '?';
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{ ...box, padding: '28px 24px', position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#e8d5b7', textAlign: 'center', margin: '0 0 4px', fontSize: 22, fontWeight: 400, letterSpacing: 2 }}>
            {gs.invalidShow ? '❌ INVALID SHOW' : '🏆 ROUND COMPLETE'}
          </h2>
          <p style={{ color: '#8899aa', textAlign: 'center', margin: '0 0 12px', fontSize: 12 }}>
            {gs.invalidShow ? decName + ' invalid show! (+80)' : decName + ' wins!'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><WildBadge cut={cut} /></div>

          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '6px 14px',
              background: 'rgba(255,255,255,0.04)', color: '#8899aa', fontSize: 10, letterSpacing: 1,
            }}>
              <span>PLAYER</span><span style={{ textAlign: 'right' }}>PEN</span><span style={{ textAlign: 'right' }}>TOTAL</span>
            </div>
            {gs.roundResults?.map((r, i) => {
              if (gs.players[i]?.eliminated && !r.wasElim) return null;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '8px 14px',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: r.wasElim ? 'rgba(192,57,43,0.1)' : r.winner ? 'rgba(46,204,113,0.08)' : 'transparent',
                }}>
                  <span style={{ color: r.winner ? '#4ade80' : r.wasElim ? '#e74c3c' : '#b0c4d8', fontSize: 13 }}>
                    {r.winner ? '👑 ' : ''}{r.name}{r.wasElim ? ' 💀' : r.packed ? ' 🏳️' : ''}
                  </span>
                  <span style={{ textAlign: 'right', color: r.penalty ? '#e8a85c' : '#4ade80', fontSize: 13, fontWeight: 700 }}>
                    {r.penalty ? '+' + r.penalty : '0'}
                  </span>
                  <span style={{ textAlign: 'right', color: '#b0c4d8', fontSize: 13, fontWeight: 700 }}>
                    {r.newScore !== undefined ? r.newScore : gs.players[i]?.score}
                  </span>
                </div>
              );
            })}
          </div>

          {gs.roundResults?.some(r => r.wasElim) && (
            <div style={{
              marginTop: 12, padding: 10, borderRadius: 8,
              background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)',
              color: '#e74c3c', fontSize: 12, textAlign: 'center',
            }}>
              {gs.roundResults.filter(r => r.wasElim).map(r => r.name).join(', ')} eliminated!
            </div>
          )}

          {isHost ? (
            <button onClick={nextRound} style={{ ...goldBtn, marginTop: 20 }}>
              {active.length <= 2 ? 'SEE RESULTS' : 'NEXT ROUND'}
            </button>
          ) : (
            <div style={{ marginTop: 20, color: '#667', fontSize: 13, textAlign: 'center' }}>Waiting for host... ⏳</div>
          )}
        </div>
      </div>
    );
  }

  // GAME OVER
  if (gs.phase === 'gameOver') {
    const active = gs.players.filter(p => !p.eliminated);
    const winner = active.length === 1 ? active[0] : gs.players.reduce((a, b) => a.score < b.score ? a : b);
    const sorted = [...gs.players].sort((a, b) => a.score - b.score);
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{ ...box, padding: '36px 24px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>👑</div>
          <h2 style={{ color: '#d4a853', fontSize: 26, fontWeight: 400, margin: '0 0 4px', letterSpacing: 2 }}>{winner.name} WINS!</h2>
          <p style={{ color: '#556', fontSize: 10, letterSpacing: 1, margin: '2px 0 4px' }}>CHALARAGERS</p>
          <p style={{ color: '#8899aa', fontSize: 12, margin: '0 0 28px' }}>After {gs.round} rounds</p>
          <div style={{ textAlign: 'left', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            {sorted.map((p, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '9px 14px',
                borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none',
                color: p.eliminated ? '#555' : i === 0 ? '#d4a853' : '#b0c4d8',
              }}>
                <span style={{ fontSize: 13 }}>{i === 0 ? '👑 ' : (i + 1) + '. '}{p.name}{p.eliminated ? ' 💀' : ''}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{p.score}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setScreen('home'); setGs(null); setHand([]); setGroups([]); }}
            style={{ ...goldBtn, marginTop: 20 }}>NEW GAME</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cBase, background: darkBg }}>
      <div style={{ color: '#8899aa', fontSize: 14, animation: 'pulse 2s infinite' }}>Loading game... ⏳</div>
    </div>
  );
}

function abtn(bg) {
  return {
    padding: '9px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff',
    fontSize: 12, cursor: 'pointer', fontFamily: "Georgia,serif", letterSpacing: 1,
    fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  };
}
