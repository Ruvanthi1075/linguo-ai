import { GoogleGenAI, Modality } from "@google/genai";
import Groq from "groq-sdk";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY || "",
  dangerouslyAllowBrowser: true
});

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
];

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export async function translateText(text: string, targetLanguage: string) {
  if (!text.trim()) return { translation: "", pronunciation: "" };

  const prompt = `Translate the following text into ${targetLanguage}. Also provide a phonetic pronunciation guide for the translation.
  Provide the output in the following JSON format:
  {
    "translation": "The translation in ${targetLanguage}",
    "pronunciation": "Phonetic pronunciation guide (e.g., for 'Hola' it would be 'OH-lah')"
  }
  Provide ONLY the JSON object, no extra text.
  
  Text: "${text}"`;

  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_GROQ_MODEL,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);
    return {
      translation: result.translation || "Translation failed.",
      pronunciation: result.pronunciation || ""
    };
  } catch (error: any) {
    console.error("Groq Translation error:", error);
    if (error?.status === 429) {
      throw new Error("Groq API rate limit reached. Please wait a moment.");
    }
    throw new Error("Failed to translate text using Groq. Please check your API key.");
  }
}

export async function transcribeAudio(audioFile: File, targetLanguage: string) {
  try {
    // 1. Transcribe using Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
    });

    const transcript = transcription.text;

    // 2. Translate and get pronunciation using Groq Llama
    const prompt = `Translate the following transcript into ${targetLanguage}. Also provide a phonetic pronunciation guide for the translation.
    Provide the output in the following JSON format:
    {
      "translation": "The translation in ${targetLanguage}",
      "pronunciation": "Phonetic pronunciation guide"
    }
    Provide ONLY the JSON object, no extra text.
    
    Transcript: "${transcript}"`;

    const translationResponse = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: DEFAULT_GROQ_MODEL,
      response_format: { type: "json_object" }
    });

    const content = translationResponse.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    return {
      transcript: transcript,
      translation: result.translation || "Translation failed.",
      pronunciation: result.pronunciation || ""
    };
  } catch (error: any) {
    console.error("Groq Audio processing error:", error);
    throw new Error("Failed to process audio with Groq. Please ensure the file is valid.");
  }
}

export async function generateSpeech(text: string, voiceName: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr' = 'Kore') {
  if (!text.trim()) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    return pcmToWavUrl(base64Audio, 24000);
  } catch (error: any) {
    console.error("TTS error:", error);
    if (error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('quota')) {
      throw new Error("The voice service is currently at its limit. Please wait a minute before trying again.");
    }
    throw new Error("Failed to generate speech. Please try again later.");
  }
}

function pcmToWavUrl(base64Pcm: string, sampleRate: number): string {
  const binaryString = atob(base64Pcm);
  const dataSize = binaryString.length;
  const bytes = new Uint8Array(dataSize);
  for (let i = 0; i < dataSize; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const chunkSize = 36 + dataSize;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, chunkSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const pcmData = new Uint8Array(buffer, 44);
  pcmData.set(bytes);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
