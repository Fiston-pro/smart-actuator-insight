"""
ActuatorIQ — Local Anomaly Detector
Trains on healthy actuator data, detects deviations.
"""

import json
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

# ── 1. LOAD DATA ───────────────────────────────────────────────
with open('/mnt/user-data/uploads/results.json') as f:
    raw = json.load(f)

df = pd.DataFrame(raw['data'])
print(f"Loaded {len(df)} rows of healthy data")
print(f"Time span: {df['timestamp'].iloc[0]} to {df['timestamp'].iloc[-1]}")

# ── 2. FEATURE ENGINEERING ────────────────────────────────────
# These are the features the model learns as "normal"

df['position_gap'] = abs(df['setpoint_position_%'] - df['feedback_position_%'])
df['torque_abs'] = abs(df['motor_torque_Nmm'])
df['power_torque_ratio'] = df['power_W'] / (df['torque_abs'] + 0.001)  # motor efficiency proxy

FEATURES = [
    'feedback_position_%',
    'motor_torque_Nmm',
    'torque_abs',
    'power_W',
    'internal_temperature_deg_C',
    'position_gap',
    'power_torque_ratio',
    'rotation_direction',
]

X_healthy = df[FEATURES].copy()

print(f"\nFeatures used: {FEATURES}")
print(f"\nHealthy data ranges:")
for col in FEATURES:
    print(f"  {col}: {X_healthy[col].min():.4f} to {X_healthy[col].max():.4f}")

# ── 3. SCALE & TRAIN ──────────────────────────────────────────
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_healthy)

# Isolation Forest — learns what "normal" looks like
# contamination=0.05 means we expect ~5% of training data could be borderline
model = IsolationForest(
    n_estimators=100,
    contamination=0.05,
    random_state=42,
    max_samples='auto',
)
model.fit(X_scaled)

# Test on healthy data — should mostly be normal (1 = normal, -1 = anomaly)
healthy_preds = model.predict(X_scaled)
healthy_scores = model.decision_function(X_scaled)

print(f"\n=== HEALTHY DATA TEST ===")
print(f"Normal: {(healthy_preds == 1).sum()}/{len(healthy_preds)}")
print(f"Flagged: {(healthy_preds == -1).sum()}/{len(healthy_preds)} (expected ~5%)")
print(f"Score range: {healthy_scores.min():.3f} to {healthy_scores.max():.3f}")
print(f"Score mean: {healthy_scores.mean():.3f}")

# ── 4. SIMULATE FAULTS & TEST ─────────────────────────────────
print(f"\n=== SIMULATED FAULT TESTS ===\n")

def test_scenario(name, overrides):
    """Take a healthy row, apply overrides, check if flagged."""
    row = df[FEATURES].iloc[len(df)//2].copy()  # middle row as base
    for k, v in overrides.items():
        if k in row.index:
            row[k] = v
    # Recompute derived features
    if 'motor_torque_Nmm' in overrides:
        row['torque_abs'] = abs(overrides['motor_torque_Nmm'])
        row['power_torque_ratio'] = row['power_W'] / (row['torque_abs'] + 0.001)
    if 'power_W' in overrides:
        row['power_torque_ratio'] = overrides['power_W'] / (row['torque_abs'] + 0.001)

    X_test = scaler.transform([row.values])
    pred = model.predict(X_test)[0]
    score = model.decision_function(X_test)[0]
    status = "🔴 FLAGGED" if pred == -1 else "🟢 Normal"
    print(f"{name}")
    print(f"  Status: {status} | Score: {score:.3f}")
    print(f"  Overrides: {overrides}")
    print()
    return {"name": name, "prediction": int(pred), "score": float(score)}

# Scenario 1: High torque (obstruction)
test_scenario("High Torque — Possible Obstruction", {
    'motor_torque_Nmm': 2.5,  # ~6x normal max
})

# Scenario 2: Very high power, normal torque (motor degradation)
test_scenario("High Power — Motor Degradation", {
    'power_W': 0.5,  # ~12x normal max
})

# Scenario 3: Position stuck (not following setpoint)
test_scenario("Stuck Position — Not Responding", {
    'position_gap': 60.0,  # huge gap between setpoint and actual
})

# Scenario 4: High temperature
test_scenario("High Temperature — Overheating", {
    'internal_temperature_deg_C': 55.0,  # ~2x normal
})

# Scenario 5: Normal operation (should NOT flag)
test_scenario("Normal Operation — Should Pass", {
    'motor_torque_Nmm': 0.3,
    'power_W': 0.02,
})

# Scenario 6: Slight torque increase (borderline)
test_scenario("Slightly Elevated Torque — Borderline", {
    'motor_torque_Nmm': 0.8,  # 2x normal max but not crazy
})

# ── 5. EXPORT MODEL ───────────────────────────────────────────
joblib.dump(model, 'actuator_model.pkl')
joblib.dump(scaler, 'actuator_scaler.pkl')

# Export healthy data stats for the frontend
stats = {}
for col in FEATURES:
    stats[col] = {
        'mean': float(X_healthy[col].mean()),
        'std': float(X_healthy[col].std()),
        'min': float(X_healthy[col].min()),
        'max': float(X_healthy[col].max()),
    }

with open('healthy_stats.json', 'w') as f:
    json.dump(stats, f, indent=2)

print("✓ Model saved: actuator_model.pkl")
print("✓ Scaler saved: actuator_scaler.pkl")
print("✓ Stats saved: healthy_stats.json")

# ── 6. EXPORT PREDICTION FUNCTION (for integration) ───────────
print("""
=== INTEGRATION CODE ===

import joblib

model = joblib.load('actuator_model.pkl')
scaler = joblib.load('actuator_scaler.pkl')

def check_actuator(feedback_pos, torque, power, temp, setpoint_pos, rotation_dir):
    torque_abs = abs(torque)
    position_gap = abs(setpoint_pos - feedback_pos)
    power_torque_ratio = power / (torque_abs + 0.001)

    features = [feedback_pos, torque, torque_abs, power, temp,
                position_gap, power_torque_ratio, rotation_dir]

    X = scaler.transform([features])
    score = model.decision_function(X)[0]
    prediction = model.predict(X)[0]

    # Convert score to 0-1 range (0 = definitely anomaly, 1 = definitely normal)
    anomaly_score = max(0, min(1, (score + 0.5)))

    return {
        'is_anomaly': prediction == -1,
        'anomaly_score': round(anomaly_score, 3),
        'raw_score': round(score, 3),
    }
""")
