/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2, Download, Mic, MicOff, FileAudio, Upload, X,
  Languages, History, Trash2, Copy, Check, ArrowRightLeft,
  Clock, ChevronRight, Zap, Info, Search, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { translateText, transcribeAudio, generateSpeech, LANGUAGES } from './services/translationService';

declare global {
  interface Window {
    aistudio: { hasSelectedApiKey: () => Promise<boolean>; openSelectKey: () => Promise<void>; };
  }
}

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface TranslationRecord {
  id: string;
  sourceText: string;
  translatedText: string;
  pronunciation?: string;
  targetLanguage: string;
  timestamp: number;
  type: 'text' | 'audio';
}

const MAX_CHARS = 5000;
const MIN_H = 160;

export default function App() {
  const [sourceText, setSourceText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [translatedText, setTranslatedText] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<TranslationRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'translate' | 'history'>('translate');
  const [copied, setCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [modalContent, setModalContent] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(MIN_H);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (mirrorRef.current) {
      setTextareaHeight(Math.max(MIN_H, mirrorRef.current.scrollHeight + 8));
    }
  }, [sourceText]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = () => setIsListening(false);
      rec.onresult = (e: any) => {
        const t = e.results[0][0].transcript;
        setSourceText(p => p ? `${p} ${t}` : t);
      };
      setRecognition(rec);
    }
  }, []);

  useEffect(() => {
    const s = localStorage.getItem('translation_history');
    if (s) setHistory(JSON.parse(s));
  }, []);

  useEffect(() => {
    localStorage.setItem('translation_history', JSON.stringify(history));
  }, [history]);

  const toggleListening = () => {
    if (!recognition) { alert('Speech recognition not supported.'); return; }
    if (isListening) recognition.stop(); else recognition.start();
  };

  const handleSpeak = async (text: string) => {
    if (!text) return;
    if (audioRef.current) {
      audioRef.current.pause(); audioRef.current.currentTime = 0;
      if (audioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
    }
    setIsSpeaking(true); setIsGeneratingAudio(true); setError(null);
    try {
      const url = await generateSpeech(text);
      setIsGeneratingAudio(false);
      if (url) {
        const a = new Audio(url); audioRef.current = a; a.play();
        a.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
        a.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      } else setIsSpeaking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate speech.');
      setIsSpeaking(false); setIsGeneratingAudio(false);
    }
  };

  const handleDownload = async (text: string) => {
    if (!text) return; setError(null);
    try {
      const url = await generateSpeech(text);
      if (url) {
        const a = document.createElement('a'); a.href = url;
        a.download = `translation-${Date.now()}.wav`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); }
  };

  const handleTranslate = async () => {
    if (!sourceText.trim() && !audioFile) return;
    if (sourceText.length > MAX_CHARS) { setError(`Max ${MAX_CHARS} chars.`); return; }
    setIsLoading(true); setError(null);
    try {
      let result = '', pron = '', src = sourceText, type: 'text' | 'audio' = 'text';
      if (audioFile) {
        type = 'audio';
        const r = await transcribeAudio(audioFile, targetLanguage);
        result = r.translation; pron = r.pronunciation || ''; src = r.transcript;
        setSourceText(src);
      } else {
        const r = await translateText(sourceText, targetLanguage);
        result = r.translation; pron = r.pronunciation || '';
      }
      setTranslatedText(result); setPronunciation(pron);
      setHistory(p => [{
        id: crypto.randomUUID(), sourceText: src, translatedText: result,
        pronunciation: pron, targetLanguage, timestamp: Date.now(), type
      }, ...p].slice(0, 50));
      setAudioFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred.');
    } finally { setIsLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) { alert('Max 10MB.'); return; }
      setAudioFile(f); setSourceText('');
    }
  };

  const filteredHistory = history.filter(i =>
    i.sourceText.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.translatedText.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.targetLanguage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const charPct = Math.min((sourceText.length / MAX_CHARS) * 100, 100);
  const charCol = charPct > 90 ? '#dc2626' : charPct > 70 ? '#d97706' : '#16a34a';

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; background: #f8f9fb; font-family: 'Inter', sans-serif; color: #0f172a; }
        .mono { font-family: 'JetBrains Mono', monospace !important; }

        /* Card */
        .card {
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.04);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .card:hover {
          box-shadow: 0 4px 20px rgba(15,23,42,0.1), 0 1px 4px rgba(15,23,42,0.06);
          border-color: #cbd5e1;
        }

        /* Badge / pill */
        .badge {
          display: inline-flex; align-items: center;
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; padding: 3px 9px; border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
        }

        /* Primary button */
        .btn-primary {
          background: #0f172a;
          border: none; color: #ffffff; font-weight: 700; font-size: 15px;
          padding: 14px 44px; border-radius: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 10px;
          box-shadow: 0 2px 8px rgba(15,23,42,0.25);
          transition: all 0.18s; font-family: 'Inter', sans-serif;
          letter-spacing: -0.01em;
        }
        .btn-primary:hover:not(:disabled) {
          background: #1e293b;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(15,23,42,0.3);
        }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Icon button */
        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 8px;
          color: #64748b; background: transparent; border: none; cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .icon-btn:hover { background: #f1f5f9; color: #0f172a; }
        .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Language select */
        .lang-select {
          appearance: none;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          color: #0f172a; font-weight: 600; font-size: 13px;
          font-family: 'Inter', sans-serif;
          padding: 7px 28px 7px 12px; border-radius: 8px; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 8px center;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lang-select:hover { border-color: #94a3b8; }
        .lang-select:focus { outline: none; border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.08); }
        .lang-select option { background: #fff; color: #0f172a; }

        /* Textarea */
        .textarea-auto {
          background: transparent; border: none; outline: none;
          resize: none; overflow: hidden;
          color: #0f172a; font-size: 16px; line-height: 1.7;
          font-family: 'Inter', sans-serif; font-weight: 400;
          width: 100%; caret-color: #0f172a;
        }
        .textarea-auto::placeholder { color: #94a3b8; }

        /* Mirror for height calculation */
        .mirror-hidden {
          visibility: hidden; position: absolute; pointer-events: none;
          white-space: pre-wrap; word-wrap: break-word; top: 0; left: 0;
          font-size: 16px; line-height: 1.7;
          font-family: 'Inter', sans-serif; font-weight: 400; width: 100%;
        }

        /* Tab button */
        .tab-btn {
          position: relative; display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
          font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif;
          background: transparent; transition: color 0.2s; z-index: 1;
        }

        /* Search input */
        .search-input {
          width: 100%; background: #ffffff;
          border: 1.5px solid #e2e8f0; color: #0f172a;
          font-size: 13px; font-family: 'Inter', sans-serif;
          padding: 9px 12px 9px 36px; border-radius: 10px; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .search-input::placeholder { color: #94a3b8; }
        .search-input:focus { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,0.07); }

        /* Animations */
        .spin { animation: _spin 0.85s linear infinite; display: inline-flex; align-items: center; justify-content: center; }
        @keyframes _spin { to { transform: rotate(360deg); } }

        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: _pd 1s ease-in-out infinite; flex-shrink: 0; }
        @keyframes _pd { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.8); opacity: 0.5; } }

        /* Divider */
        .divider { height: 1px; background: #f1f5f9; }

        /* Mic recording state */
        .mic-recording { background: #fef2f2 !important; color: #ef4444 !important; border: 1.5px solid #fecaca !important; }

        /* History card */
        .hist-card {
          background: #ffffff; border: 1.5px solid #e2e8f0;
          border-radius: 14px; padding: 18px;
          transition: box-shadow 0.18s, border-color 0.18s, transform 0.15s;
        }
        .hist-card:hover { box-shadow: 0 4px 20px rgba(15,23,42,0.08); border-color: #94a3b8; transform: translateY(-1px); }
        .hist-actions { opacity: 0; transition: opacity 0.15s; }
        .hist-card:hover .hist-actions { opacity: 1; }

        /* Pronunciation block */
        .pron-block {
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 10px; padding: 12px 14px; margin-top: 14px;
          border-left: 3px solid #0f172a;
        }

        /* Audio chip */
        .audio-chip {
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 12px; padding: 12px 14px;
          display: flex; align-items: center; justify-content: space-between;
        }

        /* Error bar */
        .error-bar {
          background: #fef2f2; border: 1.5px solid #fecaca;
          border-radius: 12px; padding: 14px 16px;
          display: flex; gap: 10px; align-items: flex-start;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f8f9fb; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        /* Responsive */
        @media (max-width: 680px) {
          .trans-grid { grid-template-columns: 1fr !important; }
          .header-flex { flex-wrap: wrap; gap: 14px !important; }
        }

        /* Top accent bar */
        .top-bar {
          height: 3px;
          background: linear-gradient(90deg, #0f172a 0%, #334155 50%, #64748b 100%);
        }
      `}</style>

      {/* Top accent bar */}
      <div className="top-bar" />

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1.5px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <header className="header-flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Languages size={20} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>Linguo</h1>
                <p className="mono" style={{ margin: '2px 0 0', fontSize: 9, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>AI Multimodal Translator</p>
              </div>
            </div>

            {/* Tabs */}
            <nav style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 3, display: 'flex', gap: 2 }}>
              {[
                { id: 'translate', label: 'Translate', icon: <ArrowRightLeft size={14} /> },
                { id: 'history', label: 'History', icon: <History size={14} /> }
              ].map(tab => (
                <button key={tab.id} className="tab-btn"
                  style={{ color: activeTab === tab.id ? '#0f172a' : '#64748b' }}
                  onClick={() => setActiveTab(tab.id as any)}>
                  {tab.icon}{tab.label}
                  {activeTab === tab.id && (
                    <motion.div layoutId="tab-bg"
                      style={{ position: 'absolute', inset: 0, background: '#ffffff', borderRadius: 7, zIndex: -1, boxShadow: '0 1px 4px rgba(15,23,42,0.1)' }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />
                  )}
                </button>
              ))}
            </nav>
          </header>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 72px' }}>
        <AnimatePresence mode="wait">

          {/* TRANSLATE TAB */}
          {activeTab === 'translate' && (
            <motion.div key="translate" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>

              {/* Section label */}
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Translate Text</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Powered by Groq Llama & Gemini TTS</p>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 20, overflow: 'hidden' }}>
                    <div className="error-bar">
                      <Info size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#dc2626' }}>Error</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>
                      </div>
                      <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setError(null)}><X size={13} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cards grid */}
              <div className="trans-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

                {/* SOURCE CARD */}
                <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', position: 'relative', ...(sourceText.length > MAX_CHARS ? { borderColor: '#fca5a5', boxShadow: '0 0 0 3px rgba(220,38,38,0.08)' } : {}) }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' }}>Source</span>
                      <span className="mono" style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>Auto-detect</span>
                    </div>
                    {sourceText && (
                      <button
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'Inter,sans-serif', transition: 'color 0.15s', padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                        onClick={() => { setSourceText(''); setError(null); }}>
                        <X size={11} />Clear
                      </button>
                    )}
                  </div>

                  {/* Mirror div */}
                  <div ref={mirrorRef} className="mirror-hidden" style={{ minHeight: MIN_H }} aria-hidden="true">{sourceText || 'placeholder'}{'\u200b'}</div>

                  {/* Audio file chip */}
                  {audioFile ? (
                    <div className="audio-chip">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FileAudio size={16} color="#fff" />
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audioFile.name}</p>
                          <p className="mono" style={{ margin: 0, fontSize: 10, color: '#64748b' }}>{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button className="icon-btn" onClick={() => setAudioFile(null)}><X size={14} /></button>
                    </div>
                  ) : (
                    <textarea className="textarea-auto" value={sourceText}
                      onChange={e => { setSourceText(e.target.value); if (error) setError(null); }}
                      placeholder="Type or paste text here…"
                      style={{ height: textareaHeight, minHeight: MIN_H }} />
                  )}

                  <div className="divider" style={{ margin: '16px 0 14px' }} />

                  {/* Bottom toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className={`icon-btn${isListening ? ' mic-recording' : ''}`}
                        style={{ width: 36, height: 36, borderRadius: 8, opacity: audioFile ? 0.35 : 1, border: '1.5px solid #e2e8f0' }}
                        onClick={toggleListening} disabled={!!audioFile} title={isListening ? 'Stop recording' : 'Voice input'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {isListening && <div className="pulse-dot" />}
                          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                        </div>
                      </button>
                      <button className="icon-btn" style={{ width: 36, height: 36, borderRadius: 8, opacity: isListening ? 0.35 : 1, border: '1.5px solid #e2e8f0' }}
                        onClick={() => fileInputRef.current?.click()} disabled={isListening} title="Upload audio file">
                        <Upload size={15} />
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" style={{ display: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 64, height: 3, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${charPct}%`, background: charCol, transition: 'width 0.2s, background 0.4s' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: charPct > 90 ? '#dc2626' : '#94a3b8', fontWeight: 500 }}>
                        {sourceText.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* OUTPUT CARD */}
                <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: textareaHeight + 130 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span className="badge" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Translation</span>
                    <select className="lang-select" value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)}>
                      {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {isLoading ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div className="spin" style={{ width: 40, height: 40, borderRadius: 10, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Sparkles size={18} color="#fff" />
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Translating…</p>
                      </div>
                    ) : translatedText ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.72, color: '#0f172a', fontWeight: 400, flex: 1 }}>{translatedText}</p>
                        {pronunciation && (
                          <div className="pron-block">
                            <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', marginBottom: 6, display: 'inline-flex' }}>Pronunciation Guide</span>
                            <p className="mono" style={{ margin: 0, fontSize: 13, color: '#475569', fontStyle: 'italic' }}>{pronunciation}</p>
                          </div>
                        )}
                        <div className="divider" style={{ margin: '14px 0 10px' }} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="icon-btn" title="Copy to clipboard"
                            onClick={() => { navigator.clipboard.writeText(translatedText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                            {copied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                          </button>
                          <button className="icon-btn" title="Listen to translation" disabled={isGeneratingAudio}
                            style={{ opacity: isGeneratingAudio ? 0.4 : 1, color: isSpeaking ? '#0f172a' : undefined }}
                            onClick={() => handleSpeak(translatedText)}>
                            {isGeneratingAudio ? <div className="spin"><Sparkles size={15} /></div> : <Volume2 size={15} />}
                          </button>
                          <button className="icon-btn" title="Download audio" onClick={() => handleDownload(translatedText)}>
                            <Download size={15} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', fontStyle: 'italic' }}>Translation will appear here…</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Translate button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                <button className="btn-primary" onClick={handleTranslate}
                  disabled={isLoading || (!sourceText.trim() && !audioFile) || sourceText.length > MAX_CHARS}>
                  {isLoading ? <div className="spin"><Sparkles size={19} /></div> : <ArrowRightLeft size={19} />}
                  {isLoading ? 'Translating…' : audioFile ? 'Transcribe & Translate' : 'Translate Now'}
                </button>
              </div>
            </motion.div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>

              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Translation History</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Your recent translations are saved locally.</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {history.length > 0 && (
                    <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0' }}>
                      {history.length} {history.length === 1 ? 'entry' : 'entries'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 340 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input className="search-input" placeholder="Search history…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    {searchQuery && <button className="icon-btn" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22 }} onClick={() => setSearchQuery('')}><X size={11} /></button>}
                  </div>
                  {history.length > 0 && (
                    <button className="icon-btn" style={{ width: 40, height: 40, borderRadius: 10, color: '#ef4444', flexShrink: 0, border: '1.5px solid #fecaca', background: '#fef2f2' }}
                      onClick={() => { if (confirm('Clear all history?')) setHistory([]); }} title="Clear All">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="card" style={{ padding: 64, textAlign: 'center' }}>
                  <Clock size={40} color="#e2e8f0" style={{ display: 'block', margin: '0 auto 14px' }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#334155', fontSize: 15 }}>No history yet</p>
                  <p style={{ margin: '5px 0 0', fontSize: 13, color: '#94a3b8' }}>Your translations will appear here once you start translating.</p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="card" style={{ padding: 44, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#334155' }}>No matches found.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Try a different search term.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredHistory.map(item => (
                    <HistoryCard key={item.id} item={item}
                      onDelete={id => setHistory(p => p.filter(i => i.id !== id))}
                      onCopy={t => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      onSpeak={handleSpeak} onDownload={handleDownload}
                      onLoad={r => {
                        setSourceText(r.sourceText); setTranslatedText(r.translatedText);
                        setPronunciation(r.pronunciation || ''); setTargetLanguage(r.targetLanguage);
                        setActiveTab('translate'); window.scrollTo({ top: 0, behavior: 'smooth' });
                      }} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{ background: '#ffffff', borderTop: '1.5px solid #e2e8f0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <p className="mono" style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>© 2024 Linguo AI · Powered by Groq & Gemini</p>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'Privacy', title: 'Privacy Policy', body: 'Text and audio are processed in real-time by Groq and Gemini. Translation history is stored locally on your device only. No tracking or advertising.' },
              { label: 'Terms', title: 'Terms of Service', body: 'Linguo AI is for translation and accessibility purposes. AI translations may not be 100% accurate. Usage is subject to Groq and Gemini API rate limits.' },
              { label: 'Help', title: 'Help & Support', body: 'Type or paste text and click Translate Now. Click the microphone icon for voice input. Upload MP3 or WAV audio files for transcription via Groq Whisper.' },
            ].map(item => (
              <button key={item.label}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#64748b', fontFamily: 'Inter,sans-serif', fontWeight: 600, transition: 'color 0.15s', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                onClick={() => setModalContent({ title: item.title, content: <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.75 }}>{item.body}</p> })}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalContent && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
              onClick={() => setModalContent(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
              style={{ position: 'relative', width: '100%', maxWidth: 480, background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(15,23,42,0.2)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{modalContent.title}</h3>
                <button className="icon-btn" onClick={() => setModalContent(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 24, maxHeight: '55vh', overflowY: 'auto' }}>{modalContent.content}</div>
              <div style={{ padding: '16px 24px', borderTop: '1.5px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                <button className="btn-primary" style={{ padding: '10px 24px', fontSize: 13 }} onClick={() => setModalContent(null)}>Close</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryCard({ item, onDelete, onCopy, onSpeak, onDownload, onLoad }: {
  item: TranslationRecord;
  onDelete: (id: string) => void;
  onCopy: (t: string) => void;
  onSpeak: (t: string) => void;
  onDownload: (t: string) => void;
  onLoad: (r: TranslationRecord) => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="hist-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {item.type === 'audio' && <Mic size={10} color="#64748b" />}
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>EN</span>
            <ChevronRight size={10} color="#cbd5e1" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#0f172a', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.targetLanguage}</span>
            <span className="mono" style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{format(item.timestamp, 'MMM d, h:mm a')}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{item.sourceText}</p>
          <p style={{ margin: '5px 0 0', fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>{item.translatedText}</p>
          {item.pronunciation && <p className="mono" style={{ margin: '5px 0 0', fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>/{item.pronunciation}/</p>}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 10, color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 7px', borderRadius: 5 }}>{item.sourceText.length} chars</span>
            <button
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'color 0.15s', padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
              onClick={() => onLoad(item)}>
              <Zap size={10} />Load into editor
            </button>
          </div>
        </div>
        <div className="hist-actions" style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {[
            { icon: <Volume2 size={14} />, fn: () => onSpeak(item.translatedText), title: 'Listen' },
            { icon: <Download size={14} />, fn: () => onDownload(item.translatedText), title: 'Download audio' },
            { icon: <Copy size={14} />, fn: () => onCopy(item.translatedText), title: 'Copy' },
          ].map((b, i) => (
            <button key={i} className="icon-btn" style={{ width: 32, height: 32, borderRadius: 7 }} title={b.title} onClick={b.fn}>{b.icon}</button>
          ))}
          <button className="icon-btn" style={{ width: 32, height: 32, borderRadius: 7 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; }}
            title="Delete" onClick={() => onDelete(item.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}