// Gemini API helpers for ActuatorIQ

import { SensorData, ContextData, ThresholdFlag, Brain2Result } from './brain';

const BRAIN2_SYSTEM_PROMPT = `You are an expert HVAC diagnostics AI for Belimo actuators. You receive actuator sensor data and environmental context. Your job is to determine if a flagged anomaly is a REAL issue or a FALSE POSITIVE explained by environmental conditions.

You must respond ONLY with valid JSON in this exact format:
{
  "verdict": "real_issue" or "false_positive",
  "confidence": 0-100,
  "root_cause": "One sentence describing the most likely cause",
  "reasoning": [
    "Point 1 explaining evidence for your conclusion",
    "Point 2...",
    "Point 3..."
  ],
  "ruled_out": [
    "Alternative cause 1 and why it's unlikely",
    "Alternative cause 2..."
  ],
  "action_steps": [
    "Step 1 to take",
    "Step 2..."
  ],
  "urgency": "none" or "low" or "medium" or "high",
  "can_auto_fix": true/false,
  "auto_fix_description": "Description of automated fix if applicable"
}

Key rules:
- If CO2 is above 800ppm and occupancy is high, elevated torque and temperature are often EXPECTED behavior, not faults.
- If outdoor temperature is extreme (>35°C or <0°C), the HVAC system works harder — this is normal.
- Compare the actuator signals to the healthy baseline: torque normally 0 to 0.44 Nmm, power 0.004 to 0.041 W, temperature around 25.8°C.
- A position gap (setpoint vs feedback) above 60% is concerning regardless of context.
- Power increasing while torque stays normal suggests motor degradation.
- Be precise and concise. No fluff.`;

export async function callGeminiBrain2(
  apiKey: string,
  sensors: SensorData,
  context: ContextData,
  flags: ThresholdFlag[]
): Promise<Brain2Result> {
  const flagReasons = flags.map(f => f.label);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: BRAIN2_SYSTEM_PROMPT + '\n\nACTUATOR DATA:\n' + JSON.stringify(sensors) +
              '\n\nENVIRONMENTAL CONTEXT:\n' + JSON.stringify(context) +
              '\n\nBrain 1 flagged this because: ' + flagReasons.join(', ') +
              '\n\nAnalyze and respond in the exact JSON format specified.'
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Try direct parse first (when responseMimeType is application/json)
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON found in Gemini response: ${text.slice(0, 200)}`);
    parsed = JSON.parse(jsonMatch[0]);
  }

  // Map to Brain2Result
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parsed as any;
  const isRealIssue = p.verdict === 'real_issue';
  const urgencyMap: Record<string, string> = {
    none: '', low: 'Monitor over next week', medium: 'Fix within 48 hours',
    high: 'Immediate attention',
  };

  return {
    isRealIssue,
    confidence: p.confidence || 80,
    verdict: isRealIssue ? 'Real Issue Confirmed' : 'False Positive — Expected Behavior',
    rootCause: p.root_cause || '',
    reasoning: p.reasoning || [],
    reasoningIcons: (p.reasoning || []).map(() => 'check' as const),
    actions: p.action_steps || [],
    urgency: p.urgency || 'none',
    urgencyLabel: urgencyMap[p.urgency] || '',
    needsPhysicalInspection: isRealIssue && (p.urgency === 'high' || p.urgency === 'medium'),
    issueSummary: p.root_cause || '',
  };
}

export async function callGeminiVision(
  apiKey: string,
  base64Frame: string,
  currentIssue: string,
  previousMessages: string[]
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Frame,
              }
            },
            {
              text: 'You are guiding an HVAC technician through a repair on a Belimo actuator. The current issue is: ' +
                currentIssue + '. Previous steps completed: ' + previousMessages.join(', ') +
                '. Look at this image of the actuator and provide the next instruction. Be specific about what you see and what the technician should do next. Keep it to 2-3 sentences max. If you can identify the actuator model, mention it.'
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 256,
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini Vision API error: ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to analyze the image.';
}

export async function callGeminiVisionText(
  apiKey: string,
  base64Frame: string,
  userQuestion: string,
  currentIssue: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Frame,
              }
            },
            {
              text: 'You are an HVAC repair assistant for Belimo actuators. Current issue: ' + currentIssue +
                '. The technician asks: "' + userQuestion + '". Answer based on what you see in the image. Keep it concise (2-3 sentences).'
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 256,
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini Vision API error: ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to answer.';
}

export async function testGeminiConnection(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with "ok"' }] }],
          generationConfig: { maxOutputTokens: 10 },
        })
      }
    );
    if (response.ok) return { ok: true };
    const data = await response.json().catch(() => ({}));
    const msg = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: 'Network error — check your connection' };
  }
}
