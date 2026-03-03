import dotenv from "dotenv";
dotenv.config(); // ✅ MUST be first

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔍 Debug (you can remove later)
console.log("Groq key loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");

// 🔐 Use server-side env vars
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ✅ Translation API
app.post("/api/translate", async (req, res) => {
  const { text, targetLanguage } = req.body;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: "user", content: `Translate to ${targetLanguage}: ${text}` }
      ],
      model: "llama-3.3-70b-versatile"
    });

    res.json({
      translation: response.choices[0].message.content
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed" });
  }
});

// Serve Vite build
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));