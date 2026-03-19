# ActuatorIQ — Smart HVAC Diagnostics

AI-powered fault detection and guided repair for **Belimo HVAC actuators**. Built for STARTHack 2026.

---

## What It Does

ActuatorIQ monitors real-time actuator sensor data through a **two-brain pipeline**:

1. **Brain 1 (Edge AI)** — Runs locally in the browser. Instantly checks every sensor reading against ML-derived thresholds. If everything looks normal, the pipeline stops here (no cloud call needed).
2. **Brain 2 (Cloud LLM — Gemini)** — Only triggered when Brain 1 flags an anomaly. Receives the full sensor snapshot + environmental context (CO₂, outdoor temperature, occupancy) and decides: is this a **real fault** or a **false positive** caused by normal operating conditions?

If a real issue is confirmed, the **Vision Guide** uses your device camera + Gemini Vision to walk a technician through physical inspection step-by-step.

---

## How the Two-Brain Pipeline Works

```
Sensor Data
    │
    ▼
┌─────────────────────────────────┐
│  Brain 1 — Edge Threshold Check │  ← runs every update, zero latency
│  (src/lib/brain.ts)             │
└─────────────────────────────────┘
    │ Normal?          │ Anomaly flagged?
    ▼                  ▼
 Pipeline          Brain 2 triggered
  stops
              ┌──────────────────────────────────────┐
              │  Brain 2 — Gemini 2.5 Flash           │
              │  (src/lib/gemini.ts)                  │
              │                                       │
              │  Input:  sensor values + CO₂ +        │
              │          outdoor temp + occupancy      │
              │                                       │
              │  Output: verdict, root cause,          │
              │          confidence, action steps      │
              └──────────────────────────────────────┘
                    │                   │
                    ▼                   ▼
             False Positive        Real Issue
             (filtered)          → Root Cause Analysis
                                 → Action Steps
                                 → Vision Guide (optional)
```

### Why Two Brains?

A single threshold check creates too many false positives. For example:
- High torque during **peak occupancy** (CO₂ > 800 ppm) is **normal** — the actuator is working hard because it should be.
- High torque in an **empty room** at 3am is a fault.

Brain 1 catches the deviation. Brain 2 understands the context.

---

## How Thresholds Were Derived (ML Training)

The thresholds used by Brain 1 are **not guesses** — they were computed from real Belimo actuator data using machine learning.

### Training Data

Real sensor logs from a healthy Belimo actuator were collected and exported as `results.json`. The healthy operating ranges from that data:

| Signal | Mean | Max (healthy) |
|--------|------|----------------|
| Torque | 0.353 Nmm | 0.439 Nmm |
| Power | 0.021 W | 0.041 W |
| Temperature | 25.8°C | 25.8°C |
| Position Gap | — | 95th pct: 39.9% |

See [`ml/healthy_stats.json`](ml/healthy_stats.json) for the full statistics.

### Training Method

`ml/train_model.py` trains a **scikit-learn Isolation Forest** on the healthy data:

```
Healthy sensor logs
       │
       ▼
Feature engineering
  ├── position_gap = |setpoint − feedback|
  ├── torque_abs = |torque|
  └── power_torque_ratio = power / (torque + 0.001)   ← motor efficiency proxy
       │
       ▼
StandardScaler (zero mean, unit variance)
       │
       ▼
IsolationForest(n_estimators=100, contamination=0.05)
  └── learns the "normal" distribution from 95% of healthy data
       │
       ▼
Threshold = max(healthy) × safety margin
```

**Isolation Forest** works by randomly partitioning data. Normal points require many splits to isolate; anomalies are isolated quickly. It outputs a decision score — more negative = more anomalous.

### Threshold Calculation

Thresholds are set at **3× the healthy max** for torque/power (giving headroom for legitimate spikes) and at the 99th percentile for temperature and position gap:

| Signal | Healthy Max | Threshold Used | Factor |
|--------|-------------|----------------|--------|
| Torque | 0.439 Nmm | **1.316 Nmm** | ~3× |
| Power | 0.041 W | **0.205 W** | ~5× |
| Temperature | 25.8°C | **40.8°C** | +15°C |
| Position Gap | 39.9% (p95) | **59.8%** | +20% |

These thresholds live in [`ml/thresholds.json`](ml/thresholds.json) and are mirrored in [`src/lib/brain.ts`](src/lib/brain.ts).

### Running the Training Script

```bash
cd ml
pip install pandas scikit-learn joblib numpy
python train_model.py
```

Outputs:
- `actuator_model.pkl` — trained Isolation Forest
- `actuator_scaler.pkl` — fitted StandardScaler
- `healthy_stats.json` — per-feature statistics

---

## Project Structure

```
smart-actuator-insight/
│
├── ml/                          # ML training (Python)
│   ├── train_model.py           # Isolation Forest training script
│   ├── healthy_stats.json       # Stats from healthy actuator data
│   └── thresholds.json          # Derived fault thresholds → used in frontend
│
├── src/
│   ├── lib/
│   │   ├── brain.ts             # Brain 1 (threshold logic) + Brain 2 fallback
│   │   ├── gemini.ts            # Brain 2 (Gemini API calls + Vision)
│   │   └── utils.ts
│   │
│   ├── context/
│   │   ├── ActuatorContext.tsx  # Pipeline orchestration (Brain 1 → Brain 2)
│   │   └── GeminiContext.tsx    # API key management (env + localStorage)
│   │
│   ├── components/
│   │   ├── PipelineTracker.tsx  # Visual pipeline (Data In → Brain1 → Brain2 → Result)
│   │   ├── PipelineLog.tsx      # History of past analyses
│   │   ├── SettingsModal.tsx    # Gemini API key input + connection test
│   │   ├── SimulatorOverlay.tsx # Manual sensor value adjustment for demos
│   │   └── BottomNav.tsx
│   │
│   └── pages/
│       ├── Dashboard.tsx        # Live sensor readings + pipeline status
│       ├── AIAnalysis.tsx       # Brain 2 verdict, root cause, action steps
│       └── VisionGuide.tsx      # Camera-based repair guidance (Gemini Vision)
│
├── .env                         # VITE_GEMINI_API_KEY (git-ignored)
├── index.html
├── vite.config.ts
└── package.json
```

---

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Add your Gemini API key

Create a `.env` file (already git-ignored):

```env
VITE_GEMINI_API_KEY=AIza...your_key_here
```

Get a key at [aistudio.google.com](https://aistudio.google.com) → Get API key → Create API key.

> Without a key, the app still works using the built-in rule-based fallback for Brain 2.

### 3. Run

```bash
npm run dev
# Opens at http://localhost:8080
```

### 4. Try It

1. Open the app → Dashboard tab
2. Click **Adjust Values** (bottom-right FAB)
3. Drag torque above **1.32 Nmm** to trigger Brain 1
4. Watch the pipeline animate → Brain 2 fires → see the AI verdict in **AI Analysis**
5. If it's a real issue, open **Vision Guide** and point your camera at an actuator

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| State | React Context API |
| AI (Brain 2) | Google Gemini 2.5 Flash |
| AI (Vision) | Google Gemini 2.5 Flash (multimodal) |
| ML Training | Python + scikit-learn (Isolation Forest) |
| Charts | Recharts |

---

## Key Design Decisions

**Why Isolation Forest for training?**
It's an unsupervised algorithm — you only need healthy data to train it. We don't have labelled fault data, so supervised methods aren't viable. Isolation Forest learns the normal distribution and flags anything that deviates.

**Why not run the ML model in the browser?**
The Isolation Forest + scaler would add ~2MB of weight files and require TensorFlow.js or ONNX runtime. For a hackathon demo, hardcoded thresholds derived from the model achieve the same Brain 1 behaviour with zero overhead. The model is ready to swap in for production.

**Why does Brain 2 use environmental context?**
Raw sensor thresholds produce false positives. An actuator working hard because the building is full is behaving correctly. Sending CO₂ level, outdoor temperature, and occupancy to Gemini lets it reason about whether the anomaly makes physical sense — something a simple threshold can never do.

**Why localStorage + .env for the API key?**
This is a client-side app with no backend. The key is loaded from `VITE_GEMINI_API_KEY` at startup and can be overridden in the Settings modal (stored in localStorage). This avoids the need for a proxy server while keeping the key out of source control.
