# SleepGuard AI v5 — Neural Guard & Parent Shield 🚀

> **A production-grade, 100% client-side AI Vision & Inactivity Guard designed specifically for free hosting on GitHub Pages.**
> Inspired by Linear, Arc Browser, and Apple Vision Pro glass interfaces. Powered by MediaPipe Face Mesh (478 points), MediaPipe Pose (33 points), MediaPipe Hands (21 points), a 12-Factor Sleep Confidence Engine, Local Face Enrollment for Guardian Mode, and a companion Chrome Extension (Manifest V3).

---

## ⚡ What's New in v5 (GitHub Pages Compatible)

1. **100% Client-Side Privacy Architecture**:
   - **Zero Server / Zero Cloud**: All AI models load via CDN and execute 100% locally in your browser via WebGL & WebRTC. No camera frames or face data ever leave your device.
   - **GitHub Pages Ready**: Fully compatible with static GitHub Pages hosting.

2. **Linear / Arc Browser Glass UI**:
   - Sleek slate obsidian palette (`#080B10`, `#121824`), glassmorphism backdrop blur, clean status pills (`🟢 Awake`, `Attention 97%`, `Sleep Risk 3%`), and refined typography (`Outfit` + `Plus Jakarta Sans`).

3. **12-Factor Sleep Confidence Matrix**:
   - Combines 12 independent telemetry signals: `EAR (Eye Aspect Ratio)`, `MAR (Mouth Yawning)`, `Eye Closure Duration`, `Iris Gaze Vector`, `Head Droop`, `Body Pose Motion`, `Hand Gestures / Typing`, `Facial Expression`, `Blink Rate`, `Person Count`, `Keyboard/Mouse Input`, and `Worker Inactivity`.
   - Triggers sleep ONLY when **Sleep Confidence > 95%**.

4. **Local Guardian Mode (Parent / Intruder Shield)**:
   - Enroll a target reference face profile (e.g. Parent / Stranger) directly in the browser.
   - Snapshot profiles and feature vectors are stored locally in `localStorage`.
   - Triggers instant emergency tab closure if a second face or enrolled profile enters camera view!

5. **Background Tab Worker & Optional Desktop Companion**:
   - Unthrottled Web Worker thread (`worker.js`) maintains background timers.
   - Included Python Desktop Agent (`desktop_agent.py`) for users needing continuous 24/7 background camera tracking outside the browser.

---

## 🚀 GitHub Pages Deployment

1. Push all files to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Deploy SleepGuard AI v5 Production Engine"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/SleepGuard-AI.git
   git push -u origin main
   ```
2. Enable GitHub Pages under **Repository Settings -> Pages** -> `main` branch -> `/ (root)`.
3. Your live link will be ready at: `https://YOUR_USERNAME.github.io/SleepGuard-AI/`.

---

## 🧩 Chrome Extension Installation

To allow SleepGuard AI to close browser tabs automatically:

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left).
4. Select the [extension](file:///c:/Users/suraj/Pictures/SleepGuard%20AI%20Browser%20Protector/extension) directory inside this repository.
5. Refresh the web page. The status badge will turn **`🟢 Extension Connected`**.

---

## 📁 Repository Structure

```
SleepGuard AI Browser Protector/
├── index.html                 # Linear/Arc Glass Dashboard (GitHub Pages Ready)
├── style.css                  # Modern Slate Obsidian Glass Theme
├── app.js                     # 100% Client-Side 12-Factor Neural Engine
├── worker.js                  # Background Web Worker Thread Ticker
├── desktop_agent.py           # Optional Python Desktop Companion Agent
├── README.md                  # Comprehensive Documentation
└── extension/                 # Manifest V3 Chrome Extension
    ├── manifest.json          # Chrome Extension Manifest V3
    ├── background.js          # Service Worker for closing tabs
    ├── content.js             # PostMessage Bridge Content Script
    ├── popup.html             # Extension Popup UI
    └── popup.js              # Extension Popup Controller
```
