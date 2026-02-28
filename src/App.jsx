import { useState, useEffect, useRef } from 'react';
import {
  saveGameState, savePlayerHand, loadPlayerHand, saveFullDeal,
  loadGameState, onGameStateChange, onPlayerHandChange,
  db, ref, set, get, update,
} from './firebase.js';
import {
  SUITS, SUIT_COLORS, SUIT_COLOR_GROUP, OPPOSITE_SUITS, RANKS,
  RANK_VALUES, RANK_ORDER, MAX_PENALTY, ELIM_SCORE, DROP_PENALTY, MIDDLE_DROP_PENALTY,
  createDeck, shuffle, sortHand, sortGroupByValue, isWild, isJkr, cardVal,
  validateMeld, validateShow, calcPenalty, dealNewRound,
  genCode, genId,
} from './game.js';

// ─── Design Tokens ──────────────────────────────────────────────────
const T = {
  display: "'Cinzel', serif",
  body: "'DM Sans', sans-serif",

  bgDeepest: '#060e1a',
  bgDeep: '#0b1626',
  bgMid: '#0f1f38',
  bgLight: '#162a4a',

  tableDeep: '#073d1e',
  tableMid: '#0a5228',
  tableLight: '#0d6830',
  tableEdge: '#052e16',

  gold: '#d4af37',
  goldLight: '#e8cc6e',
  goldDark: '#a3882a',
  goldMuted: 'rgba(212,175,55,0.15)',
  goldBorder: 'rgba(212,175,55,0.25)',
  goldText: '#e2c778',

  textPrimary: '#eee5d3',
  textSecondary: '#a8b8cc',
  textMuted: '#6b7d95',
  textDim: '#4a5a6e',

  cardWhite: '#fefcf8',
  cardSelected: '#fff9e6',
  cardWild: '#fff6e0',
  cardRed: '#c0392b',
  cardBlack: '#1a1a2e',

  success: '#38c172',
  danger: '#e74c3c',
  warning: '#e8a85c',
  purple: '#8e44ad',

  glass: 'rgba(12,20,40,0.65)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassLight: 'rgba(255,255,255,0.04)',
  glassHeavy: 'rgba(8,14,30,0.85)',

  shadowSm: '0 2px 8px rgba(0,0,0,0.3)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.4)',
  shadowLg: '0 16px 48px rgba(0,0,0,0.5)',
  shadowXl: '0 24px 64px rgba(0,0,0,0.6)',
  shadowGold: '0 4px 24px rgba(212,175,55,0.25)',
};

// ─── Persistent player ID ────────────────────────────────────────────
function getMyId() {
  let id = null;
  try { id = localStorage.getItem('rummy_pid'); } catch {}
  if (!id) { id = genId(); try { localStorage.setItem('rummy_pid', id); } catch {} }
  return id;
}

// ─── Card Component ─────────────────────────────────────────────────
function Card({ card, selected, onClick, small, faceDown, cutCard, glow, style: sx }) {
  const w = small ? 58 : 72, h = small ? 84 : 104;

  if (faceDown) return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 10,
      background: 'linear-gradient(145deg, #1a3a5c, #0d2848, #0a1e3a)',
      border: '2px solid #2a5a8c',
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 3px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
      transition: 'all 0.2s ease', ...sx,
    }}>
      <div style={{
        position: 'absolute', inset: small ? 4 : 5,
        border: '1.5px solid rgba(212,175,55,0.25)', borderRadius: 6,
      }} />
      <div style={{
        position: 'absolute', inset: small ? 8 : 10,
        backgroundImage: `
          repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(212,175,55,0.06) 6px, rgba(212,175,55,0.06) 7px),
          repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(212,175,55,0.06) 6px, rgba(212,175,55,0.06) 7px)
        `, borderRadius: 4,
      }} />
      <div style={{
        width: small ? 18 : 24, height: small ? 18 : 24,
        border: '1.5px solid rgba(212,175,55,0.3)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(212,175,55,0.08)', position: 'relative', zIndex: 1,
      }}>
        <span style={{ fontSize: small ? 8 : 10, color: 'rgba(212,175,55,0.5)', fontFamily: T.display, fontWeight: 700 }}>C</span>
      </div>
    </div>
  );

  const wild = cutCard && isWild(card, cutCard);
  const clr = card.nat ? '#8e44ad' : SUIT_COLORS[card.suit];

  const borderColor = selected ? T.gold : wild ? T.warning : glow ? T.success : 'rgba(180,180,180,0.3)';
  const cardBg = selected ? T.cardSelected : wild ? `linear-gradient(135deg, ${T.cardWild}, #fff8ee)` : T.cardWhite;
  const cardShadow = selected
    ? `0 6px 20px rgba(212,175,55,0.4), 0 0 0 2px ${T.gold}`
    : glow ? `0 4px 16px rgba(56,193,114,0.3), 0 0 0 1px ${T.success}`
    : wild ? '0 3px 14px rgba(232,168,92,0.25)'
    : '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)';

  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 10,
      background: cardBg, border: `2px solid ${borderColor}`,
      cursor: onClick ? 'pointer' : 'default',
      boxShadow: cardShadow,
      transform: selected ? 'translateY(-10px) scale(1.04)' : 'none',
      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      flexShrink: 0, position: 'relative', userSelect: 'none', ...sx,
    }}>
      {wild && (
        <div style={{
          position: 'absolute', top: -4, right: -4, width: 18, height: 18,
          borderRadius: '50%', background: `linear-gradient(135deg, ${T.gold}, ${T.goldDark})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(212,175,55,0.5)', zIndex: 2,
        }}><span style={{ fontSize: 10, color: '#fff' }}>★</span></div>
      )}
      {card.nat ? (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ fontSize: small ? 28 : 36 }}>🃏</span>
          <span style={{ fontSize: small ? 7 : 8, fontFamily: T.display, color: '#8e44ad', fontWeight: 700, letterSpacing: 1 }}>JOKER</span>
        </div>
      ) : (
        <>
          <div style={{
            position: 'absolute', top: small ? 4 : 5, left: small ? 5 : 6,
            display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1,
          }}>
            <span style={{ fontSize: small ? 13 : 16, fontWeight: 800, color: clr, fontFamily: T.display }}>{card.rank}</span>
            <span style={{ fontSize: small ? 10 : 13, color: clr, marginTop: -1 }}>{card.suit}</span>
          </div>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: small ? 26 : 34, color: clr, opacity: 0.85,
          }}>{card.suit}</div>
          <div style={{
            position: 'absolute', bottom: small ? 4 : 5, right: small ? 5 : 6,
            display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1,
            transform: 'rotate(180deg)',
          }}>
            <span style={{ fontSize: small ? 13 : 16, fontWeight: 800, color: clr, fontFamily: T.display }}>{card.rank}</span>
            <span style={{ fontSize: small ? 10 : 13, color: clr, marginTop: -1 }}>{card.suit}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Wild Badge ──────────────────────────────────────────────────────
function WildBadge({ cut }) {
  if (!cut) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
      background: T.goldMuted, border: `1px solid ${T.goldBorder}`,
      borderRadius: 20, fontSize: 12, color: T.textPrimary,
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      flexWrap: 'wrap', justifyContent: 'center', fontFamily: T.body,
      boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontWeight: 700, color: T.gold, fontFamily: T.display, fontSize: 11, letterSpacing: 1 }}>CUT</span>
      <span style={{
        fontSize: 16, fontWeight: 800, color: cut.nat ? T.purple : SUIT_COLORS[cut.suit],
        background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 6, fontFamily: T.display,
      }}>{cut.nat ? '🃏' : cut.rank + cut.suit}</span>
      <span style={{ color: T.textMuted, fontSize: 14 }}>→</span>
      {cut.nat
        ? <span style={{ color: T.textMuted, fontSize: 11 }}>No extra wilds</span>
        : <span style={{ fontWeight: 700 }}>
            {OPPOSITE_SUITS[cut.suit].map(s =>
              <span key={s} style={{
                color: SUIT_COLORS[s], marginRight: 4,
                background: 'rgba(255,255,255,0.85)', padding: '1px 6px', borderRadius: 4,
                fontSize: 12, fontFamily: T.display,
              }}>{cut.rank}{s}★</span>
            )}
            <span style={{ color: T.textMuted, marginLeft: 4, fontSize: 11 }}>wild</span>
          </span>
      }
    </div>
  );
}

// ─── Watermark ───────────────────────────────────────────────────────
function Watermark() {
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-18deg)',
        fontSize: 56, fontWeight: 900, letterSpacing: 14, fontFamily: T.display,
        color: 'rgba(212,175,55,0.018)', pointerEvents: 'none', zIndex: 0,
        whiteSpace: 'nowrap', userSelect: 'none',
        textShadow: '0 0 80px rgba(212,175,55,0.02)',
      }}>CHALARAGERS</div>
    </>
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
        padding: '5px 14px', borderRadius: 8,
        border: `1px solid ${open ? T.goldBorder : 'rgba(255,255,255,0.1)'}`,
        background: open ? T.goldMuted : T.glassLight,
        color: T.goldText, fontSize: 10, cursor: 'pointer',
        fontFamily: T.body, fontWeight: 600, letterSpacing: 0.5,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.2s ease',
      }}>📋 LOG {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 280, maxHeight: 240, overflowY: 'auto',
          background: T.glassHeavy, border: `1px solid ${T.glassBorder}`,
          borderRadius: 14, padding: 10, zIndex: 20,
          boxShadow: T.shadowLg,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          animation: 'fadeSlideUp 0.2s ease-out',
        }}>
          <div style={{
            color: T.textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 8,
            textAlign: 'center', fontFamily: T.display, fontWeight: 600,
          }}>DISCARD LOG</div>
          {recent.map((e, i) => {
            const cardLabel = e.card?.nat ? '🃏' : (e.card?.rank || '?') + (e.card?.suit || '');
            const cardColor = e.card?.nat ? T.purple : SUIT_COLORS[e.card?.suit] || '#999';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 12,
              }}>
                <span style={{
                  color: e.action === 'picked' ? T.success : T.warning,
                  fontWeight: 700, fontSize: 9, width: 46, flexShrink: 0, fontFamily: T.body,
                }}>{e.action === 'picked' ? '⬆ PICK' : '⬇ TOSS'}</span>
                <span style={{
                  color: T.textSecondary, flex: 1, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{e.player}</span>
                <span style={{
                  fontWeight: 800, fontSize: 13, color: cardColor,
                  background: 'rgba(255,255,255,0.92)', padding: '2px 6px',
                  borderRadius: 5, fontFamily: T.display,
                }}>{cardLabel}</span>
              </div>
            );
          })}
          {!recent.length && <div style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 16 }}>No activity yet</div>}
        </div>
      )}
    </div>
  );
}

// ─── Chat Panel ──────────────────────────────────────────────────────
function ChatPanel({ chat, onSend, myName }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [lastRead, setLastRead] = useState(0);
  const endRef = useRef(null);
  const msgs = chat || [];
  const unread = msgs.length - lastRead;

  useEffect(() => {
    if (open) { setLastRead(msgs.length); endRef.current?.scrollIntoView({ behavior: 'smooth' }); }
  }, [open, msgs.length]);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div style={{ position: 'fixed', bottom: 80, left: 12, zIndex: 20 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: 44, height: 44, borderRadius: '50%',
        background: open ? `linear-gradient(135deg, ${T.gold}, ${T.goldDark})` : T.glass,
        border: `1px solid ${open ? T.gold : T.glassBorder}`,
        color: open ? T.bgDeepest : T.goldText,
        fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: T.shadowMd, position: 'relative',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        transition: 'all 0.2s ease',
      }}>
        💬
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 20, height: 20, borderRadius: '50%',
            background: T.danger, color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.body,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: 52, left: 0,
          width: 280, maxHeight: 340,
          background: T.glassHeavy, border: `1px solid ${T.glassBorder}`,
          borderRadius: 16, overflow: 'hidden',
          boxShadow: T.shadowLg,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          animation: 'fadeSlideUp 0.2s ease-out',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${T.glassBorder}`,
            color: T.goldText, fontSize: 11, fontFamily: T.display, fontWeight: 600,
            letterSpacing: 1.5, textAlign: 'center',
          }}>CHAT</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', maxHeight: 240 }}>
            {msgs.length === 0 && <div style={{ color: T.textDim, fontSize: 11, textAlign: 'center', padding: 20 }}>No messages yet</div>}
            {msgs.map((m, i) => {
              const isMe = m.senderName === myName;
              return (
                <div key={i} style={{ marginBottom: 6, textAlign: isMe ? 'right' : 'left' }}>
                  {!isMe && <div style={{ fontSize: 9, color: T.goldText, fontWeight: 600, marginBottom: 2, fontFamily: T.body }}>{m.senderName}</div>}
                  <div style={{
                    display: 'inline-block', maxWidth: '85%', padding: '6px 10px',
                    borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: isMe ? T.goldMuted : T.glassLight,
                    border: `1px solid ${isMe ? T.goldBorder : T.glassBorder}`,
                    color: T.textPrimary, fontSize: 12, fontFamily: T.body,
                    wordBreak: 'break-word',
                  }}>{m.text}</div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div style={{
            display: 'flex', gap: 6, padding: '8px 10px',
            borderTop: `1px solid ${T.glassBorder}`,
          }}>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Type a message..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${T.glassBorder}`, background: T.glassLight,
                color: T.textPrimary, fontSize: 12, fontFamily: T.body, outline: 'none',
              }} />
            <button onClick={send} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: `linear-gradient(135deg, ${T.gold}, ${T.goldDark})`,
              color: T.bgDeepest, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: T.body,
            }}>Send</button>
          </div>
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
      if (!state) return;
      const myIdx = state.players.findIndex(p => p.id === myId);
      if (state.currentPlayer !== myIdx) return;

      // Initial drop (never drawn) = 25, Middle drop (already played) = 50
      const isMiddleDrop = (state.hasDrawnOnce || []).includes(myId);
      const penalty = isMiddleDrop ? MIDDLE_DROP_PENALTY : DROP_PENALTY;

      const newScore = state.players[myIdx].score + penalty;
      state.players[myIdx].score = newScore;
      state.players[myIdx].eliminated = newScore >= ELIM_SCORE;
      if (!state.packed) state.packed = [];
      state.packed.push(myId);
      if (!state.packedPenalties) state.packedPenalties = {};
      state.packedPenalties[myId] = penalty;

      const ai = state.players.map((p, i) => (!p.eliminated ? i : -1)).filter(i => i >= 0);
      const playing = ai.filter(i => !(state.packed || []).includes(state.players[i].id));

      if (playing.length <= 1) {
        const winnerId = playing.length === 1 ? playing[0] : null;
        // Collect all player hands for round-end reveal
        const roundHands = {};
        const handPromises = state.players.map(async (p, i) => {
          if (p.eliminated) return;
          const ph = await loadPlayerHand(roomCode, p.id);
          if (ph?.hand) roundHands[p.id] = { hand: ph.hand, groups: ph.groups || [ph.hand.map(c => c.id)] };
        });
        await Promise.all(handPromises);
        state.roundHands = roundHands;
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated && !(state.packed || []).includes(p.id)) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (winnerId !== null && i === winnerId) return { name: p.name, penalty: 0, newScore: p.score, elim: false, wasElim: false, winner: true };
          if ((state.packed || []).includes(p.id)) {
            const pp = (state.packedPenalties || {})[p.id] || DROP_PENALTY;
            return { name: p.name, penalty: pp, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true };
          }
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

      // Collect all player hands for round-end reveal
      const roundHands = {};
      roundHands[myId] = { hand: remHand, groups: remGroups };

      if (result.valid) {
        const penaltyPromises = state.players.map(async (p, i) => {
          if (p.eliminated || i === myIdx) return { penalty: 0 };
          if ((state.packed || []).includes(p.id)) {
            const ph = await loadPlayerHand(roomCode, p.id);
            if (ph?.hand) roundHands[p.id] = { hand: ph.hand, groups: ph.groups || [ph.hand.map(c => c.id)] };
            return { penalty: 0, packed: true };
          }
          const ph = await loadPlayerHand(roomCode, p.id);
          if (!ph || !ph.hand) return { penalty: MAX_PENALTY };
          roundHands[p.id] = { hand: ph.hand, groups: ph.groups || [ph.hand.map(c => c.id)] };
          const pg = (ph.groups || [ph.hand.map(c => c.id)]).map(g =>
            g.map(id => ph.hand.find(c => c.id === id)).filter(Boolean)
          );
          return { penalty: calcPenalty(pg, state.cutCard) };
        });
        const penalties = await Promise.all(penaltyPromises);
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (i === myIdx) return { name: p.name, penalty: 0, elim: false, wasElim: false, winner: true, newScore: p.score };
          if ((state.packed || []).includes(p.id)) { const pp = (state.packedPenalties || {})[p.id] || DROP_PENALTY; return { name: p.name, penalty: pp, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true }; }
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
        // Invalid show — still collect other hands for reveal
        const handPromises = state.players.map(async (p, i) => {
          if (p.eliminated || i === myIdx) return;
          const ph = await loadPlayerHand(roomCode, p.id);
          if (ph?.hand) roundHands[p.id] = { hand: ph.hand, groups: ph.groups || [ph.hand.map(c => c.id)] };
        });
        await Promise.all(handPromises);

        const ns = state.players[myIdx].score + MAX_PENALTY;
        const elim = ns >= ELIM_SCORE;
        state.players[myIdx].score = ns;
        state.players[myIdx].eliminated = elim;
        state.roundResults = state.players.map((p, i) => {
          if (p.eliminated && i !== myIdx) return { name: p.name, penalty: 0, elim: true, wasElim: false };
          if (i === myIdx) return { name: p.name, penalty: MAX_PENALTY, newScore: ns, elim: false, wasElim: elim, inv: true };
          if ((state.packed || []).includes(p.id)) { const pp = (state.packedPenalties || {})[p.id] || DROP_PENALTY; return { name: p.name, penalty: pp, newScore: p.score, elim: false, wasElim: p.score >= ELIM_SCORE, packed: true }; }
          return { name: p.name, penalty: 0, newScore: p.score, elim: false, wasElim: false };
        });
        state.invalidShow = true;
      }
      state.roundHands = roundHands;
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

  // ── Chat ──
  async function sendChat(text) {
    try {
      const state = await loadGameState(roomCode);
      if (!state) return;
      if (!state.chat) state.chat = [];
      state.chat.push({ senderName: myName, text, ts: Date.now() });
      // Keep last 100 messages
      if (state.chat.length > 100) state.chat = state.chat.slice(-100);
      state._ts = Date.now();
      await saveGameState(roomCode, state);
    } catch (e) { /* silently fail */ }
  }

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
  const darkBg = `linear-gradient(145deg, ${T.bgDeepest}, ${T.bgMid}, ${T.bgDeep})`;
  const greenBg = `radial-gradient(ellipse at 50% 40%, ${T.tableMid} 0%, ${T.tableDeep} 60%, ${T.tableEdge} 100%)`;

  const goldBtn = {
    width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
    background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold}, ${T.goldDark})`,
    color: T.bgDeepest, fontSize: 15, fontWeight: 700, cursor: 'pointer',
    letterSpacing: 2, fontFamily: T.display,
    boxShadow: T.shadowGold, position: 'relative', overflow: 'hidden',
    transition: 'all 0.2s ease, transform 0.15s ease',
  };
  const outBtn = {
    padding: '12px 36px', borderRadius: 12, border: `1px solid ${T.goldBorder}`,
    background: T.goldMuted, color: T.goldText,
    fontSize: 14, cursor: 'pointer', letterSpacing: 2,
    fontFamily: T.display, fontWeight: 600,
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  };
  const box = {
    background: T.glass, borderRadius: 24, maxWidth: 480, width: '100%',
    border: `1px solid ${T.glassBorder}`, boxShadow: T.shadowXl,
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  };
  const cBase = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: T.body,
  };

  // ════════════════════════════ RENDER ════════════════════════════

  // HOME
  if (screen === 'home') {
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{
          position: 'absolute', top: '40%', left: '50%',
          transform: 'translate(-50%, -50%)', width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{ ...box, padding: '44px 36px', position: 'relative', zIndex: 1, animation: 'fadeSlideUp 0.4s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, letterSpacing: 6, color: T.gold, fontWeight: 700, fontFamily: T.display }}>♠ ♥ ♦ ♣</span>
          </div>
          <h1 style={{
            color: T.textPrimary, textAlign: 'center', margin: '0 0 4px',
            fontSize: 30, fontWeight: 700, letterSpacing: 6, fontFamily: T.display,
            textShadow: '0 2px 20px rgba(212,175,55,0.15)',
          }}>CHALARAGERS</h1>
          <p style={{ color: T.textMuted, textAlign: 'center', margin: '0 0 4px', fontSize: 11, letterSpacing: 2, fontFamily: T.body, fontWeight: 500 }}>
            ONLINE MULTIPLAYER · INDIAN RUMMY
          </p>
          <p style={{ color: T.textDim, textAlign: 'center', margin: '0 0 28px', fontSize: 10, letterSpacing: 1.5, fontFamily: T.body }}>
            Up to 8 players · 2 decks · 201 elimination
          </p>

          {err && <p style={{ color: T.danger, fontSize: 12, textAlign: 'center', margin: '0 0 14px', fontFamily: T.body, fontWeight: 500 }}>{err}</p>}

          <label style={{ color: T.textSecondary, fontSize: 11, letterSpacing: 1.5, fontFamily: T.body, fontWeight: 600, textTransform: 'uppercase' }}>YOUR NAME</label>
          <input value={myName} onChange={e => { setMyName(e.target.value); setErr(''); }}
            placeholder="Enter your name" style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              border: `1px solid ${T.glassBorder}`, background: T.glassLight,
              color: T.textPrimary, fontSize: 15, fontFamily: T.body,
              outline: 'none', marginTop: 8, marginBottom: 22, boxSizing: 'border-box',
              transition: 'border-color 0.2s ease',
            }} />

          <button onClick={createRoom} disabled={loading} style={{ ...goldBtn, marginBottom: 14, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'CREATING...' : 'CREATE ROOM'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0' }}>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${T.glassBorder}, transparent)` }} />
            <span style={{ color: T.textDim, fontSize: 11, letterSpacing: 3, fontFamily: T.display, fontWeight: 600 }}>OR JOIN</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${T.glassBorder}, transparent)` }} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setErr(''); }}
              placeholder="CODE" maxLength={5} style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                border: `1px solid ${T.glassBorder}`, background: T.glassLight,
                color: T.textPrimary, fontSize: 18, fontFamily: T.display, fontWeight: 700,
                outline: 'none', letterSpacing: 6, textAlign: 'center', textTransform: 'uppercase',
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
        <div style={{ ...box, padding: '36px 32px', textAlign: 'center', position: 'relative', zIndex: 1, animation: 'fadeSlideUp 0.4s ease-out' }}>
          <div style={{ fontSize: 12, color: T.textMuted, letterSpacing: 1.5, marginBottom: 6, fontFamily: T.body, fontWeight: 600 }}>ROOM CODE</div>
          <div style={{
            display: 'inline-block', padding: '4px 16px', borderRadius: 12,
            animation: 'glowPulse 3s ease-in-out infinite',
          }}>
            <span style={{ fontSize: 38, color: T.gold, fontWeight: 800, letterSpacing: 10, fontFamily: T.display, textShadow: '0 0 30px rgba(212,175,55,0.3)' }}>{roomCode}</span>
          </div>
          <p style={{ color: T.textDim, fontSize: 12, marginBottom: 24, fontFamily: T.body }}>Share this code with your friends</p>

          <div style={{ textAlign: 'left', marginBottom: 24 }}>
            <div style={{ color: T.textSecondary, fontSize: 12, letterSpacing: 1.5, marginBottom: 10, fontFamily: T.body, fontWeight: 600 }}>
              PLAYERS ({gs?.players?.length || 0}/8)
            </div>
            {gs?.players?.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: p.id === myId ? T.goldMuted : 'transparent',
                borderRadius: 10, marginBottom: 4,
                border: p.id === myId ? `1px solid ${T.goldBorder}` : '1px solid transparent',
                animation: `fadeSlideUp ${0.2 + i * 0.08}s ease-out`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: i === 0 ? `linear-gradient(135deg, ${T.gold}, ${T.goldDark})` : T.glassLight,
                  border: i === 0 ? 'none' : `1px solid ${T.glassBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: i === 0 ? T.bgDeepest : T.textMuted,
                  fontFamily: T.display,
                }}>{i === 0 ? '★' : p.name[0]?.toUpperCase()}</div>
                <span style={{ color: p.id === myId ? T.goldText : T.textSecondary, fontSize: 14, fontFamily: T.body, fontWeight: 500 }}>
                  {p.name} {p.id === myId ? '(you)' : ''}
                </span>
              </div>
            ))}
          </div>

          {err && <p style={{ color: T.danger, fontSize: 12, margin: '0 0 12px', fontFamily: T.body }}>{err}</p>}

          {isHost ? (
            <button onClick={startGame} style={{ ...goldBtn, opacity: (gs?.players?.length || 0) < 2 ? 0.5 : 1 }}
              disabled={(gs?.players?.length || 0) < 2}>
              START GAME ({gs?.players?.length || 0} players)
            </button>
          ) : (
            <div style={{
              padding: 18, borderRadius: 12, background: T.glassLight,
              border: `1px solid ${T.glassBorder}`, color: T.textMuted, fontSize: 13,
              fontFamily: T.body, animation: 'breathe 2s ease-in-out infinite',
            }}>
              Waiting for host to start...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!gs) {
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <div style={{ color: T.textMuted, fontSize: 14, fontFamily: T.body, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, border: `2px solid ${T.goldBorder}`,
            borderTop: `2px solid ${T.gold}`, borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // CUT JOKER
  if (gs.phase === 'cut') {
    const cutterName = gs.players[gs.cutterIdx]?.name || '?';
    const dealerName = gs.players[gs.dealer]?.name || '?';
    const meObj = gs.players[myIdx];
    const amSpectator = meObj?.spectator;

    return (
      <div style={{ ...cBase, background: `radial-gradient(circle at 50% 30%, rgba(212,175,55,0.05) 0%, transparent 50%), ${darkBg}` }}>
        <Watermark />
        <div style={{ ...box, padding: '36px 28px', textAlign: 'center', position: 'relative', zIndex: 1, animation: 'fadeSlideUp 0.4s ease-out' }}>
          <div style={{ fontSize: 13, color: T.textMuted, letterSpacing: 1.5, marginBottom: 4, fontFamily: T.body, fontWeight: 600 }}>ROUND {gs.round}</div>
          <h2 style={{ color: T.textPrimary, fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: 3, fontFamily: T.display }}>CUT THE JOKER</h2>
          <div style={{ width: 60, height: 2, background: `linear-gradient(to right, transparent, ${T.gold}, transparent)`, margin: '8px auto 12px' }} />
          <p style={{ color: T.textMuted, fontSize: 12, margin: '0 0 6px', fontFamily: T.body }}>Dealer: <span style={{ color: T.goldText }}>{dealerName}</span></p>
          <p style={{ color: T.textSecondary, fontSize: 13, margin: '0 0 24px', fontFamily: T.body }}>
            {amSpectator ? "Watching — you'll play next round!" : isCutter ? "Your turn to cut!" : cutterName + " is cutting..."}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, position: 'relative', height: 110 }}>
            <div style={{
              position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
              width: 200, height: 40, background: 'radial-gradient(ellipse, rgba(212,175,55,0.08) 0%, transparent 70%)',
              borderRadius: '50%', pointerEvents: 'none',
            }} />
            {[...Array(7)].map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 'calc(50% + ' + ((i - 3) * 22) + 'px - 29px)',
                transform: 'rotate(' + ((i - 3) * 6) + 'deg)', transformOrigin: 'bottom center',
              }}><Card card={{}} faceDown /></div>
            ))}
          </div>

          {amSpectator ? (
            <div style={{
              color: T.warning, fontSize: 13, padding: 14, background: 'rgba(142,106,58,0.1)',
              borderRadius: 12, border: '1px solid rgba(142,106,58,0.2)', fontFamily: T.body,
            }}>Spectating · You'll join next round</div>
          ) : isCutter ? (
            <button onClick={performCut} disabled={loading} style={{
              ...outBtn, opacity: loading ? 0.6 : 1,
              animation: 'glowPulse 2s ease-in-out infinite',
            }}>
              {loading ? 'CUTTING...' : 'CUT CARD'}
            </button>
          ) : (
            <div style={{ color: T.textDim, fontSize: 13, animation: 'pulse 2s infinite', fontFamily: T.body }}>Waiting for {cutterName}...</div>
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

    // Spectator view — live game table
    if (amSpectator || amIPacked || !me || me.eliminated) {
      const label = amSpectator ? 'SPECTATING' : amIPacked ? 'PACKED' : 'ELIMINATED';
      const accent = amSpectator ? '#5dade2' : amIPacked ? T.warning : T.danger;
      const packedPenalty = amIPacked ? ((gs.packedPenalties || {})[myId] || DROP_PENALTY) : 0;
      const subtitle = amSpectator ? "You'll play next round" : amIPacked ? `+${packedPenalty} pts` : 'Out of the game';
      const topDisc = gs.discardPile?.length ? gs.discardPile[gs.discardPile.length - 1] : null;
      const curName = gs.players[gs.currentPlayer]?.name || '?';
      return (
        <div style={{ minHeight: '100vh', background: greenBg, fontFamily: T.body, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Vignette */}
          <div style={{
            position: 'fixed', inset: 0,
            background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.4) 100%)',
            pointerEvents: 'none', zIndex: 0,
          }} />

          {/* Top banner */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px', background: 'rgba(0,0,0,0.5)',
            borderBottom: `1px solid rgba(255,255,255,0.06)`,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            flexWrap: 'wrap', gap: 6, position: 'relative', zIndex: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                letterSpacing: 1.5, fontFamily: T.display,
                background: `${accent}20`, color: accent, border: `1px solid ${accent}40`,
              }}>{label}</span>
              <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.body }}>{subtitle}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <DiscardLog log={gs.discardLog} cutCard={cut} />
              <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.body }}>R{gs.round} · {roomCode}</span>
            </div>
          </div>

          {/* Wild + Turn */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 12px', gap: 8, position: 'relative', zIndex: 1 }}>
            <WildBadge cut={cut} />
            <div style={{
              padding: '8px 20px', borderRadius: 24,
              background: T.glassLight, border: `1px solid ${T.glassBorder}`,
              color: T.textSecondary, fontSize: 14, fontWeight: 700, fontFamily: T.body,
              animation: 'pulse 2s infinite',
            }}>
              ⏳ {curName}'s turn {gs.drawn ? '· drawing...' : ''}
            </div>
          </div>

          {/* Piles */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32, padding: '12px 16px', position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 5, fontFamily: T.display, fontWeight: 600 }}>STOCK ({gs.stockPile?.length || 0})</div>
              <Card card={{}} faceDown />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 5, fontFamily: T.display, fontWeight: 600 }}>DISCARD</div>
              {topDisc ? (
                <Card card={topDisc} cutCard={cut} />
              ) : (
                <div style={{
                  width: 72, height: 104, borderRadius: 10,
                  border: `2px dashed ${T.goldBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.textDim, fontSize: 11, fontFamily: T.body,
                }}>Empty</div>
              )}
            </div>
          </div>

          {/* Players */}
          <div style={{ padding: '10px 16px', position: 'relative', zIndex: 1 }}>
            {gs.players.filter(p => !p.eliminated && !p.spectator).map((p, idx) => {
              const isPacked = (gs.packed || []).includes(p.id);
              const isCur = p.id === gs.players[gs.currentPlayer]?.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                  marginBottom: 4, borderRadius: 10,
                  background: isCur ? 'rgba(56,193,114,0.1)' : isPacked ? 'rgba(142,106,58,0.08)' : 'rgba(0,0,0,0.15)',
                  border: `1px solid ${isCur ? 'rgba(56,193,114,0.25)' : 'transparent'}`,
                  animation: isCur ? 'breathe 2s ease-in-out infinite' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: isCur ? 'rgba(56,193,114,0.2)' : T.glassLight,
                    border: `1px solid ${isCur ? 'rgba(56,193,114,0.3)' : T.glassBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: isCur ? T.success : T.textMuted,
                    fontFamily: T.display,
                  }}>{isCur ? '▶' : p.name[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{
                      color: isPacked ? '#8e6a3a' : isCur ? T.success : T.textSecondary,
                      fontSize: 13, fontWeight: isCur ? 700 : 500, fontFamily: T.body,
                      textDecoration: isPacked ? 'line-through' : 'none',
                    }}>{p.name}</span>
                  </div>
                  <span style={{
                    color: T.goldText, fontSize: 12, fontFamily: T.display, fontWeight: 600,
                  }}>{p.score}</span>
                  {isPacked && <span style={{ fontSize: 11 }}>🏳️</span>}
                </div>
              );
            })}
          </div>

          <ChatPanel chat={gs?.chat} onSend={sendChat} myName={myName} />
        </div>
      );
    }

    const topDisc = gs.discardPile?.length ? gs.discardPile[gs.discardPile.length - 1] : null;
    const curName = gs.players[gs.currentPlayer]?.name || '?';

    return (
      <div style={{ minHeight: '100vh', background: greenBg, fontFamily: T.body, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Vignette */}
        <div style={{
          position: 'fixed', inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.4) 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        {/* Ambient glow */}
        <div style={{
          position: 'fixed', top: '25%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 300,
          background: 'radial-gradient(ellipse, rgba(212,175,55,0.04) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Top Bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: 'rgba(0,0,0,0.45)',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          flexWrap: 'wrap', gap: 6, position: 'relative', zIndex: 2,
        }}>
          <div>
            <span style={{ color: T.textPrimary, fontSize: 15, fontWeight: 600, fontFamily: T.body }}>{me.name}</span>
            <span style={{ color: T.goldText, fontSize: 12, marginLeft: 10, fontFamily: T.display, fontWeight: 600 }}>Score: {me.score}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DiscardLog log={gs.discardLog} cutCard={cut} />
            <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.body }}>R{gs.round} · {hand.length} cards · {roomCode}</span>
          </div>
        </div>

        {/* Wild + Turn */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px', gap: 8, position: 'relative', zIndex: 1 }}>
          <WildBadge cut={cut} />
          <div style={{
            padding: '8px 20px', borderRadius: 24,
            background: isMyTurn ? 'rgba(56,193,114,0.12)' : T.glassLight,
            border: `1px solid ${isMyTurn ? 'rgba(56,193,114,0.3)' : T.glassBorder}`,
            color: isMyTurn ? T.success : T.textMuted, fontSize: 14, fontWeight: 700, fontFamily: T.body,
            animation: isMyTurn ? 'breathe 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s ease',
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
                fontSize: 11, padding: '3px 10px', borderRadius: 12,
                background: isCurrent ? 'rgba(56,193,114,0.12)' : isPacked ? 'rgba(142,106,58,0.15)' : 'rgba(0,0,0,0.25)',
                color: isCurrent ? T.success : isPacked ? '#8e6a3a' : T.textMuted,
                border: `1px solid ${isCurrent ? 'rgba(56,193,114,0.25)' : 'transparent'}`,
                textDecoration: isPacked ? 'line-through' : 'none',
                fontFamily: T.body, fontWeight: 500,
                transition: 'all 0.3s ease',
              }}>{p.name}: {p.score}{isPacked ? ' 🏳️' : ''}</span>
            );
          })}
        </div>

        {/* Piles */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32, padding: '10px 16px 6px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 5, fontFamily: T.display, fontWeight: 600 }}>STOCK ({gs.stockPile?.length || 0})</div>
            <Card card={{}} faceDown onClick={isMyTurn && !drawn ? drawFromStock : undefined}
              style={{ cursor: isMyTurn && !drawn ? 'pointer' : 'default', opacity: !isMyTurn || drawn ? 0.4 : 1 }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 5, fontFamily: T.display, fontWeight: 600 }}>DISCARD</div>
            {topDisc ? (
              <Card card={topDisc} cutCard={cut} onClick={isMyTurn && !drawn ? drawFromDiscard : undefined}
                style={{ cursor: isMyTurn && !drawn ? 'pointer' : 'default', opacity: !isMyTurn || drawn ? 0.4 : 1 }} />
            ) : (
              <div style={{
                width: 72, height: 104, borderRadius: 10,
                border: `2px dashed ${T.goldBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.textDim, fontSize: 11, fontFamily: T.body,
              }}>Empty</div>
            )}
          </div>
        </div>

        {/* Draw prompt + Pack */}
        {isMyTurn && (() => {
          const isMiddleDrop = (gs.hasDrawnOnce || []).includes(myId);
          const packPenalty = isMiddleDrop ? MIDDLE_DROP_PENALTY : DROP_PENALTY;
          return (
            <div style={{ textAlign: 'center', padding: '6px 0', position: 'relative', zIndex: 1 }}>
              {!drawn && <p style={{ color: T.success, fontSize: 12, margin: '2px 0', fontFamily: T.body, fontWeight: 500, opacity: 0.8 }}>↑ Tap a pile to draw ↑</p>}
              <button onClick={dropPack} style={{
                marginTop: 8, padding: '10px 28px', borderRadius: 10,
                border: '1px solid rgba(231,76,60,0.35)', background: 'rgba(231,76,60,0.1)',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                color: T.danger, fontSize: 12, cursor: 'pointer', fontFamily: T.body,
                fontWeight: 600, letterSpacing: 0.5, transition: 'all 0.2s ease',
              }}>🏳️ {isMiddleDrop ? 'MIDDLE DROP' : 'PACK'} (+{packPenalty} pts)</button>
            </div>
          );
        })()}

        {/* Hand */}
        <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto', paddingBottom: 150, position: 'relative', zIndex: 1 }}
          onTouchMove={handleDragMove} onTouchEnd={handleDragEnd}
          onMouseMove={handleDragMove} onMouseUp={handleDragEnd}>
          {groups.map((gids, gi) => {
            const cards = getGCards(gids);
            const m = cards.length >= 3 ? validateMeld(cards, cut) : { ok: false };
            const isDropHere = dropTarget && dropTarget.groupIdx === gi;
            return (
              <div key={gi} ref={el => groupRefs.current[gi] = el}
                style={{
                  marginBottom: 12, padding: '8px 8px 10px', borderRadius: 14,
                  background: isDropHere ? 'rgba(56,193,114,0.08)' : 'rgba(0,0,0,0.12)',
                  border: `1.5px dashed ${isDropHere ? 'rgba(56,193,114,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.2s ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: m.ok ? T.success : T.textMuted, fontSize: 10, letterSpacing: 1, fontWeight: 600, fontFamily: T.body }}>
                    {m.ok ? (m.type === 'pure' ? '✓ PURE SEQ' : m.type === 'impure' ? '✓ SEQUENCE' : '✓ SET') : 'GROUP ' + (gi + 1)}
                  </span>
                  {sel.size > 0 && (
                    <button onClick={() => moveToGroup(gi)} style={{
                      padding: '2px 8px', borderRadius: 6, border: `1px solid ${T.glassBorder}`,
                      background: T.glassLight, color: T.textSecondary, fontSize: 9,
                      cursor: 'pointer', fontFamily: T.body, transition: 'all 0.15s',
                    }}>+ here</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 48 }}>
                  {cards.map((card, ci) => {
                    const beingDragged = dragCard && dragCard.id === card.id;
                    const showInsertBefore = isDropHere && dropTarget.position === ci;
                    return (
                      <div key={card.id} style={{ display: 'flex', alignItems: 'center' }}>
                        {showInsertBefore && (
                          <div style={{
                            width: 4, height: 68, borderRadius: 2,
                            background: T.success, marginRight: 2, flexShrink: 0,
                            boxShadow: `0 0 8px rgba(56,193,114,0.5)`,
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
                      width: 4, height: 68, borderRadius: 2,
                      background: T.success, marginLeft: 2, flexShrink: 0,
                      boxShadow: `0 0 8px rgba(56,193,114,0.5)`,
                    }} />
                  )}
                </div>
              </div>
            );
          })}
          {dragCard && (
            <div style={{
              marginTop: 4, padding: '14px', borderRadius: 14,
              border: `1.5px dashed ${dropTarget && dropTarget.groupIdx === -1 ? 'rgba(56,193,114,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: dropTarget && dropTarget.groupIdx === -1 ? 'rgba(56,193,114,0.08)' : T.glassLight,
              textAlign: 'center', color: dropTarget && dropTarget.groupIdx === -1 ? T.success : T.textDim,
              fontSize: 11, transition: 'all 0.15s', fontFamily: T.body,
            }}>+ Drop here for new group</div>
          )}
        </div>

        {/* Ghost drag card */}
        {dragCard && (() => {
          const card = hand.find(c => c.id === dragCard.id);
          if (!card) return null;
          return (
            <div style={{
              position: 'fixed', left: dragPos.x - 29, top: dragPos.y - 42,
              zIndex: 9999, pointerEvents: 'none',
              transform: 'scale(1.2) rotate(-4deg)',
              filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.6))',
              opacity: 0.92,
            }}><Card card={card} cutCard={cut} small glow /></div>
          );
        })()}

        {/* Actions */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(5,10,20,0.95) 50%, rgba(5,10,20,0.7) 80%, transparent)',
          padding: '24px 16px 18px', zIndex: 10,
          borderTop: `1px solid ${T.glassBorder}`,
        }}>
          {err && <p style={{ color: T.danger, fontSize: 11, textAlign: 'center', margin: '0 0 6px', fontFamily: T.body }}>{err}</p>}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {sel.size >= 2 && <button onClick={makeGroup} style={abtn('#2980b9')}>Group ({sel.size})</button>}
            {sel.size > 0 && <button onClick={() => setSel(new Set())} style={abtn('#5a6a7a')}>Deselect</button>}
            <button onClick={sortInGroups} style={abtn('#2c6e49')}>Sort</button>
            <button onClick={ungroupAction} style={abtn('#8e6a3a')}>
              {sel.size > 0 ? 'To G1 (' + sel.size + ')' : 'Ungroup'}
            </button>
            {isMyTurn && drawn && sel.size === 1 && (
              <button onClick={discardSelected} style={{
                ...abtn('#c0392b'), background: 'linear-gradient(135deg,#c0392b,#922b21)',
                boxShadow: '0 2px 12px rgba(192,57,43,0.35)',
              }}>🗑 DISCARD</button>
            )}
            {isMyTurn && drawn && sel.size === 1 && hand.length === 14 && (
              <button onClick={declareShow} style={{
                ...abtn(T.gold), background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold}, ${T.goldDark})`,
                color: T.bgDeepest, fontWeight: 700,
                animation: 'glowPulse 2s ease-in-out infinite',
              }}>🏆 SHOW</button>
            )}
          </div>
          <p style={{ color: T.textMuted, fontSize: 10, textAlign: 'center', margin: '8px 0 0', fontFamily: T.body }}>
            {isMyTurn && drawn
              ? 'Select 1 card → DISCARD or SHOW'
              : 'Hold & drag to rearrange · Tap to select'}
          </p>
        </div>
        <ChatPanel chat={gs?.chat} onSend={sendChat} myName={myName} />
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
        <div style={{ ...box, padding: '32px 28px', position: 'relative', zIndex: 1, animation: 'fadeSlideUp 0.4s ease-out' }}>
          <h2 style={{
            color: gs.invalidShow ? T.danger : T.textPrimary, textAlign: 'center',
            margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: 3, fontFamily: T.display,
          }}>
            {gs.invalidShow ? 'INVALID SHOW' : 'ROUND COMPLETE'}
          </h2>
          <div style={{ width: 60, height: 2, background: `linear-gradient(to right, transparent, ${gs.invalidShow ? T.danger : T.gold}, transparent)`, margin: '8px auto 12px' }} />
          <p style={{ color: T.textMuted, textAlign: 'center', margin: '0 0 14px', fontSize: 12, fontFamily: T.body }}>
            {gs.invalidShow ? decName + ' invalid show! (+80)' : decName + ' wins!'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><WildBadge cut={cut} /></div>

          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.glassBorder}` }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '8px 16px',
              background: T.glassLight, color: T.textMuted,
              fontSize: 10, letterSpacing: 1.5, fontFamily: T.display, fontWeight: 600,
            }}>
              <span>PLAYER</span><span style={{ textAlign: 'right' }}>PEN</span><span style={{ textAlign: 'right' }}>TOTAL</span>
            </div>
            {gs.roundResults?.map((r, i) => {
              if (gs.players[i]?.eliminated && !r.wasElim) return null;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 70px 70px', padding: '9px 16px',
                  borderTop: `1px solid rgba(255,255,255,0.04)`,
                  background: r.wasElim ? 'rgba(231,76,60,0.08)' : r.winner ? 'rgba(212,175,55,0.08)' : 'transparent',
                  animation: `fadeSlideUp ${0.15 + i * 0.06}s ease-out`,
                }}>
                  <span style={{ color: r.winner ? T.success : r.wasElim ? T.danger : T.textSecondary, fontSize: 13, fontFamily: T.body }}>
                    {r.winner ? '👑 ' : ''}{r.name}{r.wasElim ? ' 💀' : r.packed ? ' 🏳️' : ''}
                  </span>
                  <span style={{ textAlign: 'right', color: r.penalty ? T.warning : T.success, fontSize: 13, fontWeight: 700, fontFamily: T.body }}>
                    {r.penalty ? '+' + r.penalty : '0'}
                  </span>
                  <span style={{ textAlign: 'right', color: T.textSecondary, fontSize: 13, fontWeight: 700, fontFamily: T.body }}>
                    {r.newScore !== undefined ? r.newScore : gs.players[i]?.score}
                  </span>
                </div>
              );
            })}
          </div>

          {gs.roundResults?.some(r => r.wasElim) && (
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 12,
              background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)',
              color: T.danger, fontSize: 12, textAlign: 'center', fontFamily: T.body,
            }}>
              {gs.roundResults.filter(r => r.wasElim).map(r => r.name).join(', ')} eliminated!
            </div>
          )}

          {/* Hand Reveal Section */}
          {gs.roundHands && Object.keys(gs.roundHands).length > 0 && (() => {
            return (
              <div style={{ marginTop: 18 }}>
                <div style={{
                  color: T.goldText, fontSize: 11, letterSpacing: 1.5, fontFamily: T.display,
                  fontWeight: 600, textAlign: 'center', marginBottom: 10,
                }}>PLAYER HANDS</div>
                {gs.players.map((p, pi) => {
                  const rh = gs.roundHands[p.id];
                  if (!rh || !rh.hand || !rh.hand.length) return null;
                  const isDeclarer = pi === gs.declarer;
                  const isWinner = gs.roundResults?.[pi]?.winner;
                  const playerGroups = (rh.groups || [rh.hand.map(c => c.id)]).map(gids =>
                    gids.map(id => rh.hand.find(c => c.id === id)).filter(Boolean)
                  );
                  return (
                    <div key={p.id} style={{
                      marginBottom: 12, padding: '10px 12px', borderRadius: 12,
                      background: isWinner ? 'rgba(56,193,114,0.06)' : isDeclarer ? 'rgba(231,76,60,0.06)' : T.glassLight,
                      border: `1px solid ${isWinner ? 'rgba(56,193,114,0.2)' : isDeclarer ? 'rgba(231,76,60,0.2)' : T.glassBorder}`,
                      animation: `fadeSlideUp ${0.2 + pi * 0.08}s ease-out`,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                      }}>
                        <span style={{
                          color: isWinner ? T.success : isDeclarer ? T.danger : T.textSecondary,
                          fontSize: 12, fontWeight: 700, fontFamily: T.body,
                        }}>
                          {isWinner ? '👑 ' : isDeclarer && gs.invalidShow ? '❌ ' : ''}{p.name}
                        </span>
                        {isDeclarer && <span style={{
                          fontSize: 9, padding: '2px 8px', borderRadius: 6,
                          background: gs.invalidShow ? 'rgba(231,76,60,0.15)' : 'rgba(56,193,114,0.15)',
                          color: gs.invalidShow ? T.danger : T.success,
                          fontFamily: T.body, fontWeight: 600, letterSpacing: 0.5,
                        }}>{gs.invalidShow ? 'INVALID SHOW' : 'DECLARED'}</span>}
                      </div>
                      {playerGroups.map((groupCards, gi) => {
                        const m = groupCards.length >= 3 ? validateMeld(groupCards, cut) : { ok: false };
                        return (
                          <div key={gi} style={{ marginBottom: 6 }}>
                            <span style={{
                              color: m.ok ? T.success : T.textDim, fontSize: 9,
                              letterSpacing: 1, fontWeight: 600, fontFamily: T.body,
                            }}>
                              {m.ok ? (m.type === 'pure' ? '✓ PURE SEQ' : m.type === 'impure' ? '✓ SEQUENCE' : '✓ SET') : 'UNMELDED'}
                            </span>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
                              {groupCards.map(card => (
                                <Card key={card.id} card={card} cutCard={cut} small
                                  style={{ transform: 'scale(0.75)', transformOrigin: 'top left', margin: '0 -8px -18px 0' }} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {isHost ? (
            <button onClick={nextRound} style={{ ...goldBtn, marginTop: 22 }}>
              {active.length <= 2 ? 'SEE RESULTS' : 'NEXT ROUND'}
            </button>
          ) : (
            <div style={{ marginTop: 22, color: T.textDim, fontSize: 13, textAlign: 'center', fontFamily: T.body, animation: 'pulse 2s infinite' }}>Waiting for host...</div>
          )}
        </div>
        <ChatPanel chat={gs?.chat} onSend={sendChat} myName={myName} />
      </div>
    );
  }

  // GAME OVER
  if (gs.phase === 'gameOver') {
    const active = gs.players.filter(p => !p.eliminated);
    const winner = active.length === 1 ? active[0] : gs.players.reduce((a, b) => a.score < b.score ? a : b);
    const sorted = [...gs.players].sort((a, b) => a.score - b.score);
    const rankColors = [T.gold, '#c0c0c0', '#cd7f32'];
    return (
      <div style={{ ...cBase, background: darkBg }}>
        <Watermark />
        <div style={{ ...box, padding: '40px 28px', textAlign: 'center', position: 'relative', zIndex: 1, animation: 'fadeSlideUp 0.5s ease-out' }}>
          <div style={{ fontSize: 56, marginBottom: 10, animation: 'fadeSlideUp 0.5s ease-out' }}>👑</div>
          <h2 style={{
            color: T.gold, fontSize: 28, fontWeight: 700, margin: '0 0 4px',
            letterSpacing: 3, fontFamily: T.display,
            textShadow: '0 2px 20px rgba(212,175,55,0.3)',
          }}>{winner.name} WINS!</h2>
          <p style={{ color: T.textDim, fontSize: 10, letterSpacing: 3, margin: '2px 0 4px', fontFamily: T.display }}>CHALARAGERS</p>
          <p style={{ color: T.textMuted, fontSize: 12, margin: '0 0 28px', fontFamily: T.body }}>After {gs.round} rounds</p>

          <div style={{ textAlign: 'left', borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.glassBorder}` }}>
            {sorted.map((p, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '11px 16px',
                borderTop: i ? `1px solid rgba(255,255,255,0.04)` : 'none',
                color: p.eliminated ? T.textDim : i < 3 ? rankColors[i] : T.textSecondary,
                background: i === 0 ? 'rgba(212,175,55,0.06)' : 'transparent',
                animation: `fadeSlideUp ${0.2 + i * 0.06}s ease-out`,
              }}>
                <span style={{ fontSize: 13, fontFamily: T.body, fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? '👑 ' : (i + 1) + '. '}{p.name}{p.eliminated ? ' 💀' : ''}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: T.display }}>{p.score}</span>
              </div>
            ))}
          </div>

          <button onClick={() => { setScreen('home'); setGs(null); setHand([]); setGroups([]); }}
            style={{ ...goldBtn, marginTop: 24 }}>NEW GAME</button>
        </div>
        <ChatPanel chat={gs?.chat} onSend={sendChat} myName={myName} />
      </div>
    );
  }

  return (
    <div style={{ ...cBase, background: darkBg }}>
      <div style={{ color: T.textMuted, fontSize: 14, fontFamily: T.body, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, border: `2px solid ${T.goldBorder}`,
          borderTop: `2px solid ${T.gold}`, borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <span style={{ animation: 'pulse 2s ease-in-out infinite' }}>Loading game...</span>
      </div>
    </div>
  );
}

function abtn(bg) {
  return {
    padding: '10px 18px', borderRadius: 10, border: 'none',
    background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
    color: '#fff', fontSize: 12, cursor: 'pointer',
    fontFamily: T.body, letterSpacing: 0.5, fontWeight: 600,
    boxShadow: `0 2px 10px ${bg}44`,
    transition: 'all 0.2s ease',
    position: 'relative', overflow: 'hidden',
  };
}
