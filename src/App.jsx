import { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveGameState, savePlayerHand, loadPlayerHand, saveFullDeal,
  loadGameState, onGameStateChange, onPlayerHandChange,
  db, ref, set, get, update,
} from './firebase.js';
import {
  SUITS, SUIT_COLORS, SUIT_COLOR_GROUP, OPPOSITE_SUITS, RANKS,
  RANK_VALUES, RANK_ORDER, MAX_PENALTY, ELIM_SCORE,
  createDeck, shuffle, sortHand, isWild, isJkr, cardVal,
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

// ─── Card Component ──────────────────────────────────────────────────
function Card({ card, selected, onClick, small, faceDown, cutCard, glow, style: sx }) {
  const w = small ? 44 : 58, h = small ? 64 : 84;
  if (faceDown) return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 8,
      background: 'linear-gradient(135deg,#1a3a5c,#0d2137)', border: '2px solid #2a5a8c',
      cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0,
      backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.03) 4px,rgba(255,255,255,0.03) 8px)', ...sx
    }}><span style={{ fontSize: small ? 14 : 20, opacity: 0.4 }}>🂠</span></div>
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
      {wild && <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 7, color: '#d4a853', fontWeight: 800 }}>★</span>}
      {card.nat ? <span style={{ fontSize: small ? 18 : 26 }}>🃏</span> : <>
        <span style={{ fontSize: small ? 10 : 13, fontWeight: 800, color: clr, lineHeight: 1, fontFamily: 'Georgia,serif' }}>{card.rank}</span>
        <span style={{ fontSize: small ? 13 : 18, color: clr, lineHeight: 1 }}>{card.suit}</span>
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

  // Drag and drop state
  const [dragCard, setDragCard] = useState(null); // { id, groupIdx, cardIdx }
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTarget, setDropTarget] = useState(null); // { groupIdx, position }
  const isDragging = useRef(false);
  const dragTimeout = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const groupRefs = useRef([]);
  const cardRefs = useRef({});

  // Clean up listeners
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
      if (handUnsubRef.current) handUnsubRef.current();
    };
  }, []);

  // Subscribe to game state changes
  function subscribeToGame(code) {
    if (unsubRef.current) unsubRef.current();
    codeRef.current = code;
    unsubRef.current = onGameStateChange(code, (state) => {
      setGs(state);
    });
  }

  // Subscribe to my hand changes
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
    setLoading(true);
    setErr('');
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
    } catch (e) {
      setErr('Failed to create room: ' + e.message);
    }
    setLoading(false);
  }

  // ── Join Room ──
  async function joinRoom() {
    if (!myName.trim()) { setErr('Enter your name'); return; }
    if (!joinCode.trim()) { setErr('Enter room code'); return; }
    setLoading(true);
    setErr('');
    try {
      const code = joinCode.trim().toUpperCase();
      const state = await loadGameState(code);
      if (!state) { setErr('Room not found!'); setLoading(false); return; }
      if (state.phase !== 'lobby') {
        // Check if player is reconnecting
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
        setErr('Game already started!');
        setLoading(false);
        return;
      }
      if ((state.players?.length || 0) >= 8) { setErr('Room is full!'); setLoading(false); return; }

      // Add player if not already in
      if (!state.players.some(p => p.id === myId)) {
        state.players.push({ id: myId, name: myName.trim(), score: 0, eliminated: false });
        await saveGameState(code, state);
      }
      setRoomCode(code);
      subscribeToGame(code);
      setGs(state);
      setScreen('lobby');
    } catch (e) {
      setErr('Failed to join: ' + e.message);
    }
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
    } catch (e) {
      setErr('Error: ' + e.message);
    }
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
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      // Update my hand locally + in Firebase
      const myHand = await loadPlayerHand(roomCode, myId);
      const newHand = [...(myHand?.hand || hand), card];
      const newGroups = [...(myHand?.groups || groups)];
      if (newGroups.length > 0) {
        newGroups[newGroups.length - 1] = [...newGroups[newGroups.length - 1], card.id];
      } else {
        newGroups.push([card.id]);
      }
      await savePlayerHand(roomCode, myId, newHand, newGroups);
    } catch (e) {
      setErr('Error: ' + e.message);
    }
  }

  // ── Draw from Discard ──
  async function drawFromDiscard() {
    try {
      const state = await loadGameState(roomCode);
      if (!state || !state.discardPile?.length) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx || state.drawn) return;

      const card = state.discardPile.pop();
      state.drawn = true;
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      const myHand = await loadPlayerHand(roomCode, myId);
      const newHand = [...(myHand?.hand || hand), card];
      const newGroups = [...(myHand?.groups || groups)];
      if (newGroups.length > 0) {
        newGroups[newGroups.length - 1] = [...newGroups[newGroups.length - 1], card.id];
      } else {
        newGroups.push([card.id]);
      }
      await savePlayerHand(roomCode, myId, newHand, newGroups);
    } catch (e) {
      setErr('Error: ' + e.message);
    }
  }

  // ── Discard ──
  async function discardCard(cardId) {
    try {
      const state = await loadGameState(roomCode);
      if (!state || !state.drawn) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx) return;

      const card = hand.find(c => c.id === cardId);
      if (!card) return;

      if (!state.discardPile) state.discardPile = [];
      state.discardPile.push(card);

      // Next active player
      const ai = state.players.map((p, i) => p.eliminated ? -1 : i).filter(i => i >= 0);
      const ci = ai.indexOf(myIdx);
      state.currentPlayer = ai[(ci + 1) % ai.length];
      state.drawn = false;
      state._ts = Date.now();
      await saveGameState(roomCode, state);

      // Update my hand
      const newHand = hand.filter(c => c.id !== cardId);
      const newGroups = groups.map(g => g.filter(id => id !== cardId)).filter(g => g.length);
      await savePlayerHand(roomCode, myId, newHand, newGroups);
      setSel(new Set());
    } catch (e) {
      setErr('Error: ' + e.message);
    }
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
        // Calculate penalties for all other players
        const penaltyPromises = state.players.map(async (p, i) => {
          if (p.eliminated || i === myIdx) return { penalty: 0 };
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
          const pen = penalties[i].penalty;
          const ns = p.score + pen;
          return { name: p.name, penalty: pen, newScore: ns, elim: false, wasElim: ns >= ELIM_SCORE };
        });

        // Update scores
        state.players = state.players.map((p, i) => {
          if (p.eliminated || i === myIdx) return p;
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
    } catch (e) {
      setErr('Error: ' + e.message);
    }
  }

  // ── Next Round ──
  async function nextRound() {
    try {
      const state = await loadGameState(roomCode);
      if (!state) return;
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
      setHand([]);
      setGroups([]);
    } catch (e) {
      setErr('Error: ' + e.message);
    }
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
  function ungroupAll() {
    const ng = [hand.map(c => c.id)];
    setGroups(ng);
    setSel(new Set());
    savePlayerHand(roomCode, myId, hand, ng);
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
  function getGCards(gids) { return gids.map(id => hand.find(c => c.id === id)).filter(Boolean); }

  // ── Drag and Drop ──
  function findDropTarget(x, y) {
    for (let gi = 0; gi < groupRefs.current.length; gi++) {
      const groupEl = groupRefs.current[gi];
      if (!groupEl) continue;
      const rect = groupEl.getBoundingClientRect();
      // Expand hit area vertically
      if (y >= rect.top - 10 && y <= rect.bottom + 10 && x >= rect.left - 10 && x <= rect.right + 10) {
        // Find position within group
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
    // Check if below all groups → new group
    const lastGroup = groupRefs.current[groupRefs.current.length - 1];
    if (lastGroup) {
      const lr = lastGroup.getBoundingClientRect();
      if (y > lr.bottom) return { groupIdx: -1, position: 0 }; // new group
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
    }, 200); // 200ms hold to start drag
  }

  function handleDragMove(e) {
    if (!isDragging.current) {
      // Cancel drag if moved too far before timeout
      const touch = e.touches ? e.touches[0] : e;
      const dx = Math.abs(touch.clientX - startPos.current.x);
      const dy = Math.abs(touch.clientY - startPos.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(dragTimeout.current);
      }
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
      isDragging.current = false;
      setDragCard(null);
      setDropTarget(null);
      return;
    }

    if (dropTarget && dragCard) {
      const { id, groupIdx: srcGi } = dragCard;
      const { groupIdx: tgtGi, position: tgtPos } = dropTarget;

      let ng = groups.map(g => [...g]);

      if (tgtGi === -1) {
        // Drop to new group
        ng = ng.map(g => g.filter(cid => cid !== id));
        ng.push([id]);
      } else if (tgtGi === srcGi) {
        // Reorder within same group
        const g = ng[srcGi].filter(cid => cid !== id);
        const insertAt = Math.min(tgtPos, g.length);
        g.splice(insertAt, 0, id);
        ng[srcGi] = g;
      } else {
        // Move to different group
        ng = ng.map(g => g.filter(cid => cid !== id));
        const insertAt = Math.min(tgtPos, ng[tgtGi]?.length || 0);
        if (ng[tgtGi]) {
          ng[tgtGi].splice(insertAt, 0, id);
        }
      }

      ng = ng.filter(g => g.length > 0);
      setGroups(ng);
      savePlayerHand(roomCode, myId, hand, ng);
    }

    isDragging.current = false;
    setDragCard(null);
    setDropTarget(null);
  }

  // ── Derived ──
  const myIdx = gs?.players?.findIndex(p => p.id === myId) ?? -1;
  const isHost = myIdx === 0;
  const isMyTurn = gs?.currentPlayer === myIdx;
  const isCutter = gs?.cutterIdx === myIdx;
  const cut = gs?.cutCard;
  const drawn = gs?.drawn;

  // Auto-subscribe to hand when game starts
  useEffect(() => {
    if (gs && gs.phase !== 'lobby' && roomCode && myId) {
      subscribeToHand(roomCode, myId);
    }
  }, [gs?.phase, roomCode, myId]);

  // Auto-transition from lobby to game
  useEffect(() => {
    if (screen === 'lobby' && gs?.phase && gs.phase !== 'lobby') {
      setScreen('game');
    }
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

  // ────────── RENDER ──────────

  // HOME
  if (screen === 'home') {
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <div style={{ ...box, padding: '40px 32px' }}>
          <h1 style={{ color: '#e8d5b7', textAlign: 'center', margin: '0 0 4px', fontSize: 30, fontWeight: 400, letterSpacing: 3 }}>♠ RUMMY ♥</h1>
          <p style={{ color: '#8899aa', textAlign: 'center', margin: '0 0 28px', fontSize: 12, letterSpacing: 1 }}>ONLINE MULTIPLAYER · INDIAN RUMMY</p>

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
        <div style={{ ...box, padding: '36px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#8899aa', letterSpacing: 1, marginBottom: 6 }}>ROOM CODE</div>
          <div style={{ fontSize: 36, color: '#d4a853', fontWeight: 700, letterSpacing: 8, marginBottom: 4 }}>{roomCode}</div>
          <p style={{ color: '#667', fontSize: 12, marginBottom: 24 }}>Share this code with your friends</p>

          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            <div style={{ color: '#b0c4d8', fontSize: 12, letterSpacing: 1, marginBottom: 8 }}>
              PLAYERS ({gs?.players?.length || 0}/8)
            </div>
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
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <div style={{ color: '#8899aa', fontSize: 14 }}>Loading... ⏳</div>
      </div>
    );
  }

  // CUT JOKER
  if (gs.phase === 'cut') {
    const cutterName = gs.players[gs.cutterIdx]?.name || '?';
    const dealerName = gs.players[gs.dealer]?.name || '?';
    return (
      <div style={{ ...cBase, background: 'linear-gradient(145deg,#0a1628,#1a2a48,#0d1f36)' }}>
        <div style={{ ...box, padding: '36px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#8899aa', letterSpacing: 1, marginBottom: 4 }}>ROUND {gs.round}</div>
          <h2 style={{ color: '#e8d5b7', fontSize: 22, fontWeight: 400, margin: '0 0 6px', letterSpacing: 2 }}>✂️ CUT THE JOKER</h2>
          <p style={{ color: '#8899aa', fontSize: 12, margin: '0 0 6px' }}>Dealer: <span style={{ color: '#d4a853' }}>{dealerName}</span></p>
          <p style={{ color: '#a0b0c0', fontSize: 13, margin: '0 0 24px' }}>
            {isCutter ? "Your turn to cut!" : cutterName + " is cutting..."}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative', height: 100 }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 'calc(50% + ' + ((i - 3) * 20) + 'px - 29px)',
                transform: 'rotate(' + ((i - 3) * 6) + 'deg)', transformOrigin: 'bottom center',
              }}><Card card={{}} faceDown /></div>
            ))}
          </div>

          {isCutter ? (
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
    if (!me || me.eliminated) {
      return (
        <div style={{ ...cBase, background: darkBg }}>
          <div style={{ ...box, padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💀</div>
            <h2 style={{ color: '#e74c3c', fontSize: 20, fontWeight: 400, letterSpacing: 2 }}>ELIMINATED</h2>
            <p style={{ color: '#8899aa', fontSize: 13, marginTop: 8 }}>Watching... Round {gs.round}</p>
            <div style={{ marginTop: 16 }}>
              {gs.players.filter(p => !p.eliminated).map(p => (
                <div key={p.id} style={{ color: '#b0c4d8', fontSize: 13, lineHeight: 1.8 }}>
                  {p.id === gs.players[gs.currentPlayer]?.id ? '▶ ' : '  '}{p.name}: {p.score}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const topDisc = gs.discardPile?.length ? gs.discardPile[gs.discardPile.length - 1] : null;
    const curName = gs.players[gs.currentPlayer]?.name || '?';

    return (
      <div style={{ minHeight: '100vh', background: greenBg, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexWrap: 'wrap', gap: 4,
        }}>
          <div>
            <span style={{ color: '#e8d5b7', fontSize: 14, fontWeight: 600 }}>{me.name}</span>
            <span style={{ color: '#8a9a6a', fontSize: 11, marginLeft: 8 }}>Score: {me.score}</span>
          </div>
          <div style={{ color: '#8a9a6a', fontSize: 11 }}>R{gs.round} · {hand.length} cards · {roomCode}</div>
        </div>

        {/* Wild + Turn */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 12px', gap: 6 }}>
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 12px', flexWrap: 'wrap' }}>
          {gs.players.filter(p => !p.eliminated).map(p => (
            <span key={p.id} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: p.id === gs.players[gs.currentPlayer]?.id ? 'rgba(74,222,128,0.1)' : 'rgba(0,0,0,0.2)',
              color: p.id === gs.players[gs.currentPlayer]?.id ? '#4ade80' : '#7a9a6a',
              border: '1px solid ' + (p.id === gs.players[gs.currentPlayer]?.id ? 'rgba(74,222,128,0.2)' : 'transparent'),
            }}>{p.name}: {p.score}</span>
          ))}
        </div>

        {/* Piles */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, padding: '8px 16px 4px' }}>
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
              <div style={{ width: 58, height: 84, borderRadius: 8, border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#557755', fontSize: 11 }}>Empty</div>
            )}
          </div>
        </div>
        {isMyTurn && !drawn && <p style={{ textAlign: 'center', color: '#a0c890', fontSize: 12, margin: '2px 0' }}>↑ Tap a pile to draw ↑</p>}

        {/* Hand */}
        <div style={{ flex: 1, padding: '6px 10px', overflowY: 'auto', paddingBottom: 150 }}
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
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minHeight: 40 }}>
                  {cards.map((card, ci) => {
                    const beingDragged = dragCard && dragCard.id === card.id;
                    const showInsertBefore = isDropHere && dropTarget.position === ci;
                    return (
                      <div key={card.id} style={{ display: 'flex', alignItems: 'center' }}>
                        {showInsertBefore && (
                          <div style={{
                            width: 4, height: 56, borderRadius: 2,
                            background: '#4ade80', marginRight: 2, flexShrink: 0,
                            boxShadow: '0 0 8px rgba(74,222,128,0.5)',
                          }} />
                        )}
                        <div ref={el => cardRefs.current[card.id] = el}
                          style={{
                            position: 'relative',
                            opacity: beingDragged ? 0.3 : 1,
                            transition: 'opacity 0.1s',
                          }}
                          onTouchStart={e => handleDragStart(e, card.id, gi, ci)}
                          onMouseDown={e => handleDragStart(e, card.id, gi, ci)}
                        >
                          <Card card={card} cutCard={cut} selected={sel.has(card.id)}
                            onClick={() => { if (!isDragging.current) toggleSel(card.id); }} small />
                          {isMyTurn && drawn && !sel.has(card.id) && !dragCard && (
                            <button onClick={e => { e.stopPropagation(); discardCard(card.id); }} style={{
                              position: 'absolute', top: -5, right: -5, width: 16, height: 16,
                              borderRadius: 8, background: '#c0392b', border: 'none', color: '#fff',
                              fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontWeight: 700,
                            }}>✕</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Insert indicator at end of group */}
                  {isDropHere && dropTarget.position >= cards.length && (
                    <div style={{
                      width: 4, height: 56, borderRadius: 2,
                      background: '#4ade80', marginLeft: 2, flexShrink: 0,
                      boxShadow: '0 0 8px rgba(74,222,128,0.5)',
                    }} />
                  )}
                </div>
              </div>
            );
          })}
          {/* New group drop zone */}
          {dragCard && (
            <div style={{
              marginTop: 4, padding: '12px', borderRadius: 10,
              border: '1.5px dashed ' + (dropTarget && dropTarget.groupIdx === -1 ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.1)'),
              background: dropTarget && dropTarget.groupIdx === -1 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)',
              textAlign: 'center', color: dropTarget && dropTarget.groupIdx === -1 ? '#4ade80' : '#556655',
              fontSize: 11, transition: 'all 0.15s',
            }}>
              + Drop here for new group
            </div>
          )}
        </div>

        {/* Floating ghost card while dragging */}
        {dragCard && (() => {
          const card = hand.find(c => c.id === dragCard.id);
          if (!card) return null;
          return (
            <div style={{
              position: 'fixed', left: dragPos.x - 22, top: dragPos.y - 32,
              zIndex: 9999, pointerEvents: 'none',
              transform: 'scale(1.15) rotate(-3deg)',
              filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))',
            }}>
              <Card card={card} cutCard={cut} small glow />
            </div>
          );
        })()}

        {/* Actions */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top,rgba(0,0,0,0.92) 60%,transparent)', padding: '20px 14px 16px',
        }}>
          {err && <p style={{ color: '#e74c3c', fontSize: 11, textAlign: 'center', margin: '0 0 6px' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {sel.size >= 2 && <button onClick={makeGroup} style={abtn('#2980b9')}>Group ({sel.size})</button>}
            {sel.size > 0 && <button onClick={() => setSel(new Set())} style={abtn('#7f8c8d')}>Deselect</button>}
            <button onClick={() => {
              const sorted = sortHand(hand);
              const ng = [sorted.map(c => c.id)];
              setHand(sorted);
              setGroups(ng);
              setSel(new Set());
              savePlayerHand(roomCode, myId, sorted, ng);
            }} style={abtn('#2c6e49')}>Sort</button>
            <button onClick={ungroupAll} style={abtn('#8e6a3a')}>Ungroup</button>
            {isMyTurn && drawn && (
              <button onClick={declareShow} style={{ ...abtn('#d4a853'), background: 'linear-gradient(135deg,#d4a853,#b8862d)', color: '#1a1a2e' }}>
                🏆 SHOW
              </button>
            )}
          </div>
          <p style={{ color: '#7a9a6a', fontSize: 10, textAlign: 'center', margin: '6px 0 0' }}>
            {isMyTurn && drawn
              ? 'Tap ✕ to discard · Select 1 + SHOW to declare'
              : 'Hold & drag cards to rearrange · Tap to select'}
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
        <div style={{ ...box, padding: '28px 24px' }}>
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
                    {r.winner ? '👑 ' : ''}{r.name}{r.wasElim ? ' 💀' : ''}
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
            <div style={{ marginTop: 20, color: '#667', fontSize: 13, textAlign: 'center' }}>
              Waiting for host... ⏳
            </div>
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
        <div style={{ ...box, padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>👑</div>
          <h2 style={{ color: '#d4a853', fontSize: 26, fontWeight: 400, margin: '0 0 4px', letterSpacing: 2 }}>{winner.name} WINS!</h2>
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
