# SleepGuard AI v10.2 — AI Sleep Protection & Tab Guardian 🚀

> **A production-grade, 100% client-side AI Sleep Protector designed specifically for free hosting on GitHub Pages.**
> Powered by MediaPipe Face Mesh Eye Tracking, Web Audio Oscillating Siren Alarms, Single Source-of-Truth Telemetry, Smart Protection Timer, and Manifest V3 Extension Tab Removal.

---

## ⚡ Key Breakthroughs in v10.2 Pipeline Rewrite

1. **Robust MediaPipe Detection Loop**:
   - Validates `webcamElem.readyState >= 2 && webcamElem.videoWidth > 0` before sending frames to `faceMesh.send({ image: webcamElem })`.
   - Locks onto the user's face immediately upon camera start and draws green 468-point contour mesh.

2. **Zero Default Placeholder Data (No Fake Telemetry)**:
   - When no face is detected, all metrics instantly switch to `--` and `Confidence: 0%`. (Eliminated default hardcoded numbers like `0.38` or `99.4%`!).
   - When face is present, EAR Left, EAR Right, EAR Avg, Blink Rate, and Model Confidence update exclusively from MediaPipe callbacks.

3. **Web Audio Siren Alarm System**:
   - Built-in Web Audio API dual-tone oscillating Siren Synthesizer (`880Hz` / `440Hz` siren sweep).
   - Rings a continuous security alarm tone when sleep is confirmed or timer ends.
   - Controls: **Enable Alarm ON/OFF Switch**, **Volume Slider (0-100%)**, **Sound Type Selector**, and **Test Alarm Button**.

4. **Fully Interactive Sidebar Navigation**:
   - Sidebar links (`Dashboard`, `Timer`, `Sound`, `Protected Tabs`, `Activity Log`, `Settings`, `About`) scroll to sections or launch respective modals.

---

## 🚀 GitHub Pages Deployment Guide

1. Push all files to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Deploy SleepGuard AI v10.2 Pipeline Rewrite"
   git branch -M main
   git remote add origin https://github.com/cyberdrivepro/SleepGuard-AI-Browser-Protector.git
   git push -u origin main
   ```
2. Enable GitHub Pages under **Repository Settings -> Pages** -> `main` branch -> `/ (root)`.
3. Live Link: `https://cyberdrivepro.github.io/SleepGuard-AI-Browser-Protector/`.

---

## 🧩 Chrome Extension Installation

To allow SleepGuard AI to close target protected tabs (YouTube, Instagram, Netflix, etc.):

1. Open Chrome and navigate to `chrome://extensions`.
2. Turn ON **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left).
4. Select the `extension` directory inside this repository.
5. Refresh the web page. System header will display **`Protection: Active 🟢`**.

---

## 📁 Repository Structure

```
SleepGuard AI Browser Protector/
├── index.html                 # v10.2 Pipeline Rewrite Dashboard UI
├── style.css                  # Obsidian Slate Glass Theme (#060911 / #0F172A)
├── app.js                     # MediaPipe Single Source-of-Truth Pipeline & Web Audio Siren
├── worker.js                  # Background Web Worker Thread Ticker
├── desktop_agent.py           # Optional Python Background Agent (24/7 Monitoring)
├── README.md                  # Comprehensive Documentation
└── extension/                 # Manifest V3 Chrome Extension (Protected Tabs Manager)
    ├── manifest.json          # Chrome Extension Manifest V3
    ├── background.js          # Service Worker for closing protected tabs
    ├── content.js             # PostMessage Bridge Content Script
    ├── popup.html             # Extension Popup UI
    └── popup.js              # Extension Popup Controller
```
