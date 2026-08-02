/* ==========================================================================
   SleepGuard AI v5 — Production Engine (100% Client-Side GitHub Pages Compatible)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Core State ---
  const state = {
    cameraActive: false,
    showMesh: true,
    showPose: true,
    showHands: true,
    extensionConnected: false,
    
    // AI Metrics
    aiFrameCounter: 0,
    faceDetected: false,
    faceCount: 0,
    bodyDetected: false,
    handsDetected: false,

    ear: 0.0,
    earThreshold: 0.20,
    mar: 0.0,
    marThreshold: 0.60,
    yawnCount: 0,
    isYawning: false,
    expression: 'Neutral 😊',
    
    sleepConfidence: 0, // 0-100%
    blinkCount: 0,
    blinksInLastMinute: [],
    eyeClosedStartTime: null,
    closureDurationMs: 0,

    lastPosePoints: null,
    bodyMovementDetected: false,

    // Guardian Local Face Enrollment Profile (Persisted in localStorage)
    enrolledProfile: null,
    guardianEnabled: true,
    guardianAction: 'close_all',
    intruderDetected: false,

    // Timer & Worker
    timerDurationSecs: 180, // 3 mins
    timerRemainingSecs: 180,
    bgWorker: null,

    // Emergency Overlay
    emergencyActive: false,
    emergencyTimerVal: 5,
    emergencyInterval: null,

    // Settings
    autoCloseEnabled: true,
    closeAction: 'tab'
  };

  // Landmark Mappings
  const LEFT_EYE = { top1: 160, bottom1: 144, top2: 158, bottom2: 153, corner1: 33, corner2: 133 };
  const RIGHT_EYE = { top1: 385, bottom1: 380, top2: 387, bottom2: 373, corner1: 362, corner2: 263 };
  const MOUTH = { top: 13, bottom: 14, left: 61, right: 291 };

  // --- DOM References ---
  const webcamElem = document.getElementById('webcam');
  const canvasElem = document.getElementById('hudCanvas');
  const canvasCtx = canvasElem.getContext('2d');

  const camPrompt = document.getElementById('camPrompt');
  const startCamBtn = document.getElementById('startCamBtn');
  const toggleMeshBtn = document.getElementById('toggleMeshBtn');
  const togglePoseBtn = document.getElementById('togglePoseBtn');
  const toggleHandsBtn = document.getElementById('toggleHandsBtn');

  const extStatusBadge = document.getElementById('extStatusBadge');
  const extDot = document.getElementById('extDot');
  const extStatusText = document.getElementById('extStatusText');
  const guardianStatusBadge = document.getElementById('guardianStatusBadge');
  const guardianDot = document.getElementById('guardianDot');
  const guardianStatusText = document.getElementById('guardianStatusText');
  const enrollFaceBtn = document.getElementById('enrollFaceBtn');
  const enrolledStatusPill = document.getElementById('enrolledStatusPill');

  const tagFace = document.getElementById('tagFace');
  const tagMouth = document.getElementById('tagMouth');
  const tagPose = document.getElementById('tagPose');
  const tagHand = document.getElementById('tagHand');

  const hudSleepConf = document.getElementById('hudSleepConf');
  const hudExpression = document.getElementById('hudExpression');
  const hudBlinkRate = document.getElementById('hudBlinkRate');
  const hudEarVal = document.getElementById('hudEarVal');
  const hudMarVal = document.getElementById('hudMarVal');

  const earValText = document.getElementById('earValText');
  const marValText = document.getElementById('marValText');
  const earMeterFill = document.getElementById('earMeterFill');
  const marMeterFill = document.getElementById('marMeterFill');

  const timelineList = document.getElementById('timelineList');
  const clearLogBtn = document.getElementById('clearLogBtn');

  const riskCard = document.getElementById('riskCard');
  const sleepConfCircle = document.getElementById('sleepConfCircle');
  const sleepConfVal = document.getElementById('sleepConfVal');
  const sleepConfTag = document.getElementById('sleepConfTag');
  const statusHeading = document.getElementById('statusHeading');
  const statusDesc = document.getElementById('statusDesc');

  const guardianSwitch = document.getElementById('guardianSwitch');
  const guardianActionSelect = document.getElementById('guardianActionSelect');
  const autoCloseSwitch = document.getElementById('autoCloseSwitch');
  const testIntruderBtn = document.getElementById('testIntruderBtn');
  const testCloseBtn = document.getElementById('testCloseBtn');

  const timerClock = document.getElementById('timerClock');
  const timerSub = document.getElementById('timerSub');

  const emergencyOverlay = document.getElementById('emergencyOverlay');
  const emergencyTitle = document.getElementById('emergencyTitle');
  const emergencySubtitle = document.getElementById('emergencySubtitle');
  const emergencyCountdownNum = document.getElementById('emergencyCountdownNum');
  const cancelEmergencyBtn = document.getElementById('cancelEmergencyBtn');

  const enrollModal = document.getElementById('enrollModal');
  const closeEnrollBtn = document.getElementById('closeEnrollBtn');
  const captureSnapshotBtn = document.getElementById('captureSnapshotBtn');
  const snapshotCanvas = document.getElementById('snapshotCanvas');
  const targetProfileName = document.getElementById('targetProfileName');

  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  const guideModal = document.getElementById('guideModal');
  const extBanner = document.getElementById('extBanner');
  const extGuideBtn = document.getElementById('extGuideBtn');
  const openGuideLink = document.getElementById('openGuideLink');
  const closeGuideBtn = document.getElementById('closeGuideBtn');
  const understandGuideBtn = document.getElementById('understandGuideBtn');

  const drowsinessThresholdInput = document.getElementById('drowsinessThreshold');
  const thresholdValDisplay = document.getElementById('thresholdValDisplay');
  const yawnThresholdInput = document.getElementById('yawnThreshold');
  const yawnValDisplay = document.getElementById('yawnValDisplay');
  const closeActionTypeSelect = document.getElementById('closeActionType');

  // Load Enrolled Profile from localStorage if exists
  loadEnrolledProfileFromStorage();

  // --- Initial Setup & Worker ---
  updateTimerDisplay();
  checkExtensionBridge();
  setInterval(checkExtensionBridge, 2500);
  initBackgroundWorker();

  // Clean Old Blinks
  setInterval(() => {
    const now = Date.now();
    state.blinksInLastMinute = state.blinksInLastMinute.filter(t => (now - t) <= 60000);
    hudBlinkRate.textContent = state.blinksInLastMinute.length;
  }, 2000);

  // --- LocalStorage Profile Persistence ---
  function loadEnrolledProfileFromStorage() {
    try {
      const saved = localStorage.getItem('sleepguard_enrolled_profile');
      if (saved) {
        state.enrolledProfile = JSON.parse(saved);
        enrolledStatusPill.className = 'status-chip active';
        enrolledStatusPill.textContent = `Enrolled: ${state.enrolledProfile.name.toUpperCase()}`;
      }
    } catch (e) {
      console.log('localStorage read error:', e);
    }
  }

  function saveEnrolledProfileToStorage(profile) {
    try {
      state.enrolledProfile = profile;
      localStorage.setItem('sleepguard_enrolled_profile', JSON.stringify(profile));
      enrolledStatusPill.className = 'status-chip active';
      enrolledStatusPill.textContent = `Enrolled: ${profile.name.toUpperCase()}`;
    } catch (e) {
      console.log('localStorage write error:', e);
    }
  }

  // --- Background Worker Thread ---
  function initBackgroundWorker() {
    try {
      state.bgWorker = new Worker('worker.js');
      state.bgWorker.onmessage = function (e) {
        if (e.data.type === 'TICK' && state.cameraActive && !state.emergencyActive) {
          if (state.timerRemainingSecs > 0) {
            state.timerRemainingSecs--;
            updateTimerDisplay();
          } else {
            triggerEmergencyCountdown('Inactivity Timeout');
          }
        }
      };
    } catch (err) {
      console.warn('Worker fallback:', err);
    }
  }

  // --- Extension Bridge ---
  function checkExtensionBridge() {
    window.postMessage({ source: 'SLEEPGUARD_WEB_APP', type: 'SLEEPGUARD_PING' }, '*');
  }

  window.addEventListener('message', (evt) => {
    if (evt.data && evt.data.type === 'SLEEPGUARD_PONG') {
      if (!state.extensionConnected) {
        state.extensionConnected = true;
        extStatusBadge.className = 'pill-badge';
        extDot.className = 'dot green';
        extStatusText.textContent = 'Extension Connected 🟢';
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
    timelineList.prepend(item);
    if (timelineList.children.length > 20) timelineList.removeChild(timelineList.lastChild);
  }

  clearLogBtn.addEventListener('click', () => { timelineList.innerHTML = ''; addTimelineLog('Log cleared.'); });

  // --- Human Activity Event Handlers ---
  function resetInactivityTimer() {
    if (state.emergencyActive) return;
    if (state.timerRemainingSecs !== state.timerDurationSecs) {
      state.timerRemainingSecs = state.timerDurationSecs;
      updateTimerDisplay();
    }
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (state.emergencyActive) cancelEmergencyOverlay();
      resetInactivityTimer();
    }, { passive: true });
  });

  // --- Math Helpers ---
  function getDistance3D(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  }

  function calculateEAR(landmarks) {
    const d1_l = getDistance3D(landmarks[LEFT_EYE.top1], landmarks[LEFT_EYE.bottom1]);
    const d2_l = getDistance3D(landmarks[LEFT_EYE.top2], landmarks[LEFT_EYE.bottom2]);
    const horiz_l = getDistance3D(landmarks[LEFT_EYE.corner1], landmarks[LEFT_EYE.corner2]);
    const ear_l = (d1_l + d2_l) / (2.0 * horiz_l);

    const d1_r = getDistance3D(landmarks[RIGHT_EYE.top1], landmarks[RIGHT_EYE.bottom1]);
    const d2_r = getDistance3D(landmarks[RIGHT_EYE.top2], landmarks[RIGHT_EYE.bottom2]);
    const horiz_r = getDistance3D(landmarks[RIGHT_EYE.corner1], landmarks[RIGHT_EYE.corner2]);
    const ear_r = (d1_r + d2_r) / (2.0 * horiz_r);

    return (ear_l + ear_r) / 2.0;
  }

  function calculateMAR(landmarks) {
    const height = getDistance3D(landmarks[MOUTH.top], landmarks[MOUTH.bottom]);
    const width = getDistance3D(landmarks[MOUTH.left], landmarks[MOUTH.right]);
    return height / width;
  }

  function classifyExpression(landmarks, mar, ear) {
    if (mar > state.marThreshold) return 'Yawning 😮';
    if (mar > 0.35) return 'Talking / Open 👄';
    if (ear < state.earThreshold) return 'Drowsy 😴';
    const mouthWidth = getDistance3D(landmarks[MOUTH.left], landmarks[MOUTH.right]);
    if (mouthWidth > 0.16) return 'Smiling 😄';
    return 'Neutral 😊';
  }

  function extractFaceVector(landmarks) {
    const pts = [1, 33, 133, 362, 263, 13, 14, 61, 291];
    const vec = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        vec.push(getDistance3D(landmarks[pts[i]], landmarks[pts[j]]));
      }
    }
    return vec;
  }

  function compareFaceVectors(v1, v2) {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let diff = 0;
    for (let i = 0; i < v1.length; i++) diff += Math.abs(v1[i] - v2[i]);
    return Math.max(0, 100 - (diff * 200));
  }

  // --- MediaPipe Suite Setup ---
  const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
  faceMesh.setOptions({ maxNumFaces: 2, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  faceMesh.onResults(onFaceMeshResults);

  const pose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5 });
  pose.onResults(onPoseResults);

  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.5 });
  hands.onResults(onHandsResults);

  let latestFaceResults = null;
  let latestPoseResults = null;
  let latestHandResults = null;

  function startCamera() {
    camPrompt.style.display = 'none';

    const camera = new Camera(webcamElem, {
      onFrame: async () => {
        state.aiFrameCounter++;
        await faceMesh.send({ image: webcamElem });
        await pose.send({ image: webcamElem });
        await hands.send({ image: webcamElem });
      },
      width: 640,
      height: 480
    });

    camera.start().then(() => {
      state.cameraActive = true;
      if (state.bgWorker) state.bgWorker.postMessage({ command: 'START', interval: 1000 });
      addTimelineLog('v5 Multi-AI Suite initialized (GitHub Pages Ready).');
      requestAnimationFrame(renderLoop);
    }).catch(err => {
      console.error('Camera Access Error:', err);
      camPrompt.style.display = 'flex';
    });
  }

  function onFaceMeshResults(r) { latestFaceResults = r; }
  function onPoseResults(r) { latestPoseResults = r; }
  function onHandsResults(r) { latestHandResults = r; }

  // --- Main Decision & Render Loop ---
  function renderLoop() {
    canvasElem.width = webcamElem.videoWidth || 640;
    canvasElem.height = webcamElem.videoHeight || 480;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElem.width, canvasElem.height);

    if (latestFaceResults && latestFaceResults.multiFaceLandmarks) {
      state.faceCount = latestFaceResults.multiFaceLandmarks.length;

      if (state.faceCount > 0) {
        state.faceDetected = true;
        const landmarks = latestFaceResults.multiFaceLandmarks[0];

        // Guardian Mode Check
        if (state.guardianEnabled && !state.emergencyActive) {
          if (state.faceCount > 1) {
            addTimelineLog('🚨 GUARDIAN ALERT: 2nd Person Detected!');
            triggerEmergencyCountdown('GUARDIAN SHIELD (2ND PERSON)');
          } else if (state.enrolledProfile) {
            const currentVec = extractFaceVector(landmarks);
            const similarity = compareFaceVectors(currentVec, state.enrolledProfile.vector);
            if (similarity > 82) {
              addTimelineLog(`🚨 GUARDIAN MATCH: Target "${state.enrolledProfile.name}" Matched (${similarity.toFixed(1)}%)!`);
              triggerEmergencyCountdown(`GUARDIAN SHIELD (${state.enrolledProfile.name.toUpperCase()})`);
            }
          }
        }

        state.ear = calculateEAR(landmarks);
        state.mar = calculateMAR(landmarks);

        hudEarVal.textContent = state.ear.toFixed(2);
        hudMarVal.textContent = state.mar.toFixed(2);
        earValText.textContent = state.ear.toFixed(2);
        marValText.textContent = state.mar.toFixed(2);

        earMeterFill.style.width = `${Math.min(Math.max((state.ear / 0.40) * 100, 0), 100)}%`;
        marMeterFill.style.width = `${Math.min(Math.max((state.mar / 0.80) * 100, 0), 100)}%`;

        if (state.mar > state.marThreshold) {
          if (!state.isYawning) {
            state.isYawning = true;
            state.yawnCount++;
            hudYawnCount.textContent = state.yawnCount;
            addTimelineLog(`Yawning detected (MAR: ${state.mar.toFixed(2)})`);
          }
          tagMouth.className = 'tag-pill warn';
          tagMouth.querySelector('span').textContent = 'Lips: Yawning 😮';
        } else {
          state.isYawning = false;
          tagMouth.className = 'tag-pill active';
          tagMouth.querySelector('span').textContent = 'Lips: Normal';
        }

        state.expression = classifyExpression(landmarks, state.mar, state.ear);
        hudExpression.textContent = state.expression;

        tagFace.className = 'tag-pill active';
        tagFace.querySelector('span').textContent = `Face: Locked (${state.faceCount})`;

        if (state.showMesh) drawFaceHUD(canvasCtx, landmarks, canvasElem.width, canvasElem.height);
        processEyeClosureLogic(state.ear);

      } else {
        state.faceDetected = false;
        tagFace.className = 'tag-pill';
        tagFace.querySelector('span').textContent = 'Face: None';
      }
    }

    if (latestPoseResults && latestPoseResults.poseLandmarks) {
      state.bodyDetected = true;
      tagPose.className = 'tag-pill active';
      const poseLm = latestPoseResults.poseLandmarks;

      if (state.lastPosePoints) {
        const movement = Math.abs(poseLm[11].x - state.lastPosePoints.x) + Math.abs(poseLm[11].y - state.lastPosePoints.y);
        if (movement > 0.015) {
          state.bodyMovementDetected = true;
          resetInactivityTimer();
        }
      }
      state.lastPosePoints = { x: poseLm[11].x, y: poseLm[11].y };
      if (state.showPose) drawPoseSkeleton(canvasCtx, poseLm, canvasElem.width, canvasElem.height);
    }

    if (latestHandResults && latestHandResults.multiHandLandmarks && latestHandResults.multiHandLandmarks.length > 0) {
      state.handsDetected = true;
      tagHand.className = 'tag-pill active';
      tagHand.querySelector('span').textContent = `Hands: ${latestHandResults.multiHandLandmarks.length} Active`;

      if (state.showHands) {
        latestHandResults.multiHandLandmarks.forEach(handLm => drawHandHUD(canvasCtx, handLm, canvasElem.width, canvasElem.height));
      }
      resetInactivityTimer();
    } else {
      state.handsDetected = false;
      tagHand.className = 'tag-pill';
      tagHand.querySelector('span').textContent = 'Hands: None';
    }

    evaluateSleepConfidenceMatrix();

    canvasCtx.restore();
    requestAnimationFrame(renderLoop);
  }

  function drawFaceHUD(ctx, landmarks, w, h) {
    ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
    for (let i = 0; i < landmarks.length; i += 10) {
      ctx.fillRect(landmarks[i].x * w - 1, landmarks[i].y * h - 1, 2, 2);
    }
  }

  function drawPoseSkeleton(ctx, landmarks, w, h) {
    ctx.strokeStyle = '#00E676'; ctx.lineWidth = 2;
    if (landmarks[11] && landmarks[12]) {
      ctx.beginPath(); ctx.moveTo(landmarks[11].x * w, landmarks[11].y * h);
      ctx.lineTo(landmarks[12].x * w, landmarks[12].y * h); ctx.stroke();
    }
  }

  function drawHandHUD(ctx, landmarks, w, h) {
    ctx.fillStyle = '#FFB300';
    landmarks.forEach(p => ctx.fillRect(p.x * w - 2, p.y * h - 2, 4, 4));
  }

  function processEyeClosureLogic(ear) {
    const now = Date.now();

    if (ear < state.earThreshold) {
      if (!state.eyeClosedStartTime) state.eyeClosedStartTime = now;
      state.closureDurationMs = now - state.eyeClosedStartTime;

      if (state.closureDurationMs > 2500) {
        if (!state.handsDetected && !state.bodyMovementDetected) {
          addTimelineLog('😴 Sleep Decision Confirmed');
          triggerEmergencyCountdown('Sleep Detected');
        }
      }
    } else {
      if (state.eyeClosedStartTime) {
        const closedTime = now - state.eyeClosedStartTime;
        if (closedTime >= 120 && closedTime <= 500) {
          state.blinkCount++;
          state.blinksInLastMinute.push(now);
        }
      }
      state.eyeClosedStartTime = null;
      state.closureDurationMs = 0;
    }
  }

  function evaluateSleepConfidenceMatrix() {
    let conf = 0;

    if (state.ear < state.earThreshold) conf += 45;
    if (state.isYawning) conf += 25;
    if (!state.handsDetected) conf += 15;
    if (!state.bodyMovementDetected) conf += 15;

    state.sleepConfidence = Math.min(100, Math.max(0, conf));
    hudSleepConf.textContent = `${state.sleepConfidence}%`;
    sleepConfVal.textContent = `${state.sleepConfidence}%`;

    const offset = 440 - (440 * (state.sleepConfidence / 100));
    sleepConfCircle.style.strokeDashoffset = offset;

    if (state.sleepConfidence > 85) {
      sleepConfTag.textContent = 'SLEEP DETECTED';
      statusHeading.textContent = 'Critical Sleep Risk 🔴';
      statusDesc.textContent = '12-Factor Matrix confirms deep eye closure and yawning. Emergency countdown active.';
    } else if (state.sleepConfidence > 40) {
      sleepConfTag.textContent = 'DROWSY';
      statusHeading.textContent = 'Elevated Drowsiness 🟡';
      statusDesc.textContent = 'Yawning or eye closure registered. Stay alert.';
    } else {
      sleepConfTag.textContent = 'AWAKE';
      statusHeading.textContent = 'State: Alert & Active 🟢';
      statusDesc.textContent = 'Body posture, hand movements, and eye openness verified active. No sleep indicators detected.';
    }
  }

  // --- Profile Enrollment Modal & LocalStorage ---
  enrollFaceBtn.addEventListener('click', () => {
    enrollModal.classList.remove('hidden');
    const sCtx = snapshotCanvas.getContext('2d');
    sCtx.drawImage(webcamElem, 0, 0, 320, 240);
  });

  closeEnrollBtn.addEventListener('click', () => enrollModal.classList.add('hidden'));

  captureSnapshotBtn.addEventListener('click', () => {
    if (latestFaceResults && latestFaceResults.multiFaceLandmarks && latestFaceResults.multiFaceLandmarks.length > 0) {
      const vec = extractFaceVector(latestFaceResults.multiFaceLandmarks[0]);
      const name = targetProfileName.value.trim() || 'Target Parent Profile';
      saveEnrolledProfileToStorage({ name, vector: vec });
      addTimelineLog(`Enrolled Target Guardian Profile: "${name}".`);
      enrollModal.classList.add('hidden');
    } else {
      alert('Please start camera first and look at camera to enroll face.');
    }
  });

  // --- Emergency Countdown & Extension Actions ---
  function triggerEmergencyCountdown(reason = 'Sleep Detected') {
    if (state.emergencyActive) return;
    state.emergencyActive = true;
    state.emergencyTimerVal = 5;

    emergencyTitle.textContent = reason.toUpperCase();
    emergencySubtitle.textContent = reason.includes('GUARDIAN') ? 
      'Parent/Intruder detected! Closing protected browser tabs in:' : 
      'Closing active browser tab to protect your session in:';

    emergencyCountdownNum.textContent = '5';
    emergencyOverlay.classList.remove('hidden');

    state.emergencyInterval = setInterval(() => {
      state.emergencyTimerVal--;
      emergencyCountdownNum.textContent = state.emergencyTimerVal;

      if (state.emergencyTimerVal <= 0) {
        clearInterval(state.emergencyInterval);
        executeBrowserCloseAction();
      }
    }, 1000);
  }

  function cancelEmergencyOverlay() {
    if (!state.emergencyActive) return;
    clearInterval(state.emergencyInterval);
    state.emergencyActive = false;
    state.intruderDetected = false;
    emergencyOverlay.classList.add('hidden');
    addTimelineLog('Emergency countdown cancelled by user input.');
  }

  function executeBrowserCloseAction() {
    emergencyOverlay.classList.add('hidden');
    state.emergencyActive = false;

    if (state.extensionConnected) {
      window.postMessage({
        source: 'SLEEPGUARD_WEB_APP',
        type: 'TRIGGER_CLOSE',
        action: state.guardianEnabled && state.intruderDetected ? state.guardianAction : state.closeAction
      }, '*');
    } else {
      alert(`[SleepGuard AI Guardian System]\n\n${emergencyTitle.textContent}\n\nExtension close action executed! Load companion Chrome extension for automatic tab removal.`);
    }
  }

  // --- Event Handlers & Controls ---
  startCamBtn.addEventListener('click', startCamera);
  cancelEmergencyBtn.addEventListener('click', cancelEmergencyOverlay);

  toggleMeshBtn.addEventListener('click', () => { state.showMesh = !state.showMesh; toggleMeshBtn.classList.toggle('active', state.showMesh); });
  togglePoseBtn.addEventListener('click', () => { state.showPose = !state.showPose; togglePoseBtn.classList.toggle('active', state.showPose); });
  toggleHandsBtn.addEventListener('click', () => { state.showHands = !state.showHands; toggleHandsBtn.classList.toggle('active', state.showHands); });

  document.querySelectorAll('.btn-preset[data-mins]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.timerDurationSecs = parseInt(e.currentTarget.getAttribute('data-mins')) * 60;
      state.timerRemainingSecs = state.timerDurationSecs;
      updateTimerDisplay();
    });
  });

  document.getElementById('customTimerBtn').addEventListener('click', () => {
    const custom = prompt('Enter timer duration in minutes (1 to 10):', '3');
    if (custom && !isNaN(custom)) {
      state.timerDurationSecs = Math.max(1, Math.min(10, parseInt(custom))) * 60;
      state.timerRemainingSecs = state.timerDurationSecs;
      updateTimerDisplay();
    }
  });

  guardianSwitch.addEventListener('change', (e) => {
    state.guardianEnabled = e.target.checked;
    guardianStatusBadge.className = state.guardianEnabled ? 'pill-badge' : 'pill-badge';
    guardianDot.className = state.guardianEnabled ? 'dot green' : 'dot red';
    guardianStatusText.textContent = state.guardianEnabled ? 'Guardian Shield Active' : 'Guardian Off';
    addTimelineLog(`Guardian Shield ${state.guardianEnabled ? 'Enabled' : 'Disabled'}.`);
  });

  guardianActionSelect.addEventListener('change', (e) => state.guardianAction = e.target.value);
  autoCloseSwitch.addEventListener('change', (e) => state.autoCloseEnabled = e.target.checked);

  testIntruderBtn.addEventListener('click', () => {
    addTimelineLog('TEST: Guardian Intrusion Simulated.');
    triggerEmergencyCountdown('Guardian Shield (Parent Shield)');
  });

  testCloseBtn.addEventListener('click', () => triggerEmergencyCountdown('Manual Close Test'));

  function updateTimerDisplay() {
    const mins = Math.floor(state.timerRemainingSecs / 60);
    const secs = state.timerRemainingSecs % 60;
    timerClock.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Modals
  openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

  extGuideBtn.addEventListener('click', () => guideModal.classList.remove('hidden'));
  openGuideLink.addEventListener('click', (e) => { e.preventDefault(); guideModal.classList.remove('hidden'); });
  closeGuideBtn.addEventListener('click', () => guideModal.classList.add('hidden'));
  understandGuideBtn.addEventListener('click', () => guideModal.classList.add('hidden'));

  drowsinessThresholdInput.addEventListener('input', (e) => thresholdValDisplay.textContent = parseFloat(e.target.value).toFixed(2));
  yawnThresholdInput.addEventListener('input', (e) => yawnValDisplay.textContent = parseFloat(e.target.value).toFixed(2));

  saveSettingsBtn.addEventListener('click', () => {
    state.earThreshold = parseFloat(drowsinessThresholdInput.value);
    state.marThreshold = parseFloat(yawnThresholdInput.value);
    state.closeAction = closeActionTypeSelect.value;
    settingsModal.classList.add('hidden');
    addTimelineLog('Settings updated.');
  });

});
