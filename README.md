# OpenTalk — Spoken English Practice & Peer Calling Platform

**OpenTalk** is a spoken English conversation platform inspired by Ace Fluency, featuring 1-on-1 peer voice calling, audio voice clubs, an AI speaking tutor with real-time grammar polish, and daily vocabulary learning.

---

## Key Features

### 0. User Authentication & Profile Customization
- **Email-Based Authentication:** Secure email & password signup and login with `bcrypt` password hashing and `PyJWT` session tokens.
- **Language Profile:** Choose primary native language (Telugu featured by default, along with Hindi, Tamil, Kannada, Malayalam, Spanish, French, etc.).
- **Proficiency Level:** Beginner, Intermediate, or Advanced.
- **Quick Demo Mode:** Instant 1-click test login presets for Telugu peers and Global peers to test calling across multiple tabs/devices easily.

### 1. Peer-to-Peer 1-on-1 Voice Calling (WebRTC)
- **Local vs. Global Matchmaking:**
  - **Local Mode (Telugu ➔ Telugu):** Connects learners sharing the same mother tongue (e.g. Telugu speakers practicing with other Telugu speakers) for comfortable, low-anxiety English practice with peers from their own cultural background.
  - **Global Mode:** Connects learners with English speakers worldwide across all linguistic backgrounds for full English immersion.
- **Instant Matchmaking Queue:** Matches learners based on language compatibility and English level.
- **Incognito Calling Mode:** Switch between public identity and anonymous personas (e.g. *Curious Dolphin*, *Wise Owl*).
- **Real-Time Voice Engine:** Low-latency WebRTC audio stream with active microphone and procedural audio synthesizer.
- **Audio Wave Spectrum Visualizer:** Real-time visual feedback of speaker audio.
- **In-Call Icebreakers:** Rotating conversation starter prompts directly on the call screen.
- **Daily Free Talk-time Meter:** 20 free daily practice minutes with live session countdown timer.
- **Post-Call Rating & Safety:** 1–5 star rating system and reporting mechanism to maintain community guidelines.

### 2. Audio Voice Clubs (Group Rooms)
- **Live Discussion Stages:** Drop-in voice clubs (IELTS Prep, Job Interview Practice, Casual Debate, Travel Stories).
- **Stage & Audience Roles:** Stage speakers vs. audience listeners.
- **Raise Hand Mechanism:** Listeners can request the stage to speak.
- **In-Room Live Text Chat:** Send live reactions and messages during room broadcasts.
- **Room Creation:** Launch custom public or private audio clubs.

### 3. AI Speaking Coach ("Aria")
- **24/7 AI Speaking Partner:** Conversational partner for practice without fear of judgment.
- **Instant Grammar Polish:** Analyzes user speech in real-time and highlights:
  - Original awkward/incorrect phrasing (e.g. *"I am agree"*).
  - Native replacement (e.g. *"I agree"*).
  - Explicit grammar rule breakdown.
- **Fluency Scoring:** Real-time evaluation of grammar, vocabulary diversity, and coherence.
- **Voice Dictation:** Web Speech recognition for voice input.

### 4. Daily Learning Hub & Vocabulary
- **Idiom of the Day:** Definition, origin category, and natural conversation examples.
- **Phrasal Verb of the Day:** Common phrasal verbs with usage tips.
- **Slang of the Day:** Modern conversational slang.
- **Interactive Speaking Scenarios:** 30+ cue cards with conversation cues and vocabulary suggestions.

### 5. Gamification & Rewards
- **Daily Streak Counter:** Flame tracker encouraging daily speaking consistency.
- **Total Minutes Spoken & Call Counter:** Track speaking progress over time.
- **Referral Rewards:** Earn +15 bonus talk-time minutes by sharing with friends.

---

## Project Structure

```
opentalk/
├── main.py              # FastAPI application, static file router & WebSocket endpoints
├── run.sh               # One-click startup script
├── app/
│   ├── database.py      # SQLite database (profiles, streak, call logs, rooms)
│   ├── matchmaking.py   # Matchmaking queue engine with level & incognito pairing
│   ├── webrtc_hub.py    # WebSocket signaling router for P2P audio & club rooms
│   ├── ai_tutor.py      # AI dialogue generation, grammar correction & scoring
│   └── catalog.py       # Rich vocabulary, idioms, slang & speaking scenarios data
└── static/
    ├── index.html       # Single-page app with Tailwind CSS, Lucide icons & modals
    ├── app.js           # Client WebRTC connection, Web Audio synth & UI state
    └── style.css        # Custom pulsing animations, glassmorphism & visualizers
```

---

## How to Run

1. Navigate to the project directory:
   ```bash
   cd /home/simhadhri/opentalk
   ```

2. Start the server:
   ```bash
   ./run.sh
   # Or directly with uvicorn:
   python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. Open your browser:
   - On this machine: [http://localhost:8000](http://localhost:8000)
   - On your phone or another device on the same local network: `http://<your-ip>:8000`

---

## Packaging as Mobile App (Android / iOS)
Because OpenTalk is built with standard modern HTML5/JS/WebRTC and responsive mobile-first Tailwind design, it can be converted to an Android APK or iOS app with:
- **Capacitor**: `npx cap init opentalk com.opentalk.app && npx cap add android`
- **PWA**: Add a `manifest.json` for home-screen installation.
