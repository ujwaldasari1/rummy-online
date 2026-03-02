import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FB_DATABASE_URL,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ─── Database helpers ─────────────────────────────────────────────
export function gameRef(code) {
  return ref(db, 'games/' + code);
}

export function playerHandRef(code, playerId) {
  return ref(db, 'hands/' + code + '/' + playerId);
}

export async function saveGameState(code, state) {
  // Save public state (no hands) to games/
  const publicState = {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: null,      // Don't store hands in public state
      groups: null,
    })),
    _ts: Date.now(),
  };
  await set(gameRef(code), publicState);
}

export async function savePlayerHand(code, playerId, hand, groups) {
  await set(playerHandRef(code, playerId), { hand, groups, _ts: Date.now() });
}

export async function loadPlayerHand(code, playerId) {
  const snap = await get(playerHandRef(code, playerId));
  return snap.exists() ? snap.val() : null;
}

export async function saveFullDeal(code, state) {
  // Save public state + all hands atomically
  const updates = {};

  const publicState = {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: null,
      groups: null,
    })),
    _ts: Date.now(),
  };
  updates['games/' + code] = publicState;

  // Save each player's hand separately
  for (const p of state.players) {
    if (!p.eliminated && p.hand && p.hand.length > 0) {
      updates['hands/' + code + '/' + p.id] = {
        hand: p.hand,
        groups: p.groups,
        _ts: Date.now(),
      };
    }
  }

  await update(ref(db), updates);
}

export async function loadGameState(code) {
  const snap = await get(gameRef(code));
  return snap.exists() ? snap.val() : null;
}

export function onGameStateChange(code, callback) {
  return onValue(gameRef(code), (snap) => {
    if (snap.exists()) callback(snap.val());
  });
}

export function onPlayerHandChange(code, playerId, callback) {
  return onValue(playerHandRef(code, playerId), (snap) => {
    if (snap.exists()) callback(snap.val());
  });
}

// ─── Chat (separate path so writes don't overwrite game state) ────
export function chatRef(code) {
  return ref(db, 'chat/' + code);
}

export async function loadChat(code) {
  const snap = await get(chatRef(code));
  return snap.exists() ? (snap.val() || []) : [];
}

export async function saveChat(code, messages) {
  await set(chatRef(code), messages);
}

export function onChatChange(code, callback) {
  return onValue(chatRef(code), (snap) => {
    callback(snap.exists() ? (snap.val() || []) : []);
  });
}

export { db, ref, set, get, update };
