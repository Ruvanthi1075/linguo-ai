// ===============================
// Language List
// ===============================

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

// ===============================
// TEXT TRANSLATION
// ===============================

export async function translateText(
  text: string,
  targetLanguage: string
): Promise<{
  translation: string;
  pronunciation?: string;
}> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, targetLanguage }),
  });

  if (!response.ok) {
    throw new Error("Translation failed");
  }

  const data = await response.json();

  return {
    translation: data.translation,
    pronunciation: data.pronunciation || "",
  };
}

// ===============================
// AUDIO TRANSCRIPTION (Dummy)
// ===============================

export async function transcribeAudio(
  file: File,
  targetLanguage: string
): Promise<{
  translation: string;
  pronunciation?: string;
  transcript: string;
}> {
  // Temporary placeholder so App.tsx works
  return {
    translation: "Audio transcription not implemented yet.",
    pronunciation: "",
    transcript: "Audio transcription not implemented yet.",
  };
}

// ===============================
// TEXT TO SPEECH (Dummy)
// ===============================

export async function generateSpeech(
  text: string
): Promise<string> {
  throw new Error("Text-to-speech not implemented yet.");
}