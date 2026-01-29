import { GoogleGenAI, Modality, Type, Chat } from "@google/genai";

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export interface MedicalAnalysisResult {
  riskScore?: number | null;
  riskLevel?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null;
  vitals: { [key: string]: string | null };
  summary?: string | null;
  keyFindings: string[];
  medications?: { name: string; dosage: string; duration: string }[];
}

export class GeminiService {
  private static instance: GeminiService;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private activeChat: Chat | null = null;

  private constructor() { }

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }



  /**
   * Always creates a fresh instance of GoogleGenAI to ensure it has the latest injected process.env.API_KEY
   */
  private getClient() {
    // Try both standard VITE_ prefix and the process.env mapping from vite.config.ts
    const key = this.getApiKey();

    // Debug log to verify key presence (masked)
    if (key && !key.startsWith("YOUR_")) {
      console.log("DEBUG: Gemini Key Loaded Successfully (" + key.substring(0, 8) + "...)");
    } else {
      console.warn("DEBUG: No valid Gemini API Key found. key='" + key + "'");
    }

    return new GoogleGenAI({ apiKey: key });
  }

  /**
   * Read API key from environment in a way that works in both dev/build and runtime.
   */
  private getApiKey(): string {
    let key = '';
    try {
      key = import.meta.env?.VITE_GEMINI_API_KEY || '';
    } catch (e) {
      key = '';
    }

    // Fallback to process.env mapping when running in Node or during SSR/build
    try {
      if (!key && typeof process !== 'undefined' && process.env) {
        key = (process.env as any).GEMINI_API_KEY || (process.env as any).API_KEY || '';
      }
    } catch (e) {
      // ignore
    }

    return key;
  }

  private getChatSession(): Chat {
    if (!this.activeChat) {
      const ai = this.getClient();
      this.activeChat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: "You are the MonkeyCoders HMS Assistant. You are a professional, medical-grade AI developed by the MonkeyCoders team. Use medical terminology correctly but explain it simply if asked. Refer to nodes, components, or entities as 'Stars' when appropriate.",
        },
      });
    }
    return this.activeChat;
  }

    private sleep(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    private isRateLimitError(err: any) {
      if (!err) return false;
      const msg = (err.message || err.toString || '').toString();
      return err.status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit');
    }

    private async withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 500): Promise<T> {
      let attempt = 0;
      while (true) {
        try {
          return await fn();
        } catch (err: any) {
          attempt++;
          if (attempt > retries || !this.isRateLimitError(err)) throw err;
          const jitter = Math.floor(Math.random() * 200);
          const delay = baseDelay * Math.pow(2, attempt) + jitter;
          console.warn(`Gemini rate-limited. Backing off ${delay}ms (attempt ${attempt}/${retries})`);
          await this.sleep(delay);
        }
      }
    }

  /**
   * New Validated Method for DoctorDashboard v2
   */
  public async analyzeMedicalReport(base64Data: string, mimeType: string): Promise<MedicalAnalysisResult> {
    try {
      const apiKey = this.getApiKey();

      // MOCK FALLBACK: Use simulation if no key or key is placeholder
      if (!apiKey || apiKey.startsWith("YOUR_")) {
        console.warn("Using MOCK ANALYSIS due to missing API Key");
        await new Promise(r => setTimeout(r, 2000)); // Simulate delay
        return {
          riskScore: null,
          riskLevel: null,
          vitals: {
            "Blood Pressure": null,
            "Heart Rate": null,
            "Temperature": null,
            "Weight": null
          },
          summary: null,
          keyFindings: []
        };
      }

      const ai = this.getClient();
      const prompt = `
            Analyze this medical document and extract a clinical risk assessment.
            Return ONLY valid JSON matching this structure:
            {
                "riskScore": number (0-100),
                "riskLevel": "CRITICAL" | "HIGH" | "MODERATE" | "LOW",
                "vitals": {
                    "Blood Pressure": "string" (or "Not Detected"),
                    "Heart Rate": "string" (or "Not Detected"),
                    "Temperature": "string" (or "Not Detected"),
                    "Weight": "string" (or "Not Detected")
                },
                "medications": [
                    { "name": "string", "dosage": "string", "duration": "string" }
                ],
                "summary": "string (Executive clinical summary, max 2 sentences)",
                "keyFindings": ["string", "string", "string"] (Top 3 critical findings)
            }
          `;

      // Prefer the chat API which tends to be more stable across versions and
      // avoids model-specific generateContent compatibility issues.
      const chat = this.getChatSession();
      let jsonText = '';

      try {
        const payload = base64Data ? `\n\n[INLINE_DATA:${mimeType}]\n${base64Data}\n[END_INLINE_DATA]` : '';
        const resp = await this.withRetry(() => chat.sendMessage({ message: prompt + payload }));
        jsonText = resp.text || '';
      } catch (chatErr) {
        console.warn('Chat API attempt failed, falling back to generateContent:', chatErr);
      }

      if (!jsonText) {
        try {
          const response = await this.withRetry(() => ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { data: base64Data, mimeType: mimeType } }
              ]
            }],
            config: { responseMimeType: 'application/json' }
          }));

          jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (genErr) {
          console.error('generateContent fallback failed:', genErr);
          throw genErr;
        }
      }

      if (!jsonText) throw new Error('Empty AI Response');
      return JSON.parse(jsonText.replace(/```json/g, '').replace(/```/g, '').trim()) as MedicalAnalysisResult;

    } catch (error: any) {
      console.error("Gemini Analysis Error:", error);
      // On error, return empty/nullable analysis (do NOT fabricate clinical values)
      return {
        riskScore: null,
        riskLevel: null,
        vitals: {
          "Blood Pressure": null,
          "Heart Rate": null,
          "Temperature": null,
          "Weight": null
        },
        summary: null,
        keyFindings: [],
        medications: []
      };
    }
  }

  private decodeBase64ToText(base64: string): string {
    try {
      // Handles UTF-8 text encoded to base64
      const binary = atob(base64);
      try {
        return decodeURIComponent(escape(binary));
      } catch (e) {
        return binary;
      }
    } catch (e) {
      return '';
    }
  }

  private validateExtraction(parsed: any, sourceText: string) {
    if (!sourceText || !sourceText.trim()) {
      // If we couldn't extract any source text (e.g., image PDF/OCR failure),
      // avoid accepting model-generated claims — clear sensitive fields.
      const safe: any = { ...parsed };
      if (safe.vitals) {
        for (const k of Object.keys(safe.vitals)) safe.vitals[k] = null;
      }
      safe.age = null;
      safe.summary = null;
      safe.keyFindings = [];
      return safe;
    }
    const src = sourceText.toLowerCase();
    const checkPresent = (val?: string | null) => {
      if (!val) return false;
      const s = String(val).toLowerCase();
      // check direct substring or numeric substring
      return src.includes(s) || (s.replace(/[^0-9.\/]/g, '') && src.includes(s.replace(/[^0-9.\/]/g, '')));
    };

    // Validate vitals
    if (parsed.vitals) {
      for (const k of Object.keys(parsed.vitals)) {
        if (!checkPresent(parsed.vitals[k])) {
          parsed.vitals[k] = null;
        }
      }
    }

    // If vitals are missing, attempt to extract common vitals via regex
    try {
      const extracted = this.extractVitalsFromText(sourceText);
      if (extracted) {
        for (const key of Object.keys(extracted)) {
          // Only fill if model didn't provide a valid value
          if (parsed.vitals && !parsed.vitals[key] && extracted[key]) {
            parsed.vitals[key] = extracted[key];
          }
        }
      }
    } catch (e) {
      // non-fatal
    }

    // Validate age if present
    if (parsed.age && !checkPresent(String(parsed.age))) {
      parsed.age = null;
    }

    // Validate diagnosis/keyFindings: ensure at least one finding term present in source
    if (parsed.keyFindings && parsed.keyFindings.length) {
      const validated: string[] = [];
      for (const f of parsed.keyFindings) {
        if (checkPresent(f)) validated.push(f);
      }
      parsed.keyFindings = validated;
    }

    // If summary isn't present in source, drop it to avoid fabricated claims
    if (parsed.summary && !checkPresent(parsed.summary.slice(0, 50))) {
      parsed.summary = null;
    }

    return parsed;
  }

  private extractVitalsFromText(text: string) {
    if (!text) return null;
    const src = text;
    const result: { [k: string]: string | null } = {
      'Blood Pressure': null,
      'Heart Rate': null,
      'Temperature': null,
      'Weight': null,
    };

    // Blood pressure patterns like 120/80 mmHg or BP: 120/80
    const bpMatch = src.match(/(\b(?:blood pressure|bp)[:\s]*|)(\d{2,3}\/\d{2,3})(?:\s*mmhg)?/i) || src.match(/(\d{2,3}\/\d{2,3})\s*mmhg/i);
    if (bpMatch) result['Blood Pressure'] = bpMatch[2] || bpMatch[1];

    // Heart rate / pulse patterns like 80 bpm or Pulse Rate: 80
    const hrMatch = src.match(/(?:\b(?:heart rate|pulse rate|pulse|hr)[:\s]*)(\d{2,3})(?:\s*bpm)?/i) || src.match(/(\d{2,3})\s*bpm/i);
    if (hrMatch) result['Heart Rate'] = hrMatch[1];

    // Temperature patterns like 37.5 C or 99°F
    const tempMatch = src.match(/(?:\b(?:temperature|temp|t)[:\s]*)(\d{2,3}(?:\.\d)?)(?:\s*[°º]?\s*([CF]))?/i) || src.match(/(\d{2,3}(?:\.\d)?)\s*°?\s*F/i) || src.match(/(\d{2,3}(?:\.\d)?)\s*°?\s*C/i);
    if (tempMatch) {
      result['Temperature'] = tempMatch[1] + (tempMatch[2] ? ' ' + tempMatch[2] : '');
    }

    // Weight patterns like 59 kg or Weight: 130 lbs
    const weightMatch = src.match(/(?:\b(?:weight|wt)[:\s]*)(\d{2,3}(?:\.\d)?)(?:\s*(kg|kgs|lbs|lb))?/i) || src.match(/(\d{2,3}(?:\.\d)?)\s*(kg|lbs)/i);
    if (weightMatch) result['Weight'] = weightMatch[1] + (weightMatch[2] ? ' ' + weightMatch[2] : '');

    return result;
  }

  // Legacy Method (kept for backward compatibility if needed, or remove if unused)
  public async analyzeMedicalDocument(payload: string | { inlineData: { data: string, mimeType: string } }): Promise<any> {
    return this.analyzeMedicalReport(
      typeof payload === 'string' ? '' : payload.inlineData.data,
      typeof payload === 'string' ? 'text/plain' : payload.inlineData.mimeType
    );
  }

  public resetChat() {
    this.activeChat = null;
  }

  private getMockResponse(prompt: string): string {
    const p = prompt.toLowerCase();
    if (p.includes('hello') || p.includes('hi')) return "Greetings. I am ready to assist with your medical queries.";
    if (p.includes('appointment') || p.includes('book')) return "You can schedule appointments using the 'Sync With Medical Star' portal on your dashboard.";
    if (p.includes('fever') || p.includes('flu') || p.includes('cold')) return "For standard fever symptoms, hydration and rest are recommended. If temperature exceeds 102°F, please consult a specialist immediately.";
    if (p.includes('pain') || p.includes('ache')) return "I have noted your report of pain. Please rate the intensity on a scale of 1-10 for your doctor's review.";
    if (p.includes('bill') || p.includes('cost') || p.includes('price')) return "Billing status can be verified in the 'Ledger' section. All transactions are secured via blockchain protocols.";
    if (p.includes('thank')) return "You are welcome. Stay healthy.";
    return "I am processing your query. As I am currently in Offline Mode, I recommend consulting a specialist for specific medical advice.";
  }

  public async getChatResponse(prompt: string) {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey || apiKey.startsWith("YOUR_")) {
        await new Promise(r => setTimeout(r, 1000));
        return this.getMockResponse(prompt) + " (Simulation)";
      }

      const chat = this.getChatSession();
      const response = await this.withRetry(() => chat.sendMessage({ message: prompt }));
      return response.text || "Diagnostic failure. Connection to central server lost.";
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      // Fallback to smart mock response on error
      return this.getMockResponse(prompt) + " (Offline Fallback)";
    }
  }

  public async speakText(text: string, onEnd?: () => void): Promise<() => void> {
    const ai = this.getClient();
    this.stopSpeech();

    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, this.audioCtx, 24000, 1);
        const source = this.audioCtx.createBufferSource();
        this.currentSource = source;
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);
        source.onended = () => {
          if (this.currentSource === source) this.currentSource = null;
          if (onEnd) onEnd();
        };
        source.start();
        return () => {
          source.stop();
          this.currentSource = null;
        };
      }
    } catch (e) {
      console.error("TTS Error:", e);
    }
    return () => { };
  }

  public stopSpeech() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) { }
      this.currentSource = null;
    }
  }
}