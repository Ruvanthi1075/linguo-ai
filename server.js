import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Groq key loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// TRANSLATE API
app.post("/api/translate", async (req, res) => {
  const { text, targetLanguage } = req.body;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetLanguage}. Only return the translated text:\n\n${text}`
        }
      ],
   model: "llama-3.3-70b-versatile"
    });

    res.json({
      translation: response.choices[0].message.content
    });

  } catch (error) {
    console.error("Groq error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));