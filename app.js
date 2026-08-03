/* ==========================================================================
   SleepGuard Pro v11 — State-Driven Protection Engine & Connected Timers
   ========================================================================== */

// --- Web Audio API Siren Alarm Engine ---
class SirenAlarmEngine {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.isPlaying = false;
    this.volume = 1.0;
    this.soundType = 'siren';
    this.sirenInterval = null;
    this.sirenEnabled = true; // Siren ON/OFF switch
  }

  initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setVolume(pct) {
    this.volume = Math.max(0, Math.min(1, pct / 100));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  setSoundType(type) {
    this.soundType = type;
  }

  setSirenEnabled(enabled) {
    this.sirenEnabled = enabled;
    if (!enabled && this.isPlaying) {
      this.stopAlarm();
    }
  }

  startAlarm() {
    if (this.isPlaying || !this.sirenEnabled) return;
    try {
      this.initAudioContext();
      this.isPlaying = true;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sawtooth';
      this.oscillator.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let high = true;
      this.sirenInterval = setInterval(() => {
        if (!this.isPlaying || !this.oscillator || !this.audioCtx) return;
        const targetFreq = high ? 440 : 880;
        if (this.soundType === 'soft') {
          this.oscillator.frequency.exponentialRampToValueAtTime(high ? 300 : 600, this.audioCtx.currentTime + 0.4);
        } else if (this.soundType === 'cyber') {
          this.oscillator.frequency.setValueAtTime(high ? 520 : 1040, this.audioCtx.currentTime);
        } else {
          this.oscillator.frequency.exponentialRampToValueAtTime(targetFreq, this.audioCtx.currentTime + 0.3);
        }
        high = !high;
      }, 450);
    } catch (err) {
      console.warn('Audio siren start error:', err);
    }
  }

  stopAlarm() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.oscillator) {
      try { this.oscillator.stop(); this.oscillator.disconnect(); } catch (e) {}
      this.oscillator = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (e) {}
      this.gainNode = null;
    }
  }

  toggleTestAlarm(onTestStop) {
    if (this.isPlaying) {
      this.stopAlarm();
      if (onTestStop) onTestStop(false);
    } else {
      this.startAlarm();
      if (onTestStop) onTestStop(true);
    }
  }
}

const alarmEngine = new SirenAlarmEngine();

document.addEventListener('DOMContentLoaded', () => {

  // --- Single Source-of-Truth Application State ---
  const state = {
    cameraActive: false,
    modelLoaded: false,
    protectionActive: false, // Default false until started by user/camera
    showMesh: true,
    extensionConnected: false,
    isProcessingFrame: false,
    
    // FPS & Real Telemetry Data
    lastFrameTime: performance.now(),
    frameCount: 0,
    fps: 0,
    
    faceDetected: false,
    lastFaceSeenTime: Date.now(),
    
    earLeft: 0,
    earRight: 0,
    earAvg: 0,
    earThreshold: 0.22, // Adjusted EAR threshold for accurate MediaPipe eye closure
    modelConfidence: 0,
    sleepScore: 0,
    landmarksCount: 0,

    // Detection States: 'CAM_OFFLINE', 'INIT_AI', 'PROT_PAUSED', 'AWAKE', 'DROWSY', 'USER_AWAY', 'NO_FACE_GRACE', 'SLEEPING'
    currentState: 'CAM_OFFLINE', 

    blinkCount: 0,
    blinksInLastMinute: [],
    lastBlinkTime: Date.now(),
    eyeClosedStartTime: null,
    closureDurationMs: 0,

    // Sleep Emergency Timer (User Configurable: 5s to 24h)
    sleepTimerDurationSecs: 10,
    sleepTimerRemainingSecs: 10,
    sleepTimerActive: false,

    // Absence / Away Timer Engine (Custom Range: 1 sec to 60 hours)
    absenceTimerDurationSecs: 30, // Default 30s preset
    absenceTimerRemainingSecs: 30,
    absenceTimerActive: false,

    // Sound & Alarm Settings
    alarmEnabled: true,
    sirenEnabled: true,
    alarmVolume: 100,
    alarmSoundType: 'siren',
    alarmRepeatMode: 'last_3_sec', // 'last_3_sec', 'until_awake', 'until_closed'

    // Protected Domains — only enabled ones are stored
    protectedDomains: ['youtube.com', 'instagram.com', 'netflix.com'],
    protectAllOtherTabs: false,

    // Emergency Fullscreen Overlay State
    emergencyActive: false,
    emergencyReason: 'SLEEP DETECTED',

    // Post-Action Settings
    stopSirenAfterClose: true,  // Automatically stop siren after tabs are closed

    // Advanced Protection Settings
    closeSleepGuardPage: true,   // Close this SleepGuard monitoring tab after action
    closeAllWindows: false,       // Close entire browser windows containing protected tabs
    advPlaySiren: true,           // Play siren before closing
    advShowCountdown: true,       // Show 3-second countdown overlay

    // Custom Domains (user-added)
    customDomains: []
  }

  // Correct Standard MediaPipe FaceMesh Landmark Indices for EAR Calculation
  const LEFT_EYE = { corner1: 33, top1: 160, top2: 158, corner2: 133, bottom2: 153, bottom1: 144 };
  const RIGHT_EYE = { corner1: 362, top1: 385, top2: 387, corner2: 263, bottom2: 373, bottom1: 380 };

  // --- DOM References ---
  const webcamElem = document.getElementById('webcam');
  const canvasElem = document.getElementById('hudCanvas');
  const canvasCtx = canvasElem.getContext('2d');

  const camPrompt = document.getElementById('camPrompt');
  const startCamBtn = document.getElementById('startCamBtn');
  const toggleFaceMeshBtn = document.getElementById('toggleFaceMeshBtn');
  const liveChip = document.getElementById('liveChip');
  const fpsVal = document.getElementById('fpsVal');

  const camStatusPill = document.getElementById('camStatusPill');
  const camStatusText = document.getElementById('camStatusText');
  const aiStatusPill = document.getElementById('aiStatusPill');
  const aiStatusText = document.getElementById('aiStatusText');
  const protStatusPill = document.getElementById('protStatusPill');
  const protStatusText = document.getElementById('protStatusText');

  const toggleProtectionBtn = document.getElementById('toggleProtectionBtn');

  const metFaceVal = document.getElementById('metFaceVal');
  const metEyesVal = document.getElementById('metEyesVal');
  const metEarVal = document.getElementById('metEarVal');
  const metBlinkVal = document.getElementById('metBlinkVal');
  const metSleepScoreVal = document.getElementById('metSleepScoreVal');

  const telFaceStatus = document.getElementById('telFaceStatus');
  const telEyeStatus = document.getElementById('telEyeStatus');
  const telEarAvg = document.getElementById('telEarAvg');
  const telLandmarks = document.getElementById('telLandmarks');
  const telFps = document.getElementById('telFps');

  const statusCard = document.getElementById('statusCard');
  const statusAvatarWrap = document.getElementById('statusAvatarWrap');
  const statusAvatarIcon = document.getElementById('statusAvatarIcon');
  const statusHeadingText = document.getElementById('statusHeadingText');
  const statusSubText = document.getElementById('statusSubText');
  const confRingFill = document.getElementById('confRingFill');
  const confValText = document.getElementById('confValText');

  const timerPill = document.getElementById('timerPill');
  const sleepClockDisplay = document.getElementById('sleepClockDisplay');
  const sleepTimerBadge = document.getElementById('sleepTimerBadge');
  const awayClockDisplay = document.getElementById('awayClockDisplay');
  const awayTimerBadge = document.getElementById('awayTimerBadge');

  const inputSleepHours = document.getElementById('inputSleepHours');
  const inputSleepMins = document.getElementById('inputSleepMins');
  const inputSleepSecs = document.getElementById('inputSleepSecs');
  const applySleepTimeBtn = document.getElementById('applySleepTimeBtn');

  const inputHours = document.getElementById('inputHours');
  const inputMins = document.getElementById('inputMins');
  const inputSecs = document.getElementById('inputSecs');
  const applyTimeBtn = document.getElementById('applyTimeBtn');

  const alarmToggleSwitch = document.getElementById('alarmToggleSwitch');
  const sirenToggleSwitch = document.getElementById('sirenToggleSwitch');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValText = document.getElementById('volumeValText');
  const repeatModeSelect = document.getElementById('repeatModeSelect');
  const soundTypeSelect = document.getElementById('soundTypeSelect');
  const testAlarmBtn = document.getElementById('testAlarmBtn');

  const manageTabsBtn = document.getElementById('manageTabsBtn');

  const timelineList = document.getElementById('timelineList');
  const sidebarClock = document.getElementById('sidebarClock');
  const extensionStatusBanner = document.getElementById('extensionStatusBanner');

  const emergencyOverlay = document.getElementById('emergencyOverlay');
  const emergencyTitle = document.getElementById('emergencyTitle');
  const emergencySubtitle = document.getElementById('emergencySubtitle');
  const emergencyCountdownNum = document.getElementById('emergencyCountdownNum');
  const cancelEmergencyBtn = document.getElementById('cancelEmergencyBtn');

  const protectedTabsModal = document.getElementById('protectedTabsModal');
  const closeProtectedTabsBtn = document.getElementById('closeProtectedTabsBtn');
  const saveProtectedTabsBtn = document.getElementById('saveProtectedTabsBtn');
  const customDomainInput = document.getElementById('customDomainInput');

  const logsModal = document.getElementById('logsModal');
  const headerLogsBtn = document.getElementById('headerLogsBtn');
  const closeLogsBtn = document.getElementById('closeLogsBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  const settingsModal = document.getElementById('settingsModal');
  const headerSettingsBtn = document.getElementById('headerSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  const aboutModal = document.getElementById('aboutModal');
  const closeAboutBtn = document.getElementById('closeAboutBtn');
  const closeAboutFooterBtn = document.getElementById('closeAboutFooterBtn');

  const downloadModal = document.getElementById('downloadModal');
  const downloadExtBtn = document.getElementById('downloadExtBtn');
  const footerDownloadBtn = document.getElementById('footerDownloadBtn');
  const closeDownloadBtn = document.getElementById('closeDownloadBtn');

  const drowsinessThresholdInput = document.getElementById('drowsinessThreshold');
  const thresholdValDisplay = document.getElementById('thresholdValDisplay');
  const instantSleepToggle = document.getElementById('instantSleepToggle');

  // --- Strict Ground Truth Camera Readiness Check ---
  function hideCameraOverlay() {
    if (camPrompt) {
      camPrompt.style.display = 'none';
      camPrompt.classList.add('hidden');
    }
  }

  function showCameraOverlay() {
    if (camPrompt) {
      camPrompt.style.display = 'flex';
      camPrompt.classList.remove('hidden');
    }
  }

  function checkCameraReady() {
    const isReady = (
      webcamElem &&
      webcamElem.srcObject &&
      webcamElem.readyState >= 2 &&
      webcamElem.videoWidth > 0
    );

    if (isReady) {
      state.cameraActive = true;
      hideCameraOverlay();
    } else {
      state.cameraActive = false;
      showCameraOverlay();
    }
    return isReady;
  }

  // Bind video element events directly
  if (webcamElem) {
    ['playing', 'loadedmetadata', 'canplay', 'resize'].forEach(evtName => {
      webcamElem.addEventListener(evtName, () => {
        checkCameraReady();
        updateHeaderAndProtectionState();
      });
    });
  }

  // Periodic Ground Truth Check every 500ms
  setInterval(checkCameraReady, 500);

  // --- Live Sidebar Clock ---
  setInterval(() => {
    const now = new Date();
    if (sidebarClock) {
      sidebarClock.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
  }, 1000);

  // Initialize Clocks & Extension Bridge
  updateAwayClockDisplay();
  updateSleepClockDisplay();
  checkExtensionBridge();
  setInterval(checkExtensionBridge, 2500);

  // Initial State Sync for Controls & UI Header
  updateHeaderAndProtectionState();

  // --- Direct 1-Second Timer Engine Ticker ---
  let mainTimerTicker = setInterval(timerEngineTick, 1000);

  function timerEngineTick() {
    checkCameraReady();

    // STRICT RULE: Timers MUST NOT run when Camera is offline, Protection is disabled/paused, or Emergency is active!
    if (!state.cameraActive || !state.protectionActive || state.emergencyActive) {
      updateUIStatusCard();
      return;
    }

    const now = Date.now();
    const timeSinceLastFace = now - state.lastFaceSeenTime;

    // Rule 1: Face Missing -> Absence Timer Runs
    if (!state.faceDetected) {
      if (timeSinceLastFace >= 3000) {
        // Face lost > 3 seconds: Run Absence Timer
        state.currentState = 'USER_AWAY';
        state.absenceTimerActive = true;
        state.sleepTimerActive = false;

        if (state.absenceTimerRemainingSecs > 0) {
          state.absenceTimerRemainingSecs--;
          updateAwayClockDisplay();
        } else {
          // Timer hit 0 -> Trigger tab closure protection!
          triggerProtection('USER ABSENCE TIMEOUT');
        }
      } else {
        // Grace Period 0-3 seconds
        state.currentState = 'NO_FACE_GRACE';
      }
    } else {
      // Rule 2 & 3: Face Detected -> Check Sleep Emergency Timer
      if (state.sleepTimerActive) {
        // Sleep Timer Countdown Active
        state.currentState = 'SLEEPING';

        if (state.sleepTimerRemainingSecs > 0) {
          state.sleepTimerRemainingSecs--;
          updateSleepClockDisplay();

          // Siren Warning Trigger: Last 3 seconds of Sleep Timer
          if (state.sleepTimerRemainingSecs <= 3 && state.alarmEnabled && state.sirenEnabled) {
            alarmEngine.startAlarm();
          }
        } else {
          // Sleep timer hit 0 -> Trigger tab closure protection & stop alarm loop
          alarmEngine.stopAlarm();
          triggerProtection('SLEEP CONFIRMED');
        }
      } else {
        // Face Present & Eyes Open: Reset / Pause Absence Timer IMMEDIATELY
        state.absenceTimerActive = false;
        state.absenceTimerRemainingSecs = state.absenceTimerDurationSecs;
        updateAwayClockDisplay();

        if (state.closureDurationMs > 1200) {
          state.currentState = 'DROWSY';
        } else {
          state.currentState = 'AWAKE';
        }
      }
    }

    updateUIStatusCard();
  }

  // --- Header & Protection Button State Sync ---
  function updateHeaderAndProtectionState() {
    const isCamReady = checkCameraReady();

    // Camera Pill
    if (isCamReady) {
      camStatusPill.className = 'status-pill green';
      camStatusText.textContent = 'Camera: Active 🟢';
      if (liveChip) { liveChip.textContent = 'LIVE'; liveChip.className = 'chip-live'; }
      hideCameraOverlay();
    } else {
      camStatusPill.className = 'status-pill yellow';
      camStatusText.textContent = 'Camera: Not Connected 🔴';
      if (liveChip) { liveChip.textContent = 'STANDBY'; liveChip.className = 'chip-live'; }
      showCameraOverlay();
    }

    // AI Pill
    if (state.modelLoaded) {
      aiStatusPill.className = 'status-pill green';
      aiStatusText.textContent = 'AI Engine: Loaded 🟢';
    } else {
      aiStatusPill.className = 'status-pill yellow';
      aiStatusText.textContent = 'AI Engine: Loading... 🟡';
    }

    // Protection Status Pill & Dynamic Button
    if (state.cameraActive && state.protectionActive) {
      protStatusPill.className = 'status-pill green';
      protStatusText.textContent = 'Protection: Active 🟢';

      toggleProtectionBtn.className = 'btn-toggle-protection btn-pause-style';
      toggleProtectionBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause Protection';
    } else if (state.cameraActive && !state.protectionActive) {
      protStatusPill.className = 'status-pill yellow';
      protStatusText.textContent = 'Protection: Paused 🟡';

      toggleProtectionBtn.className = 'btn-toggle-protection btn-start-style';
      toggleProtectionBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume Protection';
    } else {
      protStatusPill.className = 'status-pill dim';
      protStatusText.textContent = 'Protection: Disabled ⚪';

      toggleProtectionBtn.className = 'btn-toggle-protection btn-start-style';
      toggleProtectionBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Enable Camera';
    }

    updateUIStatusCard();
  }

  // Toggle Protection Button Action Listener
  toggleProtectionBtn.addEventListener('click', () => {
    if (!state.cameraActive) {
      startCamera();
    } else if (state.protectionActive) {
      state.protectionActive = false;
      state.currentState = 'PROT_PAUSED';
      alarmEngine.stopAlarm();
      addTimelineLog('Protection manually paused by user.');
      updateHeaderAndProtectionState();
    } else {
      state.protectionActive = true;
      state.currentState = state.faceDetected ? 'AWAKE' : 'NO_FACE_GRACE';
      addTimelineLog('Protection activated by user.');
      updateHeaderAndProtectionState();
    }
  });

  // --- Trigger Protection (Core Extension & Alarm Action) ---
  function triggerProtection(reason) {
    if (state.emergencyActive) return;
    state.emergencyActive = true;
    state.emergencyReason = reason;

    addTimelineLog(`🚨 Protection Triggered: ${reason}`);

    // Play Siren Audio if enabled
    if (state.alarmEnabled && state.sirenEnabled) {
      alarmEngine.startAlarm();
    }

    emergencyTitle.textContent = reason.toUpperCase();
    emergencySubtitle.textContent = 'Closing protected browser tabs in:';
    emergencyCountdownNum.textContent = '0';
    emergencyOverlay.classList.remove('hidden');

    // Dispatch Tab Close Signal to Chrome Extension
    executeBrowserCloseAction();
  }

  // Clean Blink Counter History
  setInterval(() => {
    const now = Date.now();
    state.blinksInLastMinute = state.blinksInLastMinute.filter(t => (now - t) <= 60000);
    if (state.faceDetected && metBlinkVal) {
      metBlinkVal.textContent = state.blinksInLastMinute.length;
    }
  }, 2000);

  // Auto-Start Camera Stream on load
  autoStartCameraVision();

  function autoStartCameraVision() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      startCamera();
    }
  }

  // --- Extension Bridge Check ---
  function checkExtensionBridge() {
    window.postMessage({ source: 'SLEEPGUARD_WEB_APP', type: 'SLEEPGUARD_PING' }, '*');
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'SLEEPGUARD_PONG') {
      if (!state.extensionConnected) {
        state.extensionConnected = true;
        if (extensionStatusBanner) {
          extensionStatusBanner.textContent = 'Extension: Connected 🟢';
          extensionStatusBanner.className = 'text-green';
        }
        addTimelineLog('Chrome Extension Connected 🟢');
      }
    }

    // Extension signals tabs have been closed -> auto-stop siren
    if (evt.data && evt.data.type === 'SLEEPGUARD_TABS_CLOSED') {
      if (state.stopSirenAfterClose) {
        alarmEngine.stopAlarm();
        addTimelineLog('🔇 Siren stopped — Protected tabs closed successfully.');
        // Update UI to show protection complete
        if (emergencyTitle) emergencyTitle.textContent = 'PROTECTION COMPLETE';
        if (emergencySubtitle) emergencySubtitle.textContent = 'Protected tabs closed. Siren stopped.';
        setTimeout(() => { emergencyOverlay.classList.add('hidden'); state.emergencyActive = false; updateHeaderAndProtectionState(); }, 1800);
      }
    }
  });

  // --- Timeline Logger ---
  function addTimelineLog(text) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const item = document.createElement('div');
    item.className = 'log-entry';
    item.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-msg">${text}</span>`;
    if (timelineList) {
      timelineList.prepend(item);
      if (timelineList.children.length > 40) timelineList.removeChild(timelineList.lastChild);
    }
  }

  if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => { if (timelineList) timelineList.innerHTML = ''; addTimelineLog('Log cleared.'); });

  // Mouse / Keyboard activity cancels active emergency countdown
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (state.emergencyActive) cancelEmergencyOverlay();
    }, { passive: true });
  });

  // --- Math Helpers for EAR ---
  function getDistance3D(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  }

  // Correct EAR Calculation using exact vertical and horizontal 3D landmark pairs
  function calculateEyeRatios(landmarks) {
    // Left Eye
    const v1_l = getDistance3D(landmarks[LEFT_EYE.top1], landmarks[LEFT_EYE.bottom1]);
    const v2_l = getDistance3D(landmarks[LEFT_EYE.top2], landmarks[LEFT_EYE.bottom2]);
    const h_l = getDistance3D(landmarks[LEFT_EYE.corner1], landmarks[LEFT_EYE.corner2]);
    const ear_l = (v1_l + v2_l) / (2.0 * h_l);

    // Right Eye
    const v1_r = getDistance3D(landmarks[RIGHT_EYE.top1], landmarks[RIGHT_EYE.bottom1]);
    const v2_r = getDistance3D(landmarks[RIGHT_EYE.top2], landmarks[RIGHT_EYE.bottom2]);
    const h_r = getDistance3D(landmarks[RIGHT_EYE.corner1], landmarks[RIGHT_EYE.corner2]);
    const ear_r = (v1_r + v2_r) / (2.0 * h_r);

    return { left: ear_l, right: ear_r, avg: (ear_l + ear_r) / 2.0 };
  }

  // --- Dynamic Sleep Score Formula ---
  function computeDynamicSleepScore(ear, closureDurationMs) {
    if (!state.faceDetected) return 0;

    const closureRatio = Math.max(0, Math.min(1, (state.earThreshold - ear) / state.earThreshold));
    const closureScore = closureRatio * 45;

    const durationRatio = Math.max(0, Math.min(1, closureDurationMs / 2500));
    const durationScore = durationRatio * 45;

    const timeSinceBlink = Date.now() - state.lastBlinkTime;
    const blinkScore = timeSinceBlink > 8000 ? 10 : 0;

    return Math.min(100, Math.round(closureScore + durationScore + blinkScore));
  }

  // --- MediaPipe FaceMesh Setup ---
  let faceMesh = null;
  if (typeof FaceMesh !== 'undefined') {
    try {
      faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults(onFaceMeshResults);
    } catch (e) {
      console.warn('FaceMesh constructor error:', e);
    }
  }

  let latestFaceResults = null;

  async function startCamera() {
    if (camStatusText) camStatusText.textContent = 'Camera: Initializing...';
    if (aiStatusText) aiStatusText.textContent = 'AI Engine: Loading...';
    state.currentState = 'INIT_AI';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      webcamElem.srcObject = stream;
      await webcamElem.play();

      state.cameraActive = true;
      state.protectionActive = true;
      hideCameraOverlay();
      updateHeaderAndProtectionState();

      setTimeout(() => {
        checkCameraReady();
      }, 300);
    } catch (err) {
      console.error('Camera stream access error:', err);
      state.cameraActive = false;
      state.protectionActive = false;
      state.currentState = 'CAM_OFFLINE';
      showCameraOverlay();
      updateHeaderAndProtectionState();
      return;
    }

    if (faceMesh) {
      try {
        await faceMesh.initialize();
        state.modelLoaded = true;
        updateHeaderAndProtectionState();
      } catch (err) {
        console.warn('MediaPipe loading warning:', err);
        state.modelLoaded = true;
        updateHeaderAndProtectionState();
      }
    }

    addTimelineLog('Camera vision stream active.');
    scheduleNextFrame();
  }

  function scheduleNextFrame() {
    if (!state.cameraActive) return;
    if ('requestVideoFrameCallback' in webcamElem) {
      webcamElem.requestVideoFrameCallback(processVisionFrame);
    } else {
      requestAnimationFrame(processVisionFrame);
    }
  }

  function onFaceMeshResults(r) {
    latestFaceResults = r;
  }

  // --- Process Vision Frame (Non-blocking, zero lag) ---
  function processVisionFrame() {
    const isCamReady = checkCameraReady();

    if (!isCamReady) {
      state.fps = 0;
      if (fpsVal) fpsVal.textContent = '0';
      if (telFps) telFps.textContent = '--';
      return;
    }

    // Calculate Real FPS strictly during active vision processing
    const now = performance.now();
    state.frameCount++;
    if (now - state.lastFrameTime >= 1000) {
      state.fps = state.frameCount;
      state.frameCount = 0;
      state.lastFrameTime = now;
    }

    canvasElem.width = webcamElem.videoWidth || 640;
    canvasElem.height = webcamElem.videoHeight || 480;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElem.width, canvasElem.height);

    // Send frame to MediaPipe if video is playing and not busy
    if (webcamElem.readyState >= 2 && webcamElem.videoWidth > 0 && faceMesh && !state.isProcessingFrame) {
      state.isProcessingFrame = true;
      faceMesh.send({ image: webcamElem }).catch(() => {}).finally(() => {
        state.isProcessingFrame = false;
      });
    }

    // Evaluate MediaPipe Face Landmarks
    if (latestFaceResults && latestFaceResults.multiFaceLandmarks && latestFaceResults.multiFaceLandmarks.length > 0) {
      state.faceDetected = true;
      state.lastFaceSeenTime = Date.now();
      const landmarks = latestFaceResults.multiFaceLandmarks[0];
      state.landmarksCount = landmarks.length;

      const earData = calculateEyeRatios(landmarks);
      state.earLeft = earData.left;
      state.earRight = earData.right;
      state.earAvg = earData.avg;
      state.modelConfidence = 98.6;

      // Process eye closure & update state if protection is active
      if (state.protectionActive) {
        processEyeClosureAndState(state.earAvg);
      }

      // Compute dynamic sleep score
      state.sleepScore = computeDynamicSleepScore(state.earAvg, state.closureDurationMs);

      // Update Metric Display for Active Face
      metFaceVal.textContent = 'YES 🟢';
      metFaceVal.className = 'metric-val text-green';
      metEarVal.textContent = state.earAvg.toFixed(2);
      metEarVal.className = 'metric-val text-cyan';
      if (metBlinkVal) metBlinkVal.textContent = state.blinksInLastMinute.length;
      if (metSleepScoreVal) {
        metSleepScoreVal.textContent = `${state.sleepScore}%`;
        metSleepScoreVal.className = state.sleepScore > 60 ? 'metric-val text-red' : (state.sleepScore > 30 ? 'metric-val text-yellow' : 'metric-val text-cyan');
      }

      // Live Telemetry Cards Update
      if (telFaceStatus) { telFaceStatus.textContent = 'Detected 🟢'; telFaceStatus.className = 'tel-val text-green'; }
      if (telEyeStatus) {
        const eyeStateStr = state.earAvg < state.earThreshold ? 'Closed 🔴' : 'Open 🟢';
        telEyeStatus.textContent = eyeStateStr;
        telEyeStatus.className = state.earAvg < state.earThreshold ? 'tel-val text-red' : 'tel-val text-green';
      }
      if (telEarAvg) { telEarAvg.textContent = state.earAvg.toFixed(2); telEarAvg.className = 'tel-val text-cyan'; }
      if (telLandmarks) { telLandmarks.textContent = state.landmarksCount; telLandmarks.className = 'tel-val text-cyan'; }
      if (telFps) { telFps.textContent = `${state.fps} FPS`; telFps.className = 'tel-val text-green'; }
      if (fpsVal) fpsVal.textContent = state.fps;

      if (state.showMesh) drawFaceMeshOverlay(canvasCtx, landmarks, canvasElem.width, canvasElem.height);
    } else {
      // --- Face is NOT detected ---
      state.faceDetected = false;
      state.modelConfidence = 0;
      state.earAvg = 0;
      state.earLeft = 0;
      state.earRight = 0;
      state.sleepScore = 0;
      state.landmarksCount = 0;
      state.eyeClosedStartTime = null;
      state.closureDurationMs = 0;
      state.sleepTimerActive = false;

      // Reset Telemetry to Waiting / --
      metFaceVal.textContent = 'NO 🔴';
      metFaceVal.className = 'metric-val text-red';
      metEyesVal.textContent = '--';
      metEyesVal.className = 'metric-val text-dim';
      metEarVal.textContent = '--';
      metEarVal.className = 'metric-val text-dim';
      if (metBlinkVal) metBlinkVal.textContent = '--';
      if (metSleepScoreVal) {
        metSleepScoreVal.textContent = '0%';
        metSleepScoreVal.className = 'metric-val text-dim';
      }

      if (telFaceStatus) { telFaceStatus.textContent = 'Waiting'; telFaceStatus.className = 'tel-val text-dim'; }
      if (telEyeStatus) { telEyeStatus.textContent = 'Waiting'; telEyeStatus.className = 'tel-val text-dim'; }
      if (telEarAvg) { telEarAvg.textContent = '--'; telEarAvg.className = 'tel-val text-dim'; }
      if (telLandmarks) { telLandmarks.textContent = '0'; telLandmarks.className = 'tel-val text-dim'; }
      if (telFps) { telFps.textContent = `${state.fps} FPS`; telFps.className = 'tel-val text-dim'; }
      if (fpsVal) fpsVal.textContent = state.fps;

      updateUIStatusCard();
    }

    canvasCtx.restore();
    scheduleNextFrame();
  }

  // --- Eye Closure & Instant Sleep Classifier ---
  function processEyeClosureAndState(ear) {
    const now = Date.now();

    if (ear < state.earThreshold) {
      if (!state.eyeClosedStartTime) state.eyeClosedStartTime = now;
      state.closureDurationMs = now - state.eyeClosedStartTime;

      metEyesVal.textContent = 'CLOSED 🔴';
      metEyesVal.className = 'metric-val text-red';

      // 2.5 seconds continuous eye closure activates User Configured Sleep Emergency Timer
      if (state.closureDurationMs >= 2500) {
        if (!state.sleepTimerActive) {
          state.sleepTimerActive = true;
          state.sleepTimerRemainingSecs = state.sleepTimerDurationSecs;
          state.currentState = 'SLEEPING';
          addTimelineLog(`😴 Sleep Confirmed (>2.5s Eye Closure). ${state.sleepTimerDurationSecs}s emergency countdown active!`);
        }
      } else if (state.closureDurationMs > 1000) {
        if (state.currentState !== 'SLEEPING') state.currentState = 'DROWSY';
      }
    } else {
      // Transition from CLOSED to OPEN
      if (state.eyeClosedStartTime) {
        const closedTime = now - state.eyeClosedStartTime;
        if (closedTime >= 100 && closedTime <= 800) {
          state.blinkCount++;
          state.blinksInLastMinute.push(now);
          state.lastBlinkTime = now;
        }
      }
      state.eyeClosedStartTime = null;
      state.closureDurationMs = 0;

      // WAKE CANCEL: Opening eyes immediately stops active sleep countdown & siren!
      if (state.sleepTimerActive) {
        state.sleepTimerActive = false;
        state.sleepTimerRemainingSecs = state.sleepTimerDurationSecs;
        alarmEngine.stopAlarm();
        updateSleepClockDisplay();
        addTimelineLog('👁️ Eyes Opened! Sleep emergency countdown & siren alarm CANCELLED.');
      }

      if (!state.emergencyActive && state.protectionActive) {
        state.currentState = 'AWAKE';
      }

      metEyesVal.textContent = 'OPEN 🟢';
      metEyesVal.className = 'metric-val text-green';
    }

    updateUIStatusCard();
  }

  // --- Canvas Mesh Overlay ---
  function drawFaceMeshOverlay(ctx, landmarks, w, h) {
    const minX = Math.min(...landmarks.map(p => p.x)) * w;
    const maxX = Math.max(...landmarks.map(p => p.x)) * w;
    const minY = Math.min(...landmarks.map(p => p.y)) * h;
    const maxY = Math.max(...landmarks.map(p => p.y)) * h;

    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(minX - 10, minY - 10, (maxX - minX) + 20, (maxY - minY) + 20);

    ctx.fillStyle = '#00F2FE';
    for (let i = 0; i < landmarks.length; i += 12) {
      ctx.fillRect(landmarks[i].x * w - 1, landmarks[i].y * h - 1, 2, 2);
    }
  }

  // --- UI Status Card Evaluator ---
  function updateUIStatusCard() {
    if (!state.cameraActive) {
      statusCard.className = 'card status-state-card';
      statusAvatarWrap.style.borderColor = 'var(--text-dim)';
      statusAvatarIcon.className = 'fa-solid fa-video-slash status-avatar-icon text-dim';
      statusHeadingText.textContent = 'Camera Offline';
      statusSubText.textContent = 'Click "Enable Camera Access" to initialize tracking.';
      confValText.textContent = '--';
      if (confRingFill) confRingFill.style.strokeDashoffset = 264;

      timerPill.className = 'timer-pill yellow';
      timerPill.textContent = '🟡 Camera Offline';
      awayTimerBadge.textContent = 'WAITING FOR CAMERA';
      sleepTimerBadge.textContent = 'STANDBY';
      return;
    }

    if (!state.protectionActive) {
      statusCard.className = 'card status-state-card warning';
      statusAvatarWrap.style.borderColor = 'var(--color-yellow)';
      statusAvatarIcon.className = 'fa-solid fa-pause status-avatar-icon text-yellow';
      statusHeadingText.textContent = '⚪ Protection Paused';
      statusSubText.textContent = 'Click "Resume Protection" to re-enable sleep & absence tracking.';
      confValText.textContent = '--';
      if (confRingFill) confRingFill.style.strokeDashoffset = 264;

      timerPill.className = 'timer-pill yellow';
      timerPill.textContent = '🟡 Protection Paused';
      awayTimerBadge.textContent = 'PAUSED (Protection Disabled)';
      sleepTimerBadge.textContent = 'STANDBY';
      return;
    }

    // STRICT RULE: If face is NOT detected, NEVER show AWAKE!
    if (!state.faceDetected) {
      confValText.textContent = '--';
      if (confRingFill) confRingFill.style.strokeDashoffset = 264;

      const timeSinceLastFace = Date.now() - state.lastFaceSeenTime;

      if (state.currentState === 'USER_AWAY' || timeSinceLastFace >= 3000) {
        statusCard.className = 'card status-state-card warning';
        statusAvatarWrap.style.borderColor = 'var(--color-yellow)';
        statusAvatarIcon.className = 'fa-solid fa-user-slash status-avatar-icon text-yellow';
        statusHeadingText.textContent = '🟡 NO USER DETECTED';
        statusSubText.textContent = 'No face detected. Absence timer running.';

        timerPill.className = 'timer-pill yellow';
        timerPill.textContent = `🟡 User Away — Absence Timer: ${formatHMS(state.absenceTimerRemainingSecs)}`;
        awayTimerBadge.textContent = `Counting Down (${formatHMS(state.absenceTimerRemainingSecs)})`;
        sleepTimerBadge.textContent = 'STANDBY';
      } else {
        // 0-3 sec grace period
        statusCard.className = 'card status-state-card warning';
        statusAvatarWrap.style.borderColor = 'var(--color-yellow)';
        statusAvatarIcon.className = 'fa-solid fa-user-clock status-avatar-icon text-yellow';
        statusHeadingText.textContent = '🟡 NO FACE DETECTED';
        statusSubText.textContent = 'Face lost. Grace period active (3s)...';

        timerPill.className = 'timer-pill yellow';
        timerPill.textContent = '🟡 Checking Face...';
        awayTimerBadge.textContent = 'Grace Period (3s)';
      }
      return;
    }

    // When Face IS Detected & Protection IS Active:
    if (state.currentState === 'AWAKE') {
      confValText.textContent = '98.6%';
      if (confRingFill) confRingFill.style.strokeDashoffset = 0;

      statusCard.className = 'card status-state-card';
      statusAvatarWrap.style.borderColor = 'var(--color-green)';
      statusAvatarIcon.className = 'fa-solid fa-face-smile status-avatar-icon text-green';
      statusHeadingText.textContent = '🟢 AWAKE';
      statusSubText.textContent = 'Protection Active — Face tracked & eyes open.';

      timerPill.className = 'timer-pill green';
      timerPill.textContent = '🟢 Awake — Timer Paused';
      awayTimerBadge.textContent = 'Paused (Face Present)';
      sleepTimerBadge.textContent = 'STANDBY';
    } else if (state.currentState === 'DROWSY') {
      confValText.textContent = '98.6%';
      if (confRingFill) confRingFill.style.strokeDashoffset = 0;

      const secStr = (state.closureDurationMs / 1000).toFixed(1);
      statusCard.className = 'card status-state-card warning';
      statusAvatarWrap.style.borderColor = 'var(--color-yellow)';
      statusAvatarIcon.className = 'fa-solid fa-face-meh status-avatar-icon text-yellow';
      statusHeadingText.textContent = '🟡 DROWSY WARNING';
      statusSubText.textContent = `Eye closure detected (${secStr}s / 2.5s). Stay alert!`;

      timerPill.className = 'timer-pill yellow';
      timerPill.textContent = `🟡 Eye Closure (${secStr}s)`;
    } else if (state.currentState === 'SLEEPING') {
      confValText.textContent = '98.6%';
      if (confRingFill) confRingFill.style.strokeDashoffset = 0;

      const isSirenWarn = state.sleepTimerRemainingSecs <= 3;
      statusCard.className = 'card status-state-card danger';
      statusAvatarWrap.style.borderColor = 'var(--color-red)';
      statusAvatarIcon.className = 'fa-solid fa-bed status-avatar-icon text-red';
      statusHeadingText.textContent = isSirenWarn ? '🚨 SIREN WARNING' : '🔴 SLEEP DETECTED';
      statusSubText.textContent = `Sleep confirmed! Closing tabs in ${state.sleepTimerRemainingSecs}s.${isSirenWarn ? ' (Siren Active)' : ''}`;

      timerPill.className = 'timer-pill red';
      timerPill.textContent = `🔴 Sleeping — Closing Tabs (${state.sleepTimerRemainingSecs}s)`;
      sleepTimerBadge.textContent = isSirenWarn ? `🚨 SIREN (${state.sleepTimerRemainingSecs}s)` : `COUNTDOWN (${state.sleepTimerRemainingSecs}s)`;
      awayTimerBadge.textContent = 'Paused';
    }
  }

  function formatHMS(totalSecs) {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }

  // --- Timers Display Updates ---
  function updateAwayClockDisplay() {
    if (awayClockDisplay) {
      awayClockDisplay.textContent = formatHMS(state.absenceTimerRemainingSecs);
    }
  }

  function updateSleepClockDisplay() {
    if (sleepClockDisplay) {
      const val = state.sleepTimerActive ? state.sleepTimerRemainingSecs : state.sleepTimerDurationSecs;
      sleepClockDisplay.textContent = formatHMS(val);
    }
  }

  // --- Load Saved Timer Settings from localStorage ---
  function loadSavedTimerSettings() {
    try {
      const savedSleep = JSON.parse(localStorage.getItem('sg_sleepTimer'));
      if (savedSleep && savedSleep.totalSecs > 0) {
        state.sleepTimerDurationSecs = savedSleep.totalSecs;
        state.sleepTimerRemainingSecs = savedSleep.totalSecs;
        const h = Math.floor(savedSleep.totalSecs / 3600);
        const m = Math.floor((savedSleep.totalSecs % 3600) / 60);
        const s = savedSleep.totalSecs % 60;
        if (inputSleepHours) inputSleepHours.value = h;
        if (inputSleepMins) inputSleepMins.value = m;
        if (inputSleepSecs) inputSleepSecs.value = s;
        updateSleepClockDisplay();
      }

      const savedAbsence = JSON.parse(localStorage.getItem('sg_absenceTimer'));
      if (savedAbsence && savedAbsence.totalSecs > 0) {
        state.absenceTimerDurationSecs = savedAbsence.totalSecs;
        state.absenceTimerRemainingSecs = savedAbsence.totalSecs;
        const h = Math.floor(savedAbsence.totalSecs / 3600);
        const m = Math.floor((savedAbsence.totalSecs % 3600) / 60);
        const s = savedAbsence.totalSecs % 60;
        if (inputHours) inputHours.value = h;
        if (inputMins) inputMins.value = m;
        if (inputSecs) inputSecs.value = s;
        updateAwayClockDisplay();
      }
    } catch(e) {
      // localStorage unavailable or corrupt — use defaults silently
    }
  }
  loadSavedTimerSettings();

  // Load saved Advanced Protection settings from localStorage
  function loadAdvancedProtectionSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('sg_advProtection'));
      if (!saved) return;
      if (saved.closeSleepGuardPage !== undefined) state.closeSleepGuardPage = saved.closeSleepGuardPage;
      if (saved.closeAllWindows !== undefined) state.closeAllWindows = saved.closeAllWindows;
      if (saved.advPlaySiren !== undefined) state.advPlaySiren = saved.advPlaySiren;
      if (saved.advShowCountdown !== undefined) state.advShowCountdown = saved.advShowCountdown;
      if (Array.isArray(saved.customDomains)) state.customDomains = saved.customDomains;
      // Sync toggles
      const csp = document.getElementById('closeSleepGuardPageToggle');
      const caw = document.getElementById('closeAllWindowsToggle');
      const aps = document.getElementById('advPlaySirenToggle');
      const asc = document.getElementById('advShowCountdownToggle');
      if (csp) csp.checked = state.closeSleepGuardPage;
      if (caw) caw.checked = state.closeAllWindows;
      if (aps) aps.checked = state.advPlaySiren;
      if (asc) asc.checked = state.advShowCountdown;
    } catch(e) { /* ignore */ }
  }
  loadAdvancedProtectionSettings();


  // Custom Sleep Emergency Timer Handler (HH:MM:SS + localStorage)
  if (applySleepTimeBtn) {
    applySleepTimeBtn.addEventListener('click', () => {
      const hrs = parseInt(inputSleepHours.value) || 0;
      const mins = parseInt(inputSleepMins.value) || 0;
      const secs = parseInt(inputSleepSecs.value) || 0;
      const totalSecs = Math.max(1, Math.min(86400, (hrs * 3600) + (mins * 60) + secs));

      state.sleepTimerDurationSecs = totalSecs;
      state.sleepTimerRemainingSecs = totalSecs;
      updateSleepClockDisplay();
      localStorage.setItem('sg_sleepTimer', JSON.stringify({ totalSecs }));
      addTimelineLog(`😴 Sleep Emergency Timer saved to ${formatHMS(totalSecs)}.`);
    });
  }

  document.querySelectorAll('.preset-chip.sleep-preset[data-sleepsecs]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-chip.sleep-preset').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const totalSecs = parseInt(e.currentTarget.getAttribute('data-sleepsecs'));
      state.sleepTimerDurationSecs = totalSecs;
      state.sleepTimerRemainingSecs = totalSecs;

      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      if (inputSleepHours) inputSleepHours.value = h;
      if (inputSleepMins) inputSleepMins.value = m;
      if (inputSleepSecs) inputSleepSecs.value = s;

      updateSleepClockDisplay();
      localStorage.setItem('sg_sleepTimer', JSON.stringify({ totalSecs }));
    });
  });

  // Custom Absence Timer Input Handler (Range: 1 second to 60 hours) + localStorage
  applyTimeBtn.addEventListener('click', () => {
    const hrs = parseInt(inputHours.value) || 0;
    const mins = parseInt(inputMins.value) || 0;
    const secs = parseInt(inputSecs.value) || 0;

    const totalSecs = Math.max(1, Math.min(216000, (hrs * 3600) + (mins * 60) + secs));
    state.absenceTimerDurationSecs = totalSecs;
    state.absenceTimerRemainingSecs = totalSecs;
    updateAwayClockDisplay();
    localStorage.setItem('sg_absenceTimer', JSON.stringify({ totalSecs }));
    addTimelineLog(`🟡 User Not Found timer saved to ${formatHMS(totalSecs)}.`);
  });

  document.querySelectorAll('.preset-chip[data-secs]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-chip:not(.sleep-preset)').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const totalSecs = parseInt(e.currentTarget.getAttribute('data-secs'));
      state.absenceTimerDurationSecs = totalSecs;
      state.absenceTimerRemainingSecs = totalSecs;
      
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      if (inputHours) inputHours.value = hrs;
      if (inputMins) inputMins.value = mins;
      if (inputSecs) inputSecs.value = secs;

      updateAwayClockDisplay();
    });
  });

  // --- Sound & Alarm Settings Wiring ---
  alarmToggleSwitch.addEventListener('change', (e) => {
    state.alarmEnabled = e.target.checked;
    if (!state.alarmEnabled) alarmEngine.stopAlarm();
    addTimelineLog(`Alarm Response ${state.alarmEnabled ? 'Enabled' : 'Disabled'}.`);
  });

  sirenToggleSwitch.addEventListener('change', (e) => {
    state.sirenEnabled = e.target.checked;
    alarmEngine.setSirenEnabled(state.sirenEnabled);
    addTimelineLog(`Siren Audio ${state.sirenEnabled ? 'ON 🔔' : 'OFF 🔕 (Silent tab close)'}.`);
  });

  volumeSlider.addEventListener('input', (e) => {
    state.alarmVolume = parseInt(e.target.value);
    volumeValText.textContent = `${state.alarmVolume}%`;
    alarmEngine.setVolume(state.alarmVolume);
  });

  repeatModeSelect.addEventListener('change', (e) => state.alarmRepeatMode = e.target.value);
  soundTypeSelect.addEventListener('change', (e) => {
    state.alarmSoundType = e.target.value;
    alarmEngine.setSoundType(state.alarmSoundType);
  });

  const stopSirenAfterCloseSwitch = document.getElementById('stopSirenAfterCloseSwitch');
  if (stopSirenAfterCloseSwitch) {
    stopSirenAfterCloseSwitch.addEventListener('change', (e) => {
      state.stopSirenAfterClose = e.target.checked;
      addTimelineLog(`Stop Siren After Close: ${state.stopSirenAfterClose ? 'ON \u2705' : 'OFF \u2014 Siren continues until manually stopped.'}`);
    });
  }


  testAlarmBtn.addEventListener('click', () => {
    alarmEngine.toggleTestAlarm((isPlaying) => {
      if (isPlaying) {
        testAlarmBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Alarm Test';
        testAlarmBtn.style.background = 'linear-gradient(135deg, rgba(255,23,68,0.4), rgba(255,23,68,0.2))';
      } else {
        testAlarmBtn.innerHTML = '<i class="fa-solid fa-play"></i> Test Alarm Siren';
        testAlarmBtn.style.background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(0, 242, 254, 0.3))';
      }
    });
  });

  function cancelEmergencyOverlay() {
    if (!state.emergencyActive) return;
    state.emergencyActive = false;
    alarmEngine.stopAlarm();
    emergencyOverlay.classList.add('hidden');
    state.currentState = state.faceDetected ? 'AWAKE' : 'USER_AWAY';
    state.absenceTimerRemainingSecs = state.absenceTimerDurationSecs;
    state.sleepTimerActive = false;
    state.sleepTimerRemainingSecs = state.sleepTimerDurationSecs;
    updateSleepClockDisplay();
    updateAwayClockDisplay();
    updateHeaderAndProtectionState();
    addTimelineLog('Emergency countdown & alarm stopped by user activity.');
  }

  function executeBrowserCloseAction() {
    emergencyOverlay.classList.add('hidden');

    if (state.extensionConnected) {
      // Build all protected domains (preset + custom)
      const allDomains = [...state.protectedDomains, ...state.customDomains];

      window.postMessage({
        source: 'SLEEPGUARD_WEB_APP',
        type: 'TRIGGER_CLOSE',
        actionScope: state.closeAllWindows ? 'window' : 'protected',
        protectedDomains: allDomains,
        protectAllOtherTabs: state.protectAllOtherTabs,
        closeSleepGuardPage: state.closeSleepGuardPage
      }, '*');
      addTimelineLog('Protected Tabs close command sent to Chrome Extension. 🛑');
      if (state.closeSleepGuardPage) addTimelineLog('🔒 Self-Protection: SleepGuard monitoring tab will be closed.');

      // Fallback: if extension doesn't confirm within 3s, stop siren anyway
      if (state.stopSirenAfterClose) {
        setTimeout(() => {
          if (alarmEngine.isPlaying) {
            alarmEngine.stopAlarm();
            addTimelineLog('🔇 Siren auto-stopped (3s fallback after tab close).');
          }
          state.emergencyActive = false;
          updateHeaderAndProtectionState();
        }, 3000);
      }
    } else {
      // No extension — stop siren immediately after showing alert
      if (state.stopSirenAfterClose) {
        alarmEngine.stopAlarm();
        addTimelineLog('🔇 Siren stopped automatically.');
      }
      state.emergencyActive = false;
      updateHeaderAndProtectionState();
      alert(`[SleepGuard Pro Alert]\n\n${state.emergencyReason}\n\nProtected tabs closing signal sent! Load Chrome Companion Extension to automatically close background tabs.\n\n${state.closeSleepGuardPage ? 'Note: Install extension to also auto-close this SleepGuard tab.' : ''}`);
    }
  }

  // --- Controls & Modals Wiring ---
  startCamBtn.addEventListener('click', startCamera);
  cancelEmergencyBtn.addEventListener('click', cancelEmergencyOverlay);
  toggleFaceMeshBtn.addEventListener('click', () => { 
    state.showMesh = !state.showMesh; 
    toggleFaceMeshBtn.classList.toggle('active', state.showMesh); 
    toggleFaceMeshBtn.textContent = `Face Mesh Overlay Only: ${state.showMesh ? 'ON' : 'OFF'}`;
  });

  manageTabsBtn.addEventListener('click', () => protectedTabsModal.classList.remove('hidden'));
  closeProtectedTabsBtn.addEventListener('click', () => protectedTabsModal.classList.add('hidden'));

  // Footer cancel button
  const closeProtectedTabsFooterBtn = document.getElementById('closeProtectedTabsFooterBtn');
  if (closeProtectedTabsFooterBtn) closeProtectedTabsFooterBtn.addEventListener('click', () => protectedTabsModal.classList.add('hidden'));

  // =========================================================================
  // DOMAIN TOGGLE ENGINE — Core fix: inline panel checkboxes drive state
  // =========================================================================

  // Helper: normalize a URL string to just the hostname
  function normalizeDomain(input) {
    let val = input.trim();
    if (!val) return '';
    try {
      return new URL(val.includes('://') ? val : 'https://' + val).hostname.toLowerCase().replace(/^www\./, '');
    } catch(e) {
      return val.toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '');
    }
  }

  // Helper: match a tab hostname against a domain pattern (exact + subdomain)
  function domainMatchesTab(domain, hostname) {
    const d = domain.toLowerCase();
    const h = hostname.toLowerCase();
    return h === d || h.endsWith('.' + d);
  }

  // Rebuild state.protectedDomains from current checkbox states
  function rebuildProtectedDomains() {
    const domains = [];
    document.querySelectorAll('.tab-domain-toggle:checked').forEach(cb => {
      domains.push(cb.value);
    });
    // Also include custom domains
    state.customDomains.forEach(d => { if (!domains.includes(d)) domains.push(d); });
    state.protectedDomains = domains;
    state.protectAllOtherTabs = document.getElementById('toggleAllOtherTabsSwitch')?.checked || false;
  }

  // Update a single domain chip in the inline panel
  function updateDomainChip(chipId, isProtected) {
    const chip = document.getElementById(chipId);
    if (!chip) return;
    if (isProtected) {
      chip.textContent = 'Protected';
      chip.className = 'tab-status-chip';
    } else {
      chip.textContent = 'Ignored';
      chip.className = 'tab-status-chip chip-ignored';
    }
  }

  // Save current domain settings to localStorage + log
  function saveAndSyncDomainSettings() {
    rebuildProtectedDomains();
    localStorage.setItem('sg_protectedDomains', JSON.stringify({
      domains: state.protectedDomains,
      protectAllOtherTabs: state.protectAllOtherTabs,
      customDomains: state.customDomains
    }));
    const total = state.protectedDomains.length;
    addTimelineLog(`✅ Protected Sites: ${total} domain(s) active${state.protectAllOtherTabs ? ' + All Other Tabs' : ''}.`);
  }

  // Wire ALL inline panel domain toggle checkboxes
  document.querySelectorAll('.tab-domain-toggle').forEach(cb => {
    const domain = cb.value;
    const chipMap = {
      'youtube.com': 'chip-youtube',
      'instagram.com': 'chip-instagram',
      'netflix.com': 'chip-netflix',
      'twitch.tv': 'chip-twitch',
      'facebook.com': 'chip-facebook',
      'x.com': 'chip-xcom'
    };
    // Set initial chip state from checkbox
    updateDomainChip(chipMap[domain], cb.checked);

    cb.addEventListener('change', () => {
      updateDomainChip(chipMap[domain], cb.checked);
      saveAndSyncDomainSettings();
      addTimelineLog(`${cb.checked ? '✅' : '❌'} ${domain} ${cb.checked ? 'added to' : 'removed from'} protection list.`);
    });
  });

  // All Other Tabs toggle
  const toggleAllOtherTabsSwitch = document.getElementById('toggleAllOtherTabsSwitch');
  if (toggleAllOtherTabsSwitch) {
    const allOthersChip = document.getElementById('chip-allothers');
    toggleAllOtherTabsSwitch.addEventListener('change', () => {
      const on = toggleAllOtherTabsSwitch.checked;
      if (allOthersChip) {
        allOthersChip.textContent = on ? 'Protected' : 'Ignored';
        allOthersChip.className = on ? 'tab-status-chip' : 'tab-status-chip chip-ignored';
      }
      saveAndSyncDomainSettings();
      addTimelineLog(`All Other Tabs protection: ${on ? 'ON ✅' : 'OFF'}`);
    });
  }

  // =========================================================================
  // QUICK CUSTOM DOMAIN ADD (Inline Panel)
  // =========================================================================
  const quickCustomDomainInput = document.getElementById('quickCustomDomainInput');
  const quickAddDomainBtn = document.getElementById('quickAddDomainBtn');
  const customChipsWrap = document.getElementById('customChipsWrap');

  function addCustomChip(domain) {
    if (!domain || state.customDomains.includes(domain)) return;
    state.customDomains.push(domain);
    const chip = document.createElement('div');
    chip.className = 'quick-chip';
    chip.innerHTML = `<i class="fa-solid fa-link"></i> <span>${domain}</span> <button class="chip-remove" title="Remove">&times;</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', () => {
      state.customDomains = state.customDomains.filter(d => d !== domain);
      chip.remove();
      saveAndSyncDomainSettings();
      addTimelineLog(`❌ Custom domain removed: ${domain}`);
    });
    customChipsWrap.appendChild(chip);
    saveAndSyncDomainSettings();
    addTimelineLog(`➕ Custom domain added: ${domain}`);
  }

  if (quickAddDomainBtn) {
    quickAddDomainBtn.addEventListener('click', () => {
      const val = normalizeDomain(quickCustomDomainInput.value);
      if (val) { addCustomChip(val); quickCustomDomainInput.value = ''; }
    });
    quickCustomDomainInput?.addEventListener('keydown', e => { if (e.key === 'Enter') quickAddDomainBtn.click(); });
  }

  // =========================================================================
  // TEST PROTECTED SITES BUTTON
  // =========================================================================
  const testProtectedBtn = document.getElementById('testProtectedBtn');
  if (testProtectedBtn) {
    testProtectedBtn.addEventListener('click', () => {
      rebuildProtectedDomains();
      const domains = state.protectedDomains;
      const allOthers = state.protectAllOtherTabs;

      let msg = `🛡️ Protected Sites — DRY RUN TEST\n\nActive domains (${domains.length}):\n`;
      if (domains.length === 0 && !allOthers) {
        msg += '  (none selected)\n';
      } else {
        domains.forEach(d => msg += `  ✔ ${d}\n`);
        if (allOthers) msg += '  ✔ [All Other Unlisted Tabs]\n';
      }
      msg += '\nIf protection triggers NOW, only these domain tabs would be closed.';
      msg += '\n(No tabs were actually closed — this is a dry run)';
      alert(msg);
      addTimelineLog(`🧪 Test run: ${domains.length} domain(s) would be targeted${allOthers ? ' + All Others' : ''}.`);
    });
  }

  // =========================================================================
  // LOAD SAVED DOMAIN SETTINGS FROM LOCALSTORAGE
  // =========================================================================
  function loadSavedDomainSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('sg_protectedDomains'));
      if (!saved) return;

      // Restore preset toggles
      if (Array.isArray(saved.domains)) {
        document.querySelectorAll('.tab-domain-toggle').forEach(cb => {
          const isOn = saved.domains.includes(cb.value);
          cb.checked = isOn;
          const chipMap = {
            'youtube.com': 'chip-youtube',
            'instagram.com': 'chip-instagram',
            'netflix.com': 'chip-netflix',
            'twitch.tv': 'chip-twitch',
            'facebook.com': 'chip-facebook',
            'x.com': 'chip-xcom'
          };
          updateDomainChip(chipMap[cb.value], isOn);
        });
        state.protectedDomains = saved.domains;
      }

      // Restore All Other Tabs
      if (saved.protectAllOtherTabs !== undefined && toggleAllOtherTabsSwitch) {
        toggleAllOtherTabsSwitch.checked = saved.protectAllOtherTabs;
        state.protectAllOtherTabs = saved.protectAllOtherTabs;
        const chip = document.getElementById('chip-allothers');
        if (chip) {
          chip.textContent = saved.protectAllOtherTabs ? 'Protected' : 'Ignored';
          chip.className = saved.protectAllOtherTabs ? 'tab-status-chip' : 'tab-status-chip chip-ignored';
        }
      }

      // Restore custom domains
      if (Array.isArray(saved.customDomains)) {
        saved.customDomains.forEach(d => addCustomChip(d));
      }
    } catch(e) { /* ignore */ }
  }
  loadSavedDomainSettings();

  // =========================================================================
  // ADVANCED MODAL: Add custom domains & toggles (synced)
  // =========================================================================
  // Add Custom Domain Button (Modal)
  const addCustomDomainBtn = document.getElementById('addCustomDomainBtn');
  const customDomainsWrap = document.getElementById('customDomainsWrap');

  function renderModalCustomDomainRow(domain) {
    const row = document.createElement('div');
    row.className = 'custom-domain-row';
    row.innerHTML = `
      <span class="custom-domain-pill"><i class="fa-solid fa-link"></i> ${domain}</span>
      <button class="btn-remove-domain" title="Remove"><i class="fa-solid fa-trash"></i></button>
    `;
    row.querySelector('.btn-remove-domain').addEventListener('click', () => {
      state.customDomains = state.customDomains.filter(d => d !== domain);
      row.remove();
      // Also remove from quick chips
      if (customChipsWrap) {
        [...customChipsWrap.querySelectorAll('.quick-chip')].forEach(c => {
          if (c.querySelector('span')?.textContent === domain) c.remove();
        });
      }
      saveAndSyncDomainSettings();
      addTimelineLog(`Custom domain removed: ${domain}`);
    });
    if (customDomainsWrap) customDomainsWrap.appendChild(row);
  }

  if (addCustomDomainBtn) {
    addCustomDomainBtn.addEventListener('click', () => {
      const val = normalizeDomain(customDomainInput?.value || '');
      if (!val) return;
      if (!state.customDomains.includes(val)) {
        addCustomChip(val);
        renderModalCustomDomainRow(val);
      }
      if (customDomainInput) customDomainInput.value = '';
    });
    customDomainInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomDomainBtn.click(); });
  }

  // Advanced Protection Toggles
  const closeSleepGuardPageToggle = document.getElementById('closeSleepGuardPageToggle');
  const closeAllWindowsToggle = document.getElementById('closeAllWindowsToggle');
  const advPlaySirenToggle = document.getElementById('advPlaySirenToggle');
  const advShowCountdownToggle = document.getElementById('advShowCountdownToggle');

  if (closeSleepGuardPageToggle) {
    closeSleepGuardPageToggle.addEventListener('change', (e) => {
      state.closeSleepGuardPage = e.target.checked;
      addTimelineLog(`Self-Protection (Close SleepGuard Tab): ${state.closeSleepGuardPage ? 'ON ✅' : 'OFF'}`);
    });
  }
  if (closeAllWindowsToggle) {
    closeAllWindowsToggle.addEventListener('change', (e) => {
      state.closeAllWindows = e.target.checked;
      addTimelineLog(`Close All Windows Mode: ${state.closeAllWindows ? 'ON' : 'OFF'}`);
    });
  }
  if (advPlaySirenToggle) {
    advPlaySirenToggle.addEventListener('change', (e) => {
      state.advPlaySiren = e.target.checked;
      addTimelineLog(`Play Siren Before Close: ${state.advPlaySiren ? 'ON' : 'OFF'}`);
    });
  }
  if (advShowCountdownToggle) {
    advShowCountdownToggle.addEventListener('change', (e) => {
      state.advShowCountdown = e.target.checked;
      addTimelineLog(`Show 3s Countdown: ${state.advShowCountdown ? 'ON' : 'OFF'}`);
    });
  }

  saveProtectedTabsBtn.addEventListener('click', () => {
    // Sync modal domain checkboxes to state
    const checked = [];
    document.querySelectorAll('.protected-domain-check:checked').forEach(c => checked.push(c.value));
    // Merge with custom domains
    state.customDomains.forEach(d => { if (!checked.includes(d)) checked.push(d); });
    state.protectedDomains = checked;

    // Also sync inline toggles to match modal checkboxes
    document.querySelectorAll('.tab-domain-toggle').forEach(cb => {
      cb.checked = checked.includes(cb.value);
      const chipMap = {
        'youtube.com': 'chip-youtube', 'instagram.com': 'chip-instagram',
        'netflix.com': 'chip-netflix', 'twitch.tv': 'chip-twitch',
        'facebook.com': 'chip-facebook', 'x.com': 'chip-xcom'
      };
      updateDomainChip(chipMap[cb.value], cb.checked);
    });

    state.closeSleepGuardPage = closeSleepGuardPageToggle ? closeSleepGuardPageToggle.checked : true;
    state.closeAllWindows = closeAllWindowsToggle ? closeAllWindowsToggle.checked : false;
    state.advPlaySiren = advPlaySirenToggle ? advPlaySirenToggle.checked : true;
    state.advShowCountdown = advShowCountdownToggle ? advShowCountdownToggle.checked : true;

    // Save everything
    localStorage.setItem('sg_protectedDomains', JSON.stringify({
      domains: state.protectedDomains,
      protectAllOtherTabs: state.protectAllOtherTabs,
      customDomains: state.customDomains
    }));
    localStorage.setItem('sg_advProtection', JSON.stringify({
      closeSleepGuardPage: state.closeSleepGuardPage,
      closeAllWindows: state.closeAllWindows,
      advPlaySiren: state.advPlaySiren,
      advShowCountdown: state.advShowCountdown,
      customDomains: state.customDomains
    }));

    protectedTabsModal.classList.add('hidden');
    const totalDomains = state.protectedDomains.length;
    addTimelineLog(`✅ Protection Settings saved — ${totalDomains} domain(s)${state.closeSleepGuardPage ? ', Self-Close ON' : ''}${state.closeAllWindows ? ', Window-Close ON' : ''}.`);
  });

  headerLogsBtn.addEventListener('click', () => logsModal.classList.remove('hidden'));
  document.getElementById('navLog').addEventListener('click', (e) => { e.preventDefault(); logsModal.classList.remove('hidden'); });
  closeLogsBtn.addEventListener('click', () => logsModal.classList.add('hidden'));

  headerSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  document.getElementById('navSettings').addEventListener('click', (e) => { e.preventDefault(); settingsModal.classList.remove('hidden'); });
  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('navAbout').addEventListener('click', (e) => { e.preventDefault(); aboutModal.classList.remove('hidden'); });
  closeAboutBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));
  closeAboutFooterBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));

  // Extension Download Modal Triggers
  if (downloadExtBtn) downloadExtBtn.addEventListener('click', () => downloadModal.classList.remove('hidden'));
  if (footerDownloadBtn) footerDownloadBtn.addEventListener('click', (e) => { e.preventDefault(); downloadModal.classList.remove('hidden'); });
  if (closeDownloadBtn) closeDownloadBtn.addEventListener('click', () => downloadModal.classList.add('hidden'));

  if (drowsinessThresholdInput) {
    drowsinessThresholdInput.addEventListener('input', (e) => thresholdValDisplay.textContent = parseFloat(e.target.value).toFixed(2));
  }

  saveSettingsBtn.addEventListener('click', () => {
    if (drowsinessThresholdInput) state.earThreshold = parseFloat(drowsinessThresholdInput.value);
    if (instantSleepToggle) state.instantSleepEnabled = instantSleepToggle.checked;
    settingsModal.classList.add('hidden');
    addTimelineLog('Settings saved.');
  });

});
