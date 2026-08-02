"""
SleepGuard AI v4 — Desktop Companion Agent (Python)
Continuous 24/7 background webcam monitoring agent for Windows.
Bypasses browser tab throttling completely by running natively in OS background.
"""

import sys
import time
import math
import subprocess

try:
    import cv2
    import mediapipe as mp
except ImportError:
    print("[SleepGuard Desktop Agent Error] Missing required libraries.")
    print("Please install via: pip install opencv-python mediapipe")
    sys.exit(1)


# --- Configuration ---
EAR_THRESHOLD = 0.20
MAR_THRESHOLD = 0.60
SLEEP_CONSECUTIVE_FRAMES = 30
TARGET_BROWSERS = ["chrome.exe", "msedge.exe", "brave.exe", "firefox.exe"]


def get_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2)


def calculate_ear(landmarks):
    # Left eye
    d1_l = get_distance(landmarks[160], landmarks[144])
    d2_l = get_distance(landmarks[158], landmarks[153])
    horiz_l = get_distance(landmarks[33], landmarks[133])
    ear_l = (d1_l + d2_l) / (2.0 * horiz_l) if horiz_l > 0 else 0

    # Right eye
    d1_r = get_distance(landmarks[385], landmarks[380])
    d2_r = get_distance(landmarks[387], landmarks[373])
    horiz_r = get_distance(landmarks[362], landmarks[263])
    ear_r = (d1_r + d2_r) / (2.0 * horiz_r) if horiz_r > 0 else 0

    return (ear_l + ear_r) / 2.0


def calculate_mar(landmarks):
    mouth_top = landmarks[13]
    mouth_bot = landmarks[14]
    mouth_left = landmarks[61]
    mouth_right = landmarks[291]

    height = get_distance(mouth_top, mouth_bot)
    width = get_distance(mouth_left, mouth_right)

    return height / width if width > 0 else 0


def close_browsers():
    print("\n[SleepGuard Alert] SLEEP OR INTRUDER DETECTED! Executing Browser Taskkill...")
    for browser in TARGET_BROWSERS:
        try:
            subprocess.run(["taskkill", "/F", "/IM", browser], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            pass


def main():
    print("=" * 65)
    print(" SLEEPGUARD AI v4 — DESKTOP COMPANION AGENT (BACKGROUND ACTIVE)")
    print("=" * 65)
    print("[+] Initializing MediaPipe Face Mesh Engine...")

    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=2,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[-] Error: Unable to open webcam video stream.")
        return

    print("[+] Camera Feed Linked. Monitoring in background...")
    print("[+] Press Ctrl+C in terminal to stop Desktop Agent.\n")

    sleep_frame_count = 0
    yawn_count = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.1)
                continue

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)

            if results.multi_face_landmarks:
                num_faces = len(results.multi_face_landmarks)

                # Intrusion Check: 2nd Person Detected!
                if num_faces > 1:
                    print(f"\n[!] GUARDIAN ALERT: Multiple Faces ({num_faces}) Detected in Background!")
                    close_browsers()
                    time.sleep(5)
                    continue

                landmarks = results.multi_face_landmarks[0].landmark
                ear = calculate_ear(landmarks)
                mar = calculate_mar(landmarks)

                status = "AWAKE"
                if mar > MAR_THRESHOLD:
                    status = "YAWNING 😮"
                    yawn_count += 1

                if ear < EAR_THRESHOLD:
                    sleep_frame_count += 1
                    status = f"EYES CLOSED ({sleep_frame_count}/{SLEEP_CONSECUTIVE_FRAMES})"
                    if sleep_frame_count >= SLEEP_CONSECUTIVE_FRAMES:
                        print("\n[!] CRITICAL SLEEP DETECTED IN BACKGROUND!")
                        close_browsers()
                        sleep_frame_count = 0
                        time.sleep(5)
                else:
                    sleep_frame_count = max(0, sleep_frame_count - 1)

                sys.stdout.write(f"\r[Telemetry] EAR: {ear:.2f} | MAR: {mar:.2f} | Status: {status} | Yawns: {yawn_count}   ")
                sys.stdout.flush()

            else:
                sleep_frame_count += 1
                sys.stdout.write(f"\r[Telemetry] NO FACE DETECTED (Timer: {sleep_frame_count})   ")
                sys.stdout.flush()

            time.sleep(0.03) # ~30 FPS

    except KeyboardInterrupt:
        print("\n\n[+] Desktop Agent stopped by user.")
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
