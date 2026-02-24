# ♠ Rummy Online ♥

Online multiplayer Indian Rummy game. 2-8 players, 2 decks, 13 cards each.

## 🚀 Deploy in 10 Minutes (Free)

You need two things: **Firebase** (free database) + **Vercel** (free hosting).

---

### Step 1: Create a Firebase Project (5 min)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"** (or "Add project")
3. Name it something like `rummy-game`, click Continue
4. Disable Google Analytics (not needed), click **Create Project**
5. Wait for it to create, then click **Continue**

### Step 2: Enable Realtime Database

1. In your Firebase project, click **"Build"** in the left sidebar
2. Click **"Realtime Database"**
3. Click **"Create Database"**
4. Choose a location (pick the closest to you), click **Next**
5. Select **"Start in test mode"** → click **Enable**
   - ⚠️ Test mode allows open access for 30 days. Fine for playing with friends. You can extend this later in Rules.

### Step 3: Get Your Firebase Config

1. In Firebase console, click the **gear icon** (⚙️) next to "Project Overview"
2. Click **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **web icon** (`</>`) to add a web app
5. Name it `rummy`, click **Register app**
6. You'll see a code block with `firebaseConfig`. Copy these values:
   ```
   apiKey: "AIza..."
   authDomain: "rummy-game-xxxxx.firebaseapp.com"
   databaseURL: "https://rummy-game-xxxxx-default-rtdb.firebaseio.com"
   projectId: "rummy-game-xxxxx"
   storageBucket: "rummy-game-xxxxx.firebasestorage.app"
   messagingSenderId: "1234567890"
   appId: "1:1234567890:web:abcdef..."
   ```

### Step 4: Deploy to Vercel (5 min)

#### Option A: Deploy via GitHub (Recommended)

1. Push this project folder to a new GitHub repository
2. Go to [https://vercel.com](https://vercel.com) and sign in with GitHub
3. Click **"Add New Project"** → Import your rummy repo
4. Before deploying, click **"Environment Variables"** and add each one:

   | Name | Value |
   |------|-------|
   | `VITE_FB_API_KEY` | your apiKey |
   | `VITE_FB_AUTH_DOMAIN` | your authDomain |
   | `VITE_FB_DATABASE_URL` | your databaseURL |
   | `VITE_FB_PROJECT_ID` | your projectId |
   | `VITE_FB_STORAGE_BUCKET` | your storageBucket |
   | `VITE_FB_MESSAGING_SENDER_ID` | your messagingSenderId |
   | `VITE_FB_APP_ID` | your appId |

5. Click **Deploy** 🎉
6. You'll get a URL like `https://rummy-online.vercel.app` — share this with friends!

#### Option B: Deploy via Vercel CLI

1. Install: `npm i -g vercel`
2. Copy `.env.example` to `.env` and fill in your Firebase values
3. Run:
   ```bash
   npm install
   npm run build
   vercel --prod
   ```
4. Follow the prompts. Add environment variables when asked.

---

### Step 5: Play!

1. Share your Vercel URL with friends
2. One person creates a room → gets a 5-letter code
3. Everyone else joins with that code
4. Host starts the game — everyone plays on their own phone!

---

## 🎮 Game Rules

- **2 decks + 2 natural jokers** (one per deck)
- **13 cards** dealt to each player
- **Cut Joker**: Before each round, the player before the dealer cuts a card. The opposite-color same-rank cards become wild jokers for that round.
  - Example: Cut K♦ (red) → K♠ and K♣ are wild jokers
- **Valid Show** requires: 1 pure sequence (no jokers) + 1 second sequence (jokers OK) + remaining cards in valid sets/runs
- **Scoring**: No valid melds = 80 points (full count). Valid partial hand = only unmelded cards count.
  - Face cards (J/Q/K) & Ace = 10 points, Number cards = face value
- **Elimination** at 201+ points
- **Last player standing wins!**

---

## 🔧 Local Development

```bash
cp .env.example .env
# Fill in your Firebase config values in .env
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📁 Project Structure

```
rummy-online/
├── index.html          # Entry HTML
├── package.json        # Dependencies
├── vite.config.js      # Vite config
├── .env.example        # Environment variable template
└── src/
    ├── main.jsx        # React entry
    ├── App.jsx         # Main game UI
    ├── game.js         # Game logic (deck, melds, scoring)
    └── firebase.js     # Firebase config & database helpers
```

## 🔒 Firebase Security (Optional)

For production use, update your Firebase Realtime Database rules:

```json
{
  "rules": {
    "games": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    },
    "hands": {
      "$roomCode": {
        "$playerId": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

For tighter security, you could add Firebase Auth and restrict hand reads to the owning player.
