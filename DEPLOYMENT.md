# OpenTalk v1.0 Production Deployment Guide

This guide covers how to deploy **OpenTalk Version 1.0** as:
1. **A live production website on Render.com** (with free automated HTTPS & Secure WebSockets).
2. **An installable Android App (PWA)** that runs full-screen on any Android device with zero app store delays.
3. **A standalone Android APK** (for Google Play Store or direct APK installation).

---

## Why HTTPS / Cloud Hosting is Required
Modern mobile operating systems and browsers (Android Chrome, Safari) **strictly enforce** security policies:
- Microphone access (`navigator.mediaDevices.getUserMedia`) for WebRTC calls **only works over HTTPS** (or `localhost`).
- The Web Speech API for voice dictation **only works over HTTPS**.
- WebSockets for matchmaking and live audio stages require **Secure WebSockets (`wss://`)**.

**Render.com** provides automated, free SSL certificates (`https://...` and `wss://...`) with native WebSockets support on its free tier.

---

## Method 1: Deploy to Render.com (Recommended - 5 Minutes)

### Step 1: Push Your Code to GitHub
If you haven't already initialized git:
```bash
git init
git add .
git commit -m "OpenTalk v1.0 Production Release"
```
Create a new repository on [GitHub](https://github.com/new) (e.g., `opentalk`) and push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/opentalk.git
git branch -M main
git push -u origin main
```

---

### Step 2: Connect to Render.com
1. Go to [https://render.com](https://render.com) and sign in (you can sign in with GitHub).
2. Click **New +** in the top navigation bar and select **Web Service** (or **Blueprint**).
3. Connect your GitHub repository `opentalk`.

---

### Step 3: Configure the Web Service
Render will auto-detect Python or you can use these settings:

| Setting | Value |
|---|---|
| **Name** | `opentalk` |
| **Region** | Oregon (US West) or Frankfurt (EU) |
| **Branch** | `main` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

#### Environment Variables (under "Advanced"):
| Key | Value | Description |
|---|---|---|
| `PYTHON_VERSION` | `3.10.12` | Python runtime |
| `ENVIRONMENT` | `production` | Production mode |
| `OPENTALK_JWT_SECRET` | *(Click "Generate")* | 32+ character random secret |

Click **Create Web Service**.

---

### Step 4: Your Live URL
Render will build the dependencies and deploy your service. Within 2 minutes, you will receive your live URL:
```
https://opentalk.onrender.com
```
Both HTTPS and WSS are active immediately!

---

## Method 2: Installing as an Android App (PWA)

OpenTalk is configured as a **Progressive Web App (PWA)** with a standalone manifest and service worker.

### How to Install on Any Android Device:
1. Open your Android phone and launch **Google Chrome** (or Samsung Internet, Edge, Brave).
2. Navigate to your live website URL: `https://opentalk.onrender.com`.
3. OpenTalk will automatically show a banner: **"📲 Install OpenTalk App"**.
4. Tap **Install** (or tap Chrome's three dots `⋮` $\rightarrow$ **"Add to Home screen"** / **"Install App"**).
5. OpenTalk is now installed on your Android home screen and app drawer with the OpenTalk app icon!
6. Launch it from your home screen:
   - Runs in **full-screen standalone mode** without any browser address bar.
   - Microphone and voice recognition work with full native performance.

---

## Method 3: Generate a Standalone Android APK file

If you want an `.apk` file to distribute directly or upload to the Google Play Store:

### Using PWABuilder (Easiest - 2 Minutes):
1. Go to [https://www.pwabuilder.com](https://www.pwabuilder.com).
2. Enter your live Render URL: `https://opentalk.onrender.com` and click **Start**.
3. PWABuilder will audit your manifest and service worker (already 100% compliant).
4. Click **Package for Android** $\rightarrow$ Click **Generate APK / AAB**.
5. Download your signed or test `.apk` file and install it directly on your phone!

### Using Bubblewrap CLI (Google's Official TWA Tool):
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest="https://opentalk.onrender.com/manifest.json"
bubblewrap build
```

---

## Method 4: Run Locally on Your Home WiFi / LAN

To test on your Android phone using your home WiFi network without deploying to the cloud:
1. Find your computer's local IP address:
   ```bash
   hostname -I | awk '{print $1}'
   # Example: 192.168.1.15
   ```
2. Start OpenTalk:
   ```bash
   python3 -m uvicorn main:app --host 0.0.0.0 --port 8001
   ```
3. Open `http://<YOUR_LAN_IP>:8001` on your phone browser.
   *(Note: Chrome requires HTTPS for microphone on remote IPs; for live mic calls, use Method 1 on Render.com or use a tunnel like Cloudflare Tunnel / ngrok).*

---

## Testing Verification Checklist
Before shipping:
- [x] PWA Manifest verified (`/manifest.json`)
- [x] Service Worker active and caching (`/sw.js`)
- [x] Android app icons generated (`192x192`, `512x512`, `maskable`)
- [x] Dynamic `$PORT` handling for cloud container hosting
- [x] Database path configurable via `DATABASE_PATH`
- [x] WebRTC 1-on-1 audio calls working with STUN servers
- [x] Live WebSocket matchmaking queue
- [x] AI Tutor voice dictation with 4-second silence debouncer
- [x] Gender preference filter & opposite-gender priority matching
- [x] Star ratings, feedback chips, call history, and friends system
