import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Plus, Trash2, Type, Image as ImageIcon, Play, 
  Sparkles, Layout, MonitorPlay, AlignLeft, AlignCenter, 
  AlignRight, Loader2, Palette, MousePointer2, Wand2,
  ChevronLeft, LayoutTemplate, Zap, ImagePlus, Upload,
  Download, Moon, Sun, Type as FontIcon, PenLine,
  MessageSquare, FolderOpen, Copy, Check, Layers,
  ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown,
  Pipette, X, Menu, ChevronDown as DropdownIcon, Heading,
  RefreshCw, Code2, Undo, Redo, FileCode, Save, FileUp,
  StickyNote, BarChart3, ShieldCheck, Settings, KeyRound,
  ServerCog, PlugZap, Terminal, Lock, Unlock
} from 'lucide-react';

import { toJpeg } from 'html-to-image';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { AsciiBackground } from './AsciiBackground';
import Markdown from 'react-markdown';

declare global {
  interface Window {
    JSZip: any;
  }
}

// --- Font Fallback Engine for PPTX Export ---
const getSafeSystemFont = (fontFamily) => {
  if (!fontFamily) return 'Arial';
  const f = fontFamily.toLowerCase();
  if (f.includes('lora') || f.includes('playfair') || f.includes('merriweather')) return 'Georgia';
  if (f.includes('oswald') || f.includes('bebas') || f.includes('archivo')) return 'Impact';
  if (f.includes('montserrat') || f.includes('syne') || f.includes('space')) return 'Century Gothic';
  if (f.includes('poppins') || f.includes('jakarta')) return 'Trebuchet MS';
  return 'Arial';
};

// --- Secure String Helpers (Prevents HTML Wrapper parsing errors) ---
const tagS = "<scr" + "ipt";
const tagE = "</scr" + "ipt>";

// --- ChatPPT ASCII Logo ---
const asciiLogo = 
  " ██████╗ ██╗  ██╗ █████╗ ████████╗██████╗ ██████╗ ████████╗\n" +
  "██╔════╝ ██║  ██║██╔══██╗╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝\n" +
  "██║      ███████║███████║   ██║   ██████╔╝██████╔╝   ██║\n" +
  "██║      ██╔══██║██╔══██║   ██║   ██╔═══╝ ██╔═══╝    ██║\n" +
  "╚██████╗ ██║  ██║██║  ██║   ██║   ██║     ██║        ██║\n" +
  " ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝        ╚═╝\n" +
  "                         by -Pixel";

// --- AI API Calls ---
const postJSON = async (url, body) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    // If backend is unavailable (e.g., standalone HTML), try client-side Gemini fallback
    if ((error instanceof TypeError && error.message.includes('Failed to fetch')) || error.message.includes('Not Found') || error.message === 'Request failed') {
       if (url.startsWith('/api/ai/')) {
          const settings = body.aiSettings || {};
          const isGemini = url === '/api/ai/image' ? settings.imageProvider === 'gemini' : settings.textProvider === 'gemini';
          
          if (!isGemini) {
             throw new Error(`Standalone HTML mode (no backend) only supports Gemini client-side fallback. You selected ${url === '/api/ai/image' ? settings.imageProvider : settings.textProvider}. Please switch to Gemini in Settings.`);
          }
          if (!settings.geminiApiKey) {
             throw new Error("Gemini API key is required in standalone mode. Enter it in Settings.");
          }
          
          if (url === '/api/ai/deck' || url === '/api/ai/rewrite' || url === '/api/ai/chat') {
             let promptObj = {};
             let systemInstruction = "";
             if (url === '/api/ai/deck') {
                systemInstruction = `You are an expert presentation designer. Respond ONLY with valid JSON.
Schema: { "title": "Main Title", "slides": [ { "type": "title", "title": "...", "subtitle": "...", "content": "...", "speakerNotes": "...", "requiresImage": boolean, "imagePrompt": "..." } ] }`;
                promptObj = { role: 'user', parts: [{ text: `Create a professional presentation about: "${body.topic}". Create 5-7 slides. First slide must be title.` }] };
             } else if (url === '/api/ai/rewrite') {
                systemInstruction = "You are an AI writing assistant for presentation slides. Return ONLY the final generated text. Do not include quotes, markdown formatting, or conversational filler.";
                promptObj = { role: 'user', parts: [{ text: `Instruction: ${body.instruction}\n\nCurrent Text:\n${body.currentText || "(None)"}` }] };
             } else if (url === '/api/ai/chat') {
                systemInstruction = "You are a brainstorming assistant for presentations. Provide concise, clear text that can easily be copied directly into a presentation slide.";
                promptObj = { role: 'user', parts: [{ text: JSON.stringify(body.messages) }] }; 
             }
             
             const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.textModel || 'gemini-3.1-pro-preview'}:generateContent?key=${settings.geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                   systemInstruction: { parts: [{text: systemInstruction}] },
                   contents: [promptObj],
                   generationConfig: { responseMimeType: url === '/api/ai/deck' ? 'application/json' : 'text/plain' }
                })
             });
             const gData = await geminiRes.json();
             if (!geminiRes.ok) throw new Error(gData.error?.message || "Gemini API failed");
             const genText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
             
             if (url === '/api/ai/deck') return JSON.parse(genText);
             return { text: genText.trim() };
          }
          
          if (url === '/api/ai/image') {
             throw new Error("Local image generation via Gemini REST API requires a backend or specific SDKs not available in this standalone fallback.");
          }
       }
    }
    throw error;
  }
};

const generateFullDeck = async (topic, aiSettings) => {
  return postJSON('/api/ai/deck', { topic, aiSettings });
};

const rewriteTextWithAI = async (currentText, instruction, aiSettings) => {
  const data = await postJSON('/api/ai/rewrite', { currentText, instruction, aiSettings });
  if (!data.text) throw new Error("Invalid AI response");
  return data.text;
};

const generateImage = async (prompt, aiSettings) => {
  const data = await postJSON('/api/ai/image', { prompt, aiSettings });
  if (!data.imageUrl) throw new Error("Failed to generate image");
  return data.imageUrl;
};

const generateAsciiByAI = async (prompt, aiSettings) => {
  const data = await postJSON('/api/ai/ascii', { prompt, aiSettings });
  if (!data.ascii) throw new Error("Failed to generate ASCII art");
  return data.ascii;
};

// --- Configurations ---
const FONTS = [
  // Web Fonts
  { name: 'Inter', family: '"Inter", sans-serif' },
  { name: 'Playfair Display', family: '"Playfair Display", serif' },
  { name: 'Poppins', family: '"Poppins", sans-serif' },
  { name: 'Montserrat', family: '"Montserrat", sans-serif' },
  { name: 'Oswald', family: '"Oswald", sans-serif' },
  { name: 'Raleway', family: '"Raleway", sans-serif' },
  { name: 'Merriweather', family: '"Merriweather", serif' },
  { name: 'Nunito', family: '"Nunito", sans-serif' },
  { name: 'Space Grotesk', family: '"Space Grotesk", sans-serif' },
  { name: 'Syne', family: '"Syne", sans-serif' },
  { name: 'Archivo Black', family: '"Archivo Black", sans-serif' },
  { name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif' },
  { name: 'Outfit', family: '"Outfit", sans-serif' },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif' },
  { name: 'Lora', family: '"Lora", serif' },
  { name: 'DM Sans', family: '"DM Sans", sans-serif' },
  { name: 'Sora', family: '"Sora", sans-serif' },
  { name: 'Manrope', family: '"Manrope", sans-serif' },
  { name: 'IBM Plex Sans', family: '"IBM Plex Sans", sans-serif' },
  { name: 'Urbanist', family: '"Urbanist", sans-serif' },
  { name: 'Fraunces', family: '"Fraunces", serif' },
  { name: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
  // System Fonts
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, serif' },
  { name: 'Courier New', family: '"Courier New", Courier, monospace' },
  { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { name: 'Georgia', family: 'Georgia, serif' },
  { name: 'Trebuchet MS', family: '"Trebuchet MS", Helvetica, sans-serif' },
  { name: 'Impact', family: 'Impact, Charcoal, sans-serif' },
  { name: 'Comic Sans MS', family: '"Comic Sans MS", cursive, sans-serif' },
  { name: 'Calibri', family: 'Calibri, sans-serif' },
  { name: 'Segoe UI', family: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
  { name: 'Tahoma', family: 'Tahoma, Geneva, sans-serif' },
  { name: 'Consolas', family: 'Consolas, monaco, monospace' },
];

const THEMES = [
  { id: 'pearl', name: 'Pearl', bg: '#ffffff', solidBg: '#ffffff', text: '#1e293b', accent: '#4f46e5', font: '"Inter", sans-serif', titleFont: '"Inter", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 56, subtitle: 24, body: 20 } },
  { id: 'vortex', name: 'Vortex', bg: '#0f172a', solidBg: '#0f172a', text: '#f8fafc', accent: '#38bdf8', font: '"Inter", sans-serif', titleFont: '"Montserrat", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 64, subtitle: 28, body: 22 } },
  { id: 'corporate', name: 'Corporate', bg: '#ffffff', solidBg: '#ffffff', text: '#0f172a', accent: '#2563eb', font: '"Plus Jakarta Sans", sans-serif', titleFont: '"Plus Jakarta Sans", sans-serif', bodyFont: '"Plus Jakarta Sans", sans-serif', sizes: { title: 54, subtitle: 24, body: 18 } },
  { id: 'elegance', name: 'Elegance', bg: '#fdf8f5', solidBg: '#fdf8f5', text: '#292524', accent: '#9a3412', font: '"Lora", serif', titleFont: '"Playfair Display", serif', bodyFont: '"Lora", serif', sizes: { title: 60, subtitle: 26, body: 20 } },
  { id: 'brutal', name: 'Brutalism', bg: '#eab308', solidBg: '#eab308', text: '#000000', accent: '#000000', font: '"Space Grotesk", sans-serif', titleFont: '"Archivo Black", sans-serif', bodyFont: '"Space Grotesk", sans-serif', sizes: { title: 78, subtitle: 26, body: 20 } },
  { id: 'aurora', name: 'Aurora', bg: '#030712', solidBg: '#030712', text: '#e2e8f0', accent: '#10b981', font: '"Syne", sans-serif', titleFont: '"Syne", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 68, subtitle: 24, body: 20 } },
  { id: 'neon-city', name: 'Neon City', bg: '#09090b', solidBg: '#09090b', text: '#f4f4f5', accent: '#f472b6', font: '"Outfit", sans-serif', titleFont: '"Outfit", sans-serif', bodyFont: '"Outfit", sans-serif', sizes: { title: 64, subtitle: 24, body: 20 } },
  { id: 'cyberpunk', name: 'Cyber', bg: '#000000', solidBg: '#000000', text: '#22c55e', accent: '#facc15', font: '"Oswald", sans-serif', titleFont: '"Oswald", sans-serif', bodyFont: '"Oswald", sans-serif', sizes: { title: 76, subtitle: 30, body: 22 } },
  { id: 'monochrome', name: 'Monochrome', bg: '#ffffff', solidBg: '#ffffff', text: '#000000', accent: '#737373', font: '"Inter", sans-serif', titleFont: '"Bebas Neue", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 82, subtitle: 30, body: 22 } },
  { id: 'coral-glow', name: 'Coral Glow', bg: 'linear-gradient(135deg, #fecdd3 0%, #fda4af 100%)', solidBg: '#fda4af', text: '#881337', accent: '#be123c', font: '"Poppins", sans-serif', titleFont: '"Poppins", sans-serif', bodyFont: '"Poppins", sans-serif', sizes: { title: 52, subtitle: 22, body: 18 } },
  { id: 'nebula', name: 'Nebulae', bg: 'linear-gradient(to bottom right, #170b2b, #000000)', solidBg: '#170b2b', text: '#e2e8f0', accent: '#c084fc', font: '"Inter", sans-serif', titleFont: '"Raleway", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 58, subtitle: 24, body: 20 } },
  { id: 'sunset', name: 'Sunset', bg: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)', solidBg: '#fdba74', text: '#7c2d12', accent: '#ea580c', font: '"Oswald", sans-serif', titleFont: '"Oswald", sans-serif', bodyFont: '"Inter", sans-serif', sizes: { title: 72, subtitle: 28, body: 22 } },
  { id: 'matcha', name: 'Matcha', bg: '#f0fdf4', solidBg: '#f0fdf4', text: '#064e3b', accent: '#059669', font: '"DM Sans", sans-serif', titleFont: '"DM Sans", sans-serif', bodyFont: '"DM Sans", sans-serif', sizes: { title: 56, subtitle: 24, body: 20 } },
  { id: 'signal', name: 'Signal', bg: '#f8fafc', solidBg: '#f8fafc', text: '#111827', accent: '#0ea5e9', font: '"Manrope", sans-serif', titleFont: '"Sora", sans-serif', bodyFont: '"Manrope", sans-serif', sizes: { title: 58, subtitle: 24, body: 19 } },
  { id: 'editorial', name: 'Editorial', bg: '#fbfbf8', solidBg: '#fbfbf8', text: '#18181b', accent: '#be185d', font: '"IBM Plex Sans", sans-serif', titleFont: '"Fraunces", serif', bodyFont: '"IBM Plex Sans", sans-serif', sizes: { title: 62, subtitle: 25, body: 19 } },
  { id: 'mint-lab', name: 'Mint Lab', bg: 'linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)', solidBg: '#ecfeff', text: '#134e4a', accent: '#14b8a6', font: '"Urbanist", sans-serif', titleFont: '"Urbanist", sans-serif', bodyFont: '"Manrope", sans-serif', sizes: { title: 60, subtitle: 24, body: 19 } },
  { id: 'graphite', name: 'Graphite', bg: '#18181b', solidBg: '#18181b', text: '#fafafa', accent: '#a3e635', font: '"IBM Plex Sans", sans-serif', titleFont: '"Sora", sans-serif', bodyFont: '"IBM Plex Sans", sans-serif', sizes: { title: 60, subtitle: 24, body: 19 } },
  { id: 'atelier', name: 'Atelier', bg: '#fff7ed', solidBg: '#fff7ed', text: '#1f2937', accent: '#dc2626', font: '"Manrope", sans-serif', titleFont: '"Fraunces", serif', bodyFont: '"Manrope", sans-serif', sizes: { title: 58, subtitle: 24, body: 19 } },
];

const PRESET_COLORS = ['#ffffff', '#000000', '#f8fafc', '#0f172a', '#eab308', '#3b82f6', '#ef4444', '#10b981', '#f472b6', '#c084fc'];

const generateId = () => Math.random().toString(36).substr(2, 9);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const PROJECT_STORAGE_KEY = 'ai-presentation-builder.project.v1';
const AI_SETTINGS_STORAGE_KEY = 'ai-presentation-builder.ai-settings.v1';

const AI_MODEL_CATALOGS = {
  gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  openai: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  claude: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'],
  ollama: ['llama3.3', 'llama3.2', 'qwen3', 'qwen2.5', 'mistral', 'gemma3', 'deepseek-r1', 'phi4']
};

const IMAGE_MODEL_CATALOGS = {
  gemini: [
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
    'imagen-4.0-generate-001',
    'imagen-3.0-generate-002'
  ],
  openai: [
    'gpt-image-1.5',
    'chatgpt-image-latest',
    'gpt-image-1',
    'gpt-image-1-mini',
    'gpt-image-2.0'
  ]
};

const DEFAULT_AI_SETTINGS = {
  textProvider: 'gemini',
  textModel: 'gemini-3.1-pro-preview',
  imageProvider: 'gemini',
  imageModel: 'imagen-4.0-generate-001',
  geminiApiKey: '',
  openaiApiKey: '',
  claudeApiKey: '',
  ollamaOrigin: 'http://localhost:11434',
  customTextModel: '',
  customImageModel: '',
  customOllamaModel: ''
};

const createProjectPayload = (state) => ({
  version: 1,
  savedAt: new Date().toISOString(),
  deckTitle: state.deckTitle,
  slides: state.slides,
  currentThemeId: state.currentThemeId,
  globalBgImage: state.globalBgImage,
  customGlobalBgColor: state.customGlobalBgColor,
  globalBgOpacity: state.globalBgOpacity,
  globalTitleScale: state.globalTitleScale,
  globalBodyScale: state.globalBodyScale,
  globalTitleFont: state.globalTitleFont,
  globalBodyFont: state.globalBodyFont,
  globalTitleColor: state.globalTitleColor,
  globalBodyColor: state.globalBodyColor,
  globalTitleWeight: state.globalTitleWeight,
  globalBodyWeight: state.globalBodyWeight
});

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getDeckStats = (slides) => {
  const textBlocks = slides.flatMap(slide => slide.elements.filter(el => el.type === 'text'));
  const words = textBlocks.reduce((total, el) => total + (el.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
  const images = slides.reduce((total, slide) => total + slide.elements.filter(el => el.type === 'image' || el.type === 'imagePlaceholder').length, 0);
  const notes = slides.filter(slide => slide.notes?.trim()).length;
  const overloadedSlides = slides.filter(slide => {
    const slideWords = slide.elements
      .filter(el => el.type === 'text')
      .reduce((total, el) => total + (el.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
    return slideWords > 95 || slide.elements.length > 7;
  }).length;
  const imagePlaceholders = slides.reduce((total, slide) => total + slide.elements.filter(el => el.type === 'imagePlaceholder').length, 0);
  const score = Math.max(0, 100 - overloadedSlides * 12 - imagePlaceholders * 8 + Math.min(notes * 2, 10));
  return { words, images, notes, overloadedSlides, imagePlaceholders, score };
};

// --- Main Application ---
export default function GammaCloudReplica() {
  const [appState, setAppState] = useState('home'); // 'home', 'generating', 'editor'
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [aiSettings, setAiSettings] = useState(DEFAULT_AI_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_AI_SETTINGS);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [cloudModels, setCloudModels] = useState({});
  const [ollamaStatus, setOllamaStatus] = useState('');
  const [modelListStatus, setModelListStatus] = useState('');
  const [isScanningOllama, setIsScanningOllama] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isPullingOllama, setIsPullingOllama] = useState(false);
  
  // Mobile Nav State
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  // Deck State
  const [slides, setSlides] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const skipHistorySave = useRef(false);
  const hasLoadedProject = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    if (slides.length === 0) return;
    if (skipHistorySave.current) {
      skipHistorySave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setHistory(prev => {
        const currentStr = JSON.stringify(slides);
        if (prev[historyIndex] === currentStr) return prev;
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(currentStr);
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [slides, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      skipHistorySave.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSlides(JSON.parse(history[newIndex]));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      skipHistorySave.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSlides(JSON.parse(history[newIndex]));
    }
  };

  const [deckTitle, setDeckTitle] = useState('Untitled Presentation');
  const [currentThemeId, setCurrentThemeId] = useState('pearl');
  const [globalBgImage, setGlobalBgImage] = useState(null);
  const [customGlobalBgColor, setCustomGlobalBgColor] = useState('');
  const [globalBgOpacity, setGlobalBgOpacity] = useState(1);
  const [globalTitleScale, setGlobalTitleScale] = useState(1);
  const [globalBodyScale, setGlobalBodyScale] = useState(1);
  const [globalTitleFont, setGlobalTitleFont] = useState('');
  const [globalBodyFont, setGlobalBodyFont] = useState('');
  const [globalTitleColor, setGlobalTitleColor] = useState('');
  const [globalBodyColor, setGlobalBodyColor] = useState('');
  const [globalTitleWeight, setGlobalTitleWeight] = useState('');
  const [globalBodyWeight, setGlobalBodyWeight] = useState('');
  const [localFonts, setLocalFonts] = useState<{name: string, family: string}[]>([]);
  
  // Editor State
  const [activeSlideId, setActiveSlideId] = useState(null);
  const [activeElementId, setActiveElementId] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState('format'); 
  
  // Generation & AI State
  const [promptInput, setPromptInput] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [aiTextInstruction, setAiTextInstruction] = useState('');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [bgImagePrompt, setBgImagePrompt] = useState('');
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  
  // Chatbot State
  const [chatMessages, setChatMessages] = useState([{ role: 'ai', text: "Hi! I'm your AI assistant. Need brainstorming ideas or specific content for your slides?" }]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [syncText, setSyncText] = useState('Sync All Slides to Global Style');

  const [bgSyncText, setBgSyncText] = useState('Clear All Slide Backgrounds');

  // Playback & Export
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSlideIndex, setPlaySlideIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [isBuildingApp, setIsBuildingApp] = useState(false);
  const [isConvertingAscii, setIsConvertingAscii] = useState<string | null>(null);

  const convertImageToAscii = async (src: string, elementId: string) => {
    setIsConvertingAscii(elementId);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if(!ctx) return;
      
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });

      const targetWidth = 100;
      const scale = targetWidth / img.width;
      const targetHeight = Math.floor(img.height * scale * 0.55); // Adjust for font aspect ratio

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const data = imgData.data;

      const chars = " .:-=+*#%@";
      let ascii = "";

      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
          const i = (y * targetWidth + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a === 0) {
            ascii += " ";
            continue;
          }

          const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          const charIdx = Math.floor(brightness * (chars.length - 1));
          ascii += chars[charIdx];
        }
        ascii += "\n";
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = img.width;
      outCanvas.height = img.height;
      const outCtx = outCanvas.getContext('2d');
      if(!outCtx) return;

      outCtx.fillStyle = '#0f0f0f';
      outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);

      outCtx.fillStyle = '#10b981';
      // font size based on height
      const fontSize = outCanvas.height / targetHeight;
      outCtx.font = `bold ${fontSize}px monospace`;
      outCtx.textBaseline = "top";

      const lines = ascii.split('\n');
      for (let i = 0; i < lines.length; i++) {
        outCtx.fillText(lines[i], 0, i * fontSize);
      }

      const newSrc = outCanvas.toDataURL('image/png');
      updateElement(elementId, { src: newSrc, objectFit: 'contain', asciiText: ascii });
    } catch (error) {
      console.error("Failed to convert image to ASCII", error);
      alert("Failed to convert image to ASCII.");
    } finally {
      setIsConvertingAscii(null);
    }
  };

  const loadLocalFonts = async () => {
    try {
      if (!('queryLocalFonts' in window)) {
        alert("Your browser does not support the Local Font Access API. Please type your font name manually in the custom field.");
        return;
      }
      // Request permission and get fonts
      const fonts = await (window as any).queryLocalFonts();
      const uniqueFonts = Array.from(new Set(fonts.map((f: any) => f.family))).sort() as string[];
      const mapFonts = uniqueFonts.map((f: string) => ({ name: f, family: `"${f}", sans-serif` }));
      setLocalFonts(mapFonts);
    } catch (err) {
      console.error(err);
      alert("Could not load local fonts. Please ensure you granted permission when prompted by the browser.");
    }
  };

  // Dragging & Files State
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const bgFileInputRef = useRef(null);
  const pptxImportRef = useRef(null);
  const projectImportRef = useRef(null);
  const slideBgFileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeState, setResizeState] = useState(null);
  const [snapGuides, setSnapGuides] = useState([]);
  const [isGeneratingSlideBg, setIsGeneratingSlideBg] = useState(false);
  const [slideBgPrompt, setSlideBgPrompt] = useState('');
  const [draggedSlideIndex, setDraggedSlideIndex] = useState(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState(null);

  // Add External Dependencies
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Cinzel:wght@400;700&family=DM+Sans:wght@400;700&family=Fraunces:wght@500;700&family=IBM+Plex+Sans:wght@400;600;700&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&family=Lora:wght@400;700&family=Manrope:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Nunito:wght@400;600;700&family=Oswald:wght@400;600&family=Outfit:wght@400;700&family=Playfair+Display:wght@400;700&family=Plus+Jakarta+Sans:wght@400;700&family=Poppins:wght@400;600;700&family=Raleway:wght@400;600;700&family=Space+Grotesk:wght@400;700&family=Sora:wght@400;600;700&family=Syne:wght@400;700;800&family=Urbanist:wght@400;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const activeTheme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];
  const activeSlideIndex = slides.findIndex(s => s.id === activeSlideId);
  const activeSlide = slides[activeSlideIndex];
  const activeElement = activeSlide?.elements.find(e => e.id === activeElementId);
  const deckStats = getDeckStats(slides);

  const restoreProject = (project) => {
    if (!project?.slides?.length) throw new Error('Project file does not contain slides');
    setDeckTitle(project.deckTitle || 'Untitled Presentation');
    setSlides(project.slides);
    setActiveSlideId(project.slides[0].id);
    setActiveElementId(null);
    setCurrentThemeId(project.currentThemeId || 'pearl');
    setGlobalBgImage(project.globalBgImage || null);
    setCustomGlobalBgColor(project.customGlobalBgColor || '');
    setGlobalBgOpacity(project.globalBgOpacity ?? 1);
    setGlobalTitleScale(project.globalTitleScale ?? 1);
    setGlobalBodyScale(project.globalBodyScale ?? 1);
    setGlobalTitleFont(project.globalTitleFont || '');
    setGlobalBodyFont(project.globalBodyFont || '');
    setGlobalTitleColor(project.globalTitleColor || '');
    setGlobalBodyColor(project.globalBodyColor || '');
    setGlobalTitleWeight(project.globalTitleWeight || '');
    setGlobalBodyWeight(project.globalBodyWeight || '');
    setAppState('editor');
  };

  // Computed Backgrounds
  const resolveSlideBackground = (slide) => {
    if (slide?.customBgColor) return slide.customBgColor;
    if (customGlobalBgColor) return customGlobalBgColor;
    return activeTheme.bg;
  };

  // --- Theme UI Colors based on App Dark Mode ---
  const uiBgMain = isDarkMode ? 'bg-[#121212]' : 'bg-[#f3f2f1]';
  const uiBgPanel = isDarkMode ? 'bg-[#1e1e1e]' : 'bg-white';
  const uiBgSecondary = isDarkMode ? 'bg-[#2a2a2a]' : 'bg-[#faf9f8]';
  const uiText = isDarkMode ? 'text-gray-100' : 'text-gray-800';
  const uiTextMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const uiBorder = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const uiHover = isDarkMode ? 'hover:bg-[#333333]' : 'hover:bg-gray-100';

  const sanitizeAiSettings = (settings = aiSettings) => ({
    textProvider: settings.textProvider,
    textModel: settings.customTextModel?.trim() || settings.textModel,
    imageProvider: settings.imageProvider,
    imageModel: settings.customImageModel?.trim() || settings.imageModel,
    geminiApiKey: settings.geminiApiKey,
    openaiApiKey: settings.openaiApiKey,
    claudeApiKey: settings.claudeApiKey,
    ollamaOrigin: settings.ollamaOrigin
  });

  const updateSettingsDraft = (updates) => setSettingsDraft(prev => ({ ...prev, ...updates }));

  const saveAiSettings = () => {
    setAiSettings(settingsDraft);
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settingsDraft));
    setShowSettingsModal(false);
  };

  const openSettings = () => {
    setSettingsDraft(aiSettings);
    setShowSettingsModal(true);
  };

  const scanOllamaModels = async () => {
    setIsScanningOllama(true);
    setOllamaStatus('Scanning Ollama...');
    try {
      const origin = encodeURIComponent(settingsDraft.ollamaOrigin || DEFAULT_AI_SETTINGS.ollamaOrigin);
      const response = await fetch(`/api/ollama/models?origin=${origin}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not scan Ollama');
      setOllamaModels(data.models || []);
      setOllamaStatus(data.models?.length ? `Found ${data.models.length} local model(s).` : 'Ollama is reachable, but no local models were found.');
    } catch (error) {
      setOllamaStatus(error.message || 'Could not connect to Ollama.');
    } finally {
      setIsScanningOllama(false);
    }
  };

  const fetchProviderModels = async () => {
    setIsFetchingModels(true);
    setModelListStatus(`Fetching ${settingsDraft.textProvider} models...`);
    try {
      const data = await postJSON('/api/models/list', { provider: settingsDraft.textProvider, aiSettings: sanitizeAiSettings(settingsDraft) });
      const models = data.models || [];
      setCloudModels(prev => ({ ...prev, [settingsDraft.textProvider]: models }));
      if (models.length && !models.includes(settingsDraft.textModel)) {
        updateSettingsDraft({ textModel: models[0], customTextModel: '' });
      }
      setModelListStatus(models.length ? `Loaded ${models.length} model(s).` : 'No models returned.');
    } catch (error) {
      setModelListStatus(error.message || 'Could not fetch model list.');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const pullOllamaModel = async () => {
    const model = settingsDraft.customOllamaModel?.trim() || settingsDraft.customTextModel?.trim() || settingsDraft.textModel;
    if (!model) return;
    setIsPullingOllama(true);
    setOllamaStatus(`Pulling ${model}. This can take a while for large models...`);
    try {
      const data = await postJSON('/api/ollama/pull', { origin: settingsDraft.ollamaOrigin, model });
      setOllamaStatus(data.status ? `Ollama: ${data.status}` : `${model} is ready.`);
      updateSettingsDraft({ textProvider: 'ollama', textModel: model, customTextModel: model });
      await scanOllamaModels();
    } catch (error) {
      setOllamaStatus(error.message || 'Ollama pull failed.');
    } finally {
      setIsPullingOllama(false);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (!saved) return;
      const parsed = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) };
      setAiSettings(parsed);
      setSettingsDraft(parsed);
    } catch (error) {
      console.warn('Failed to load AI settings', error);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedProject.current) return;
    hasLoadedProject.current = true;
    try {
      const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!saved) return;
      const project = JSON.parse(saved);
      if (project?.slides?.length) {
        restoreProject(project);
        setLastSavedAt(project.savedAt || null);
      }
    } catch (error) {
      console.warn('Failed to restore saved project', error);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedProject.current || slides.length === 0) return;
    const timer = setTimeout(() => {
      try {
        const payload = createProjectPayload({
          deckTitle, slides, currentThemeId, globalBgImage, customGlobalBgColor,
          globalBgOpacity, globalTitleScale, globalBodyScale, globalTitleFont,
          globalBodyFont, globalTitleColor, globalBodyColor, globalTitleWeight,
          globalBodyWeight
        });
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));
        setLastSavedAt(payload.savedAt);
      } catch (error) {
        console.warn('Autosave failed', error);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [
    deckTitle, slides, currentThemeId, globalBgImage, customGlobalBgColor,
    globalBgOpacity, globalTitleScale, globalBodyScale, globalTitleFont,
    globalBodyFont, globalTitleColor, globalBodyColor, globalTitleWeight,
    globalBodyWeight
  ]);

  // --- Core Actions ---
  const handleGenerateDeck = async () => {
    if (!promptInput.trim()) return;
    setAppState('generating');
    setLoadingMsg('Consulting AI architect...');
    try {
      const data = await generateFullDeck(promptInput, sanitizeAiSettings());
      setDeckTitle(data.title);
      setLoadingMsg('Structuring slides & layouts...');
      
      const newSlides = data.slides.map((s, index) => {
        const elements = [];
        if (index === 0 || s.type === 'title') {
          elements.push({ id: generateId(), type: 'text', textRole: 'title', text: s.title, x: 10, y: 20, w: 80, h: 35, align: 'center', useThemeColor: true });
          if (s.subtitle) elements.push({ id: generateId(), type: 'text', textRole: 'subtitle', text: s.subtitle, x: 10, y: 60, w: 80, h: 25, align: 'center', opacity: 0.8, useThemeColor: true });
        } else {
          // FIX: Added generous vertical spacing to strictly prevent title and body overlaps
          elements.push({ id: generateId(), type: 'text', textRole: 'contentTitle', text: s.title, x: 8, y: 8, w: 84, h: 20, align: 'left', useThemeColor: true });
          const bodyText = s.content || (s.bullets ? s.bullets.map(b => `• ${b}`).join('\n\n') : '• Add content here');
          
          if (s.requiresImage) {
            elements.push({ id: generateId(), type: 'text', textRole: 'body', text: bodyText, x: 8, y: 35, w: 45, h: 56, align: 'left', opacity: 0.9, useThemeColor: true });
            elements.push({ id: generateId(), type: 'imagePlaceholder', prompt: s.imagePrompt, x: 55, y: 35, w: 37, h: 56 });
          } else {
            elements.push({ id: generateId(), type: 'text', textRole: 'body', text: bodyText, x: 8, y: 35, w: 84, h: 56, align: 'left', opacity: 0.9, useThemeColor: true });
          }
        }
        return { id: generateId(), elements, notes: s.speakerNotes || '' };
      });
      setSlides(newSlides);
      setActiveSlideId(newSlides[0].id);
      setAppState('editor');
    } catch (err) {
      alert("Generation failed: " + err.message);
      setAppState('home');
    }
  };

  const handleGenerateImageForPlaceholder = async (elementId, prompt) => {
    updateElement(elementId, { isLoading: true });
    try {
      const imageUrl = await generateImage(prompt, sanitizeAiSettings());
      updateElement(elementId, { type: 'image', src: imageUrl, isLoading: false });
    } catch (err) {
      alert("Image generation failed.");
      updateElement(elementId, { isLoading: false });
    }
  };

  const handleGenerateAsciiForPlaceholder = async (elementId, prompt) => {
    updateElement(elementId, { isLoading: true });
    try {
      const asciiText = await generateAsciiByAI(prompt, sanitizeAiSettings());
      
      const outCanvas = document.createElement('canvas');
      const lines = asciiText.split('\n');
      const targetHeight = lines.length;
      const targetWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
      outCanvas.width = 1024;
      outCanvas.height = 1024;
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
        outCtx.fillStyle = '#0f0f0f';
        outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
        
        outCtx.fillStyle = '#10b981';
        const fontSizeX = outCanvas.width / (targetWidth || 1);
        const fontSizeY = outCanvas.height / (targetHeight || 1);
        const fontSize = Math.min(fontSizeX, fontSizeY * 0.6);
        outCtx.font = `bold ${fontSize}px monospace`;
        outCtx.textBaseline = "top";
        
        const startY = (outCanvas.height - (targetHeight * fontSize)) / 2;
        const startX = (outCanvas.width - (targetWidth * (fontSize * 0.6))) / 2;
        
        for (let i = 0; i < lines.length; i++) {
          outCtx.fillText(lines[i], Math.max(0, startX), startY + (i * fontSize));
        }
        
        const imageUrl = outCanvas.toDataURL('image/png');
        updateElement(elementId, { type: 'image', src: imageUrl, asciiText, objectFit: 'contain', isLoading: false });
      }
    } catch (err) {
      console.error(err);
      alert("ASCII generation failed: " + err.message);
      updateElement(elementId, { isLoading: false });
    }
  };

  const handleGenerateBgImage = async () => {
    if (!bgImagePrompt.trim()) return;
    setIsGeneratingBg(true);
    try {
      const imageUrl = await generateImage(bgImagePrompt, sanitizeAiSettings());
      setGlobalBgImage(imageUrl);
      setCustomGlobalBgColor('');
      setGlobalBgOpacity(1);
      setBgImagePrompt('');
    } catch (err) {
      alert("Background generation failed.");
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const handleGenerateSlideBgImage = async () => {
    if (!slideBgPrompt.trim()) return;
    setIsGeneratingSlideBg(true);
    try {
      const imageUrl = await generateImage(slideBgPrompt, sanitizeAiSettings());
      updateActiveSlide({ bgImage: imageUrl, customBgColor: null, bgOpacity: 1 });
      setSlideBgPrompt('');
    } catch (err) {
      alert("Slide background generation failed.");
    } finally {
      setIsGeneratingSlideBg(false);
    }
  };

  const handleAITextRewrite = async (instruction) => {
    if (!activeElement || activeElement.type !== 'text') return;
    setIsGeneratingText(true);
    try {
      const newText = await rewriteTextWithAI(activeElement.text, instruction, sanitizeAiSettings());
      updateElement(activeElement.id, { text: newText });
      setAiTextInstruction('');
    } catch (err) {
      console.error("AI Text Error:", err);
      alert("AI Text editing failed: " + err.message);
    } finally {
      setIsGeneratingText(false);
    }
  };

  const handleChatSubmit = async () => {
    if(!chatInput.trim()) return;
    const newMsgs = [...chatMessages, { role: 'user', text: chatInput }];
    setChatMessages(newMsgs);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await postJSON('/api/ai/chat', { messages: newMsgs, aiSettings: sanitizeAiSettings() });
      const textResp = response.text;
      setChatMessages([...newMsgs, { role: 'ai', text: textResp || "Sorry, I couldn't generate a response." }]);
    } catch (err) {
      setChatMessages([...newMsgs, { role: 'ai', text: "Error connecting to AI." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // --- File Import / Export Handlers ---
  const handleLocalImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const newEl = { id: generateId(), type: 'image', src: event.target.result, x: 30, y: 20, w: 40, h: 50 };
      updateActiveSlide({ elements: [...activeSlide.elements, newEl] });
      setActiveElementId(newEl.id);
      setRightPanelTab('format');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGlobalBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setGlobalBgImage(event.target.result);
      setCustomGlobalBgColor('');
      setGlobalBgOpacity(1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSlideBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      updateActiveSlide({ bgImage: event.target.result, customBgColor: null, bgOpacity: 1 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const exportProjectFile = () => {
    const payload = createProjectPayload({
      deckTitle, slides, currentThemeId, globalBgImage, customGlobalBgColor,
      globalBgOpacity, globalTitleScale, globalBodyScale, globalTitleFont,
      globalBodyFont, globalTitleColor, globalBodyColor, globalTitleWeight,
      globalBodyWeight
    });
    const safeTitle = (deckTitle || 'presentation').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    downloadBlob(JSON.stringify(payload, null, 2), `${safeTitle || 'presentation'}.aipres.json`, 'application/json');
  };

  const handleProjectImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(String(event.target?.result || ''));
        restoreProject(project);
      } catch (error) {
        alert('Failed to import project file. Please choose a valid .aipres.json export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportSpeakerNotes = () => {
    const content = slides.map((slide, index) => {
      const title = slide.elements.find(el => el.type === 'text' && (el.textRole === 'title' || el.textRole === 'contentTitle'))?.text || `Slide ${index + 1}`;
      return `## ${index + 1}. ${title}\n\n${slide.notes?.trim() || '_No speaker notes._'}`;
    }).join('\n\n');
    downloadBlob(`# ${deckTitle} Speaker Notes\n\n${content}\n`, `${deckTitle.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-speaker-notes.md`, 'text/markdown');
  };

  const handlePPTXImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setAppState('generating');
    setLoadingMsg('Parsing PPTX File & Layouts...');
    
    try {
      const zip = await new JSZip().loadAsync(file);
      const slideFiles = Object.keys(zip.files).filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/));
      
      if(slideFiles.length === 0) throw new Error("No slides found in PPTX.");

      slideFiles.sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)[1]) - parseInt(b.match(/slide(\d+)\.xml/)[1]));

      const parsedSlides = [];
      const parser = new DOMParser();

      const EMU_W = 9144000;
      const EMU_H = 5143500;

      for (const filename of slideFiles) {
        const slideNum = filename.match(/slide(\d+)\.xml/)[1];
        const xmlText = await zip.files[filename].async("text");
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const relsFilename = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
        let relsDoc = null;
        if (zip.files[relsFilename]) {
          const relsText = await zip.files[relsFilename].async("text");
          relsDoc = parser.parseFromString(relsText, "text/xml");
        }

        const getMediaBase64 = async (rId) => {
          if (!relsDoc) return null;
          const relNodes = relsDoc.getElementsByTagName("Relationship");
          for (let i = 0; i < relNodes.length; i++) {
             if (relNodes[i].getAttribute("Id") === rId) {
                const target = relNodes[i].getAttribute("Target");
                const mediaPath = target.replace("../", "ppt/");
                if (zip.files[mediaPath]) {
                    const ext = mediaPath.split('.').pop();
                    const base64 = await zip.files[mediaPath].async("base64");
                    return `data:image/${ext};base64,${base64}`;
                }
             }
          }
          return null;
        };

        let slideBgColor = null;
        let slideBgImage = null;

        const bgNodes = xmlDoc.getElementsByTagName("p:bg");
        if (bgNodes.length > 0) {
          const srgbNode = bgNodes[0].getElementsByTagName("a:srgbClr")[0];
          if (srgbNode) slideBgColor = '#' + srgbNode.getAttribute("val");

          const blipNode = bgNodes[0].getElementsByTagName("a:blip")[0];
          if (blipNode) {
            const rId = blipNode.getAttribute("r:embed");
            slideBgImage = await getMediaBase64(rId);
          }
        }

        const elements = [];
        const spNodes = xmlDoc.getElementsByTagName("p:sp");
        for (let i = 0; i < spNodes.length; i++) {
          const sp = spNodes[i];
          const txBody = sp.getElementsByTagName("p:txBody")[0];
          if (!txBody) continue;

          const pNodes = sp.getElementsByTagName("a:p");
          const paras = [];
          let isBold = false;
          let fontSize = null;
          let fontColor = null;
          let align = 'left';

          for (let j = 0; j < pNodes.length; j++) {
             const tNodes = pNodes[j].getElementsByTagName("a:t");
             const txt = Array.from(tNodes).map(n => n.textContent).join('');

             if (j === 0 && tNodes.length > 0) {
                const rPr = pNodes[j].getElementsByTagName("a:rPr")[0];
                if (rPr) {
                   if (rPr.getAttribute("b") === "1") isBold = true;
                   if (rPr.getAttribute("sz")) fontSize = parseInt(rPr.getAttribute("sz")) / 100;
                   const srgbClr = rPr.getElementsByTagName("a:srgbClr")[0];
                   if (srgbClr) fontColor = '#' + srgbClr.getAttribute("val");
                }
                const pPr = pNodes[j].getElementsByTagName("a:pPr")[0];
                if (pPr) {
                   const algn = pPr.getAttribute("algn");
                   if (algn === 'ctr') align = 'center';
                   else if (algn === 'r') align = 'right';
                }
             }
             if (txt || pNodes.length > 1) paras.push(txt);
          }
          const textContent = paras.join('\n').trim();
          if (!textContent) continue;

          const off = sp.getElementsByTagName("a:off")[0];
          const ext = sp.getElementsByTagName("a:ext")[0];
          let x = 10, y = 10, w = 80, h = 10;

          if (off && ext) {
            x = (parseInt(off.getAttribute("x")) / EMU_W) * 100;
            y = (parseInt(off.getAttribute("y")) / EMU_H) * 100;
            w = (parseInt(ext.getAttribute("cx")) / EMU_W) * 100;
            h = (parseInt(ext.getAttribute("cy")) / EMU_H) * 100;
          }

          elements.push({
            id: generateId(), type: 'text', 
            textRole: (i === 0 && fontSize > 28) ? 'title' : 'body',
            text: textContent, x, y, w, h,
            fontSize: fontSize || (i === 0 ? 40 : 20),
            fontWeight: isBold ? 'bold' : 'normal',
            color: fontColor || '#000000',
            align: align, useThemeColor: !fontColor
          });
        }

        const picNodes = xmlDoc.getElementsByTagName("p:pic");
        for (let i = 0; i < picNodes.length; i++) {
          const pic = picNodes[i];
          const blipNode = pic.getElementsByTagName("a:blip")[0];
          if (!blipNode) continue;
          
          const rId = blipNode.getAttribute("r:embed");
          const imgSrc = await getMediaBase64(rId);
          if (!imgSrc) continue;

          const off = pic.getElementsByTagName("a:off")[0];
          const ext = pic.getElementsByTagName("a:ext")[0];
          let x = 30, y = 30, w = 40, h = 40;

          if (off && ext) {
            x = (parseInt(off.getAttribute("x")) / EMU_W) * 100;
            y = (parseInt(off.getAttribute("y")) / EMU_H) * 100;
            w = (parseInt(ext.getAttribute("cx")) / EMU_W) * 100;
            h = (parseInt(ext.getAttribute("cy")) / EMU_H) * 100;
          }

          elements.push({
            id: generateId(), type: 'image', src: imgSrc, x, y, w, h,
            objectFit: 'cover' // Keep original aesthetic structure on import
          });
        }

        if (elements.length === 0) {
           elements.push({ id: generateId(), type: 'text', text: 'Blank Slide', textRole: 'title', x: 10, y: 40, w: 80, h: 20, align: 'center', useThemeColor: true, opacity: 0.3 });
        }
        
        parsedSlides.push({ 
          id: generateId(), elements, customBgColor: slideBgColor, bgImage: slideBgImage, bgOpacity: 1
        });
      }

      setDeckTitle(file.name.replace('.pptx', ''));
      setSlides(parsedSlides);
      setActiveSlideId(parsedSlides[0].id);
      setGlobalBgImage(null);
      setCustomGlobalBgColor('');
      setAppState('editor');
    } catch (err) {
      console.error(err);
      alert("Failed to parse PPTX file. Ensure it is a valid .pptx format.");
      setAppState('home');
    }
    e.target.value = '';
  };

  const exportToPPTX = async () => {
    console.log("exportToPPTX called");
    setIsExporting(true);
    console.log("Starting PPTX export...");
    try {
      let pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      slides.forEach(slide => {
        let pptSlide = pptx.addSlide();
        if (slide.notes?.trim()) pptSlide.addNotes(slide.notes.trim());
        
        if (slide.bgImage) {
          pptSlide.background = { data: slide.bgImage, transparency: (1 - (slide.bgOpacity ?? 1)) * 100 };
        } else if (slide.customBgColor) {
          pptSlide.background = { color: slide.customBgColor.replace('#', '') };
        } else if (globalBgImage) {
          pptSlide.background = { data: globalBgImage, transparency: (1 - globalBgOpacity) * 100 };
        } else if (customGlobalBgColor) {
          pptSlide.background = { color: customGlobalBgColor.replace('#', '') };
        } else {
          pptSlide.background = { color: activeTheme.solidBg.replace('#', '') };
        }

        slide.elements.forEach(el => {
          try {
            if (el.type === 'text') {
              const isHeading = el.textRole === 'title' || el.textRole === 'subtitle' || el.textRole === 'contentTitle';
              const scale = isHeading ? globalTitleScale : globalBodyScale;
              const resolvedFont = el.fontFamily || (isHeading ? (globalTitleFont || activeTheme.titleFont) : (globalBodyFont || activeTheme.bodyFont)) || activeTheme.font;
              
              let baseFontSize = 24;
              if (activeTheme.sizes) {
                  if (el.textRole === 'title') baseFontSize = activeTheme.sizes.title;
                  else if (el.textRole === 'contentTitle') baseFontSize = Math.round(activeTheme.sizes.title * 0.55);
                  else if (el.textRole === 'subtitle') baseFontSize = activeTheme.sizes.subtitle;
                  else baseFontSize = activeTheme.sizes.body;
              }
              const resolvedFontSize = (el.fontSize || baseFontSize) * scale;
              const resolvedFontWeight = el.fontWeight || (isHeading ? (globalTitleWeight || 'bold') : (globalBodyWeight || 'normal'));

              const baseThemeColor = isHeading ? (globalTitleColor || activeTheme.text) : (globalBodyColor || activeTheme.text);
              const hexColor = el.useThemeColor ? baseThemeColor.replace('#','') : (el.color || '#000000').replace('#','');
              
              pptSlide.addText(el.text, {
                x: `${el.x}%`, y: `${el.y}%`, w: `${el.w}%`, h: `${el.h}%`,
                fontSize: resolvedFontSize,
                color: hexColor,
                bold: resolvedFontWeight === 'bold',
                align: el.align,
                fontFace: getSafeSystemFont(resolvedFont),
                valign: 'top',
                transparency: (1 - (el.opacity ?? 1)) * 100
              });
            } else if (el.type === 'image' && el.src) {
              let fit = el.objectFit || 'cover';
              let imgOpts: any = { 
                data: el.src, x: `${el.x}%`, y: `${el.y}%`, w: `${el.w}%`, h: `${el.h}%`, 
                transparency: Math.round((1 - (el.opacity ?? 1)) * 100),
                rounding: (el.borderRadius || 0) > 5
              };
              
              if (fit === 'contain') {
                 imgOpts.sizing = { type: 'contain', w: `${el.w}%`, h: `${el.h}%` };
              } else if (fit === 'cover' || fit === 'crop') {
                 imgOpts.sizing = { type: 'crop', w: `${el.w}%`, h: `${el.h}%` };
              }
              pptSlide.addImage(imgOpts);
            }
          } catch(e) { console.error("Error adding element to pptx", e); }
        });
      });

      console.log("PPTX constructed, writing file...");
      await pptx.writeFile({ fileName: `${deckTitle}.pptx` });
      console.log("PPTX file written successfully");
    } catch (err) {
      console.error("PPTX export error:", err);
      alert("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToImagePPTX = async () => {
    setIsExportingImages(true);
    
    await document.fonts.ready; // Await custom web fonts to be completely loaded!
    await delay(500); // Give react render and fonts breathing room

    try {
      let pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const slideNode = document.getElementById(`export-slide-${slide.id}`);
        
        if (slideNode) {
          const imgData = await toJpeg(slideNode, { 
            quality: 0.95,
            pixelRatio: 2,
            style: {
              transform: 'scale(1)',
              transformOrigin: 'top left'
            }
          });
          
          let pptSlide = pptx.addSlide();
          pptSlide.background = { data: imgData };
        }
      }

      await pptx.writeFile({ fileName: `${deckTitle}_(Exact_Images).pptx` });
    } catch (err) {
      console.error(err);
      alert("Image Export failed: " + err.message);
    } finally {
      setIsExportingImages(false);
    }
  };

  const exportToHTML = () => {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${deckTitle}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Cinzel:wght@400;700&family=DM+Sans:wght@400;700&family=Inter:wght@400;600;700&family=Lora:wght@400;700&family=Montserrat:wght@400;600;700&family=Nunito:wght@400;600;700&family=Oswald:wght@400;600&family=Outfit:wght@400;700&family=Playfair+Display:wght@400;700&family=Plus+Jakarta+Sans:wght@400;700&family=Poppins:wght@400;600;700&family=Raleway:wght@400;600;700&family=Space+Grotesk:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #0f0f0f; overflow: hidden; font-family: sans-serif; }
  #app { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
  .slide { position: absolute; width: 100%; max-width: 1920px; aspect-ratio: 16/9; box-shadow: 0 0 40px rgba(0,0,0,0.5); overflow: hidden; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; container-type: inline-size; border-radius: 12px; }
  .slide.active { opacity: 1; pointer-events: auto; z-index: 10; }
  .element { position: absolute; box-sizing: border-box; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; z-index: 1; }
  #controls { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 12px 24px; border-radius: 50px; display: flex; gap: 20px; align-items: center; z-index: 100; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
  button { background: none; border: none; color: white; cursor: pointer; font-size: 16px; font-weight: bold; padding: 0 10px; transition: color 0.2s; }
  button:hover { color: #818cf8; }
  @media (max-aspect-ratio: 16/9) { .slide { width: 100vw; height: calc(100vw * 9 / 16); max-width: none; border-radius: 0; } }
  @media (min-aspect-ratio: 16/9) { .slide { height: 100vh; width: calc(100vh * 16 / 9); max-width: none; border-radius: 0; } }
</style>
</head>
<body>
<div id="app">
`;

    slides.forEach((slide, index) => {
        const baseBg = slide.customBgColor || customGlobalBgColor || activeTheme.bg;
        html += `  <div class="slide" id="slide-${index}" style="background: ${baseBg};">\n`;
        
        if (slide.bgImage || globalBgImage) {
            const bgImg = slide.bgImage || globalBgImage;
            const bgOp = slide.bgImage ? (slide.bgOpacity ?? 1) : globalBgOpacity;
            html += `    <div style="position:absolute; inset:0; background-image: url('${bgImg}'); background-size: cover; background-position: center; opacity: ${bgOp}; z-index: 0; pointer-events: none;"></div>\n`;
        }

        slide.elements.forEach(el => {
            const isHeading = el.textRole === 'title' || el.textRole === 'subtitle' || el.textRole === 'contentTitle';
            const scale = isHeading ? globalTitleScale : globalBodyScale;
            const resolvedFont = el.fontFamily || (isHeading ? (globalTitleFont || activeTheme.titleFont) : (globalBodyFont || activeTheme.bodyFont)) || activeTheme.font;
            const baseThemeColor = isHeading ? (globalTitleColor || activeTheme.text) : (globalBodyColor || activeTheme.text);
            const resolvedColor = el.useThemeColor ? baseThemeColor : (el.color || '#000000');
            
            let baseFontSize = 24;
            if (activeTheme.sizes) {
                if (el.textRole === 'title') baseFontSize = activeTheme.sizes.title;
                else if (el.textRole === 'contentTitle') baseFontSize = Math.round(activeTheme.sizes.title * 0.55);
                else if (el.textRole === 'subtitle') baseFontSize = activeTheme.sizes.subtitle;
                else baseFontSize = activeTheme.sizes.body;
            }
            const resolvedFontSize = (el.fontSize || baseFontSize) * scale;
            const resolvedFontWeight = el.fontWeight || (isHeading ? (globalTitleWeight || 'bold') : (globalBodyWeight || 'normal'));
            const resolvedLineHeight = (el.textRole === 'title' || el.textRole === 'contentTitle') ? '1.2' : '1.5';
            
            const elStyle = `left: ${el.x}%; top: ${el.y}%; width: ${el.w}%; height: ${el.type === 'text' ? 'auto' : el.h + '%'}; min-height: ${el.type === 'text' ? el.h + '%' : 'auto'}; opacity: ${el.opacity ?? 1};`;
            
            if (el.type === 'text') {
                const safeFont = resolvedFont.replace(/"/g, "'");
                const textStyle = `font-family: ${safeFont}; font-size: ${resolvedFontSize * 0.1388}cqw; font-weight: ${resolvedFontWeight}; color: ${resolvedColor}; text-align: ${el.align}; line-height: ${resolvedLineHeight};`;
                const safeText = el.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                html += `    <div class="element" style="${elStyle} ${textStyle}">${safeText}</div>\n`;
            } else if (el.type === 'image') {
                const fit = el.objectFit || 'cover';
                const radius = el.borderRadius || 0;
                const imgStyle = `object-fit: ${fit}; border-radius: ${radius}px; width: 100%; height: 100%; pointer-events: none;`;
                html += `    <div class="element" style="${elStyle}"><img src="${el.src}" style="${imgStyle}" /></div>\n`;
            }
        });

        html += `  </div>\n`;
    });

    html += `</div>
<div id="controls">
  <button onclick="prevSlide()">&#8592; Prev</button>
  <span id="counter" style="font-size: 14px; opacity: 0.8;">1 / ${slides.length}</span>
  <button onclick="nextSlide()">Next &#8594;</button>
</div>
${tagS}>
  let curr = 0;
  const slideElements = document.querySelectorAll('.slide');
  const counter = document.getElementById('counter');
  function show(idx) {
    slideElements.forEach((s, i) => s.classList.toggle('active', i === idx));
    counter.innerText = (idx + 1) + ' / ' + slideElements.length;
  }
  function nextSlide() { if (curr < slideElements.length - 1) { curr++; show(curr); } }
  function prevSlide() { if (curr > 0) { curr--; show(curr); } }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Space') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  });
  show(0);
${tagE}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckTitle}_Standalone_Presentation.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStandaloneApp = async (type: 'base64' | 'standard' = 'base64') => {
    try {
      setIsBuildingApp(true);
      const response = await fetch(`/api/export-app?type=${type}`);
      if (!response.ok) throw new Error('Failed to export app');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'base64' ? 'standalone-app-base64.html' : 'standalone-app-editable.html';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export application. Please wait for the background build to complete and try again.');
    } finally {
      setIsBuildingApp(false);
    }
  };

  const renderSourceModal = () => {
    if (!showSourceModal) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
         <div className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 ${uiBgPanel} ${uiBorder} border relative flex flex-col max-h-[90vh]`}>
            <button onClick={() => setShowSourceModal(false)} className={`absolute top-4 right-4 p-2 rounded-full ${uiHover} ${uiTextMuted}`}><X className="w-5 h-5"/></button>
            <h2 className={`text-xl font-bold mb-4 ${uiText} flex items-center gap-2`}><Code2 className="w-6 h-6 text-indigo-500" /> Download Standalone App</h2>
            <p className={`text-sm mb-4 ${uiTextMuted}`}>Export your entire application as a single, standalone HTML file that you can run anywhere.</p>
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-indigo-900/10 border-indigo-500/20 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-800'}`}>
               <p className="text-sm font-semibold mb-2">Standalone Export Features:</p>
               <ul className="list-disc pl-5 text-sm space-y-2 opacity-90">
                 <li>All JavaScript and CSS are inlined into a single file.</li>
                 <li>Works offline (except for external images/APIs).</li>
                 <li>Perfect for sharing or hosting on static sites.</li>
               </ul>
            </div>
            
            {isBuildingApp && (
              <div className="mt-4 p-4 rounded-xl bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-500/20 border flex items-center gap-3">
                 <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                 <span className="text-sm text-indigo-800 dark:text-indigo-200 font-medium">Building and packaging application... this may take 10-15 seconds.</span>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
               <button onClick={() => setShowSourceModal(false)} className={`px-4 py-2 text-sm font-medium rounded-lg ${uiHover} ${uiText}`} disabled={isBuildingApp}>Cancel</button>
               <button onClick={() => handleDownloadStandaloneApp('base64')} disabled={isBuildingApp} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-md">
                  <FileCode className="w-4 h-4" /> Base64 HTML
               </button>
               <button onClick={() => handleDownloadStandaloneApp('standard')} disabled={isBuildingApp} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-md">
                  <Code2 className="w-4 h-4" /> Editable HTML
               </button>
            </div>
         </div>
      </div>
    );
  };

  const renderSettingsModal = () => {
    if (!showSettingsModal) return null;
    const textModels = settingsDraft.textProvider === 'ollama'
      ? Array.from(new Set([...(ollamaModels || []), ...AI_MODEL_CATALOGS.ollama]))
      : Array.from(new Set([...(cloudModels[settingsDraft.textProvider] || []), ...(AI_MODEL_CATALOGS[settingsDraft.textProvider] || [])]));
    const imageModels = IMAGE_MODEL_CATALOGS[settingsDraft.imageProvider] || [];
    return (
       <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
         <div className={`w-full max-w-4xl rounded-2xl shadow-2xl ${uiBgPanel} ${uiBorder} border flex flex-col max-h-full sm:max-h-[85svh] overflow-hidden`}>
           <div className={`px-4 sm:px-6 py-4 sm:py-5 border-b ${uiBorder} flex items-start justify-between gap-4 shrink-0`}>
            <div>
              <h2 className={`text-xl font-bold ${uiText} flex items-center gap-2`}><Settings className="w-6 h-6 text-indigo-500" /> AI Settings</h2>
              <p className={`text-sm mt-1 ${uiTextMuted}`}>Choose providers, models, API keys, and local Ollama models. Settings are saved in this browser.</p>
            </div>
            <button onClick={() => setShowSettingsModal(false)} className={`p-2 rounded-full ${uiHover} ${uiTextMuted}`}><X className="w-5 h-5"/></button>
          </div>

          <div className="p-6 min-h-0 overflow-y-auto space-y-6 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-[#252525] border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold flex items-center gap-2 mb-4 ${uiText}`}><PlugZap className="w-4 h-4 text-indigo-500"/> Text AI</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Provider</label>
                    <select
                      value={settingsDraft.textProvider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        updateSettingsDraft({ textProvider: provider, textModel: AI_MODEL_CATALOGS[provider]?.[0] || '', customTextModel: '' });
                      }}
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Claude</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Model</label>
                    <select
                      value={settingsDraft.textModel}
                      onChange={(e) => updateSettingsDraft({ textModel: e.target.value, customTextModel: '' })}
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                    >
                      {textModels.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Custom model ID</label>
                    <input
                      value={settingsDraft.customTextModel}
                      onChange={(e) => updateSettingsDraft({ customTextModel: e.target.value })}
                      placeholder={settingsDraft.textProvider === 'ollama' ? 'e.g. llama3.2:3b or qwen3:8b' : 'Paste any provider model ID'}
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
                    />
                  </div>
                  <button onClick={settingsDraft.textProvider === 'ollama' ? scanOllamaModels : fetchProviderModels} disabled={isFetchingModels || isScanningOllama} className={`w-full py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${uiBorder} ${uiHover} ${uiText}`}>
                    {(isFetchingModels || isScanningOllama) ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                    {settingsDraft.textProvider === 'ollama' ? 'Scan Local Models' : 'Fetch Available Models'}
                  </button>
                  {modelListStatus && settingsDraft.textProvider !== 'ollama' && <p className={`text-xs ${uiTextMuted}`}>{modelListStatus}</p>}
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-[#252525] border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold flex items-center gap-2 mb-4 ${uiText}`}><ImageIcon className="w-4 h-4 text-indigo-500"/> Image AI</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Provider</label>
                    <select
                      value={settingsDraft.imageProvider}
                      onChange={(e) => {
                        const provider = e.target.value;
                        updateSettingsDraft({ imageProvider: provider, imageModel: IMAGE_MODEL_CATALOGS[provider]?.[0] || '', customImageModel: '' });
                      }}
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                    >
                      <option value="gemini">Gemini Imagen</option>
                      <option value="openai">OpenAI Images</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Model</label>
                    <select
                      value={settingsDraft.imageModel}
                      onChange={(e) => updateSettingsDraft({ imageModel: e.target.value, customImageModel: '' })}
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                    >
                      {imageModels.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted}`}>Custom image model</label>
                    <input
                      value={settingsDraft.customImageModel}
                      onChange={(e) => updateSettingsDraft({ customImageModel: e.target.value })}
                      placeholder="Paste any supported image model ID"
                      className={`mt-1 w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-[#252525] border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`text-sm font-semibold flex items-center gap-2 mb-4 ${uiText}`}><KeyRound className="w-4 h-4 text-indigo-500"/> API Keys</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input type="password" value={settingsDraft.geminiApiKey} onChange={(e) => updateSettingsDraft({ geminiApiKey: e.target.value })} placeholder="Gemini API key" className={`text-sm p-2 border rounded-lg ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                <input type="password" value={settingsDraft.openaiApiKey} onChange={(e) => updateSettingsDraft({ openaiApiKey: e.target.value })} placeholder="OpenAI API key" className={`text-sm p-2 border rounded-lg ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                <input type="password" value={settingsDraft.claudeApiKey} onChange={(e) => updateSettingsDraft({ claudeApiKey: e.target.value })} placeholder="Claude API key" className={`text-sm p-2 border rounded-lg ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
              </div>
              <p className={`text-[11px] mt-2 ${uiTextMuted}`}>Leaving a key blank lets the server use matching environment variables when configured.</p>
            </div>

            <div className={`rounded-xl border p-4 ${isDarkMode ? 'bg-[#252525] border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`text-sm font-semibold flex items-center gap-2 mb-4 ${uiText}`}><ServerCog className="w-4 h-4 text-indigo-500"/> Ollama</h3>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <input value={settingsDraft.ollamaOrigin} onChange={(e) => updateSettingsDraft({ ollamaOrigin: e.target.value })} placeholder="http://localhost:11434" className={`text-sm p-2 border rounded-lg ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                <button onClick={scanOllamaModels} disabled={isScanningOllama} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  {isScanningOllama ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>} Scan
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-3">
                <input value={settingsDraft.customOllamaModel} onChange={(e) => updateSettingsDraft({ customOllamaModel: e.target.value })} placeholder="Model to download, e.g. llama3.2:3b" className={`text-sm p-2 border rounded-lg ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
                <button onClick={pullOllamaModel} disabled={isPullingOllama} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  {isPullingOllama ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>} Pull
                </button>
              </div>
              {ollamaStatus && <p className={`text-xs mt-3 ${uiTextMuted}`}>{ollamaStatus}</p>}
            </div>
          </div>

          <div className={`px-6 py-4 border-t ${uiBorder} flex flex-col sm:flex-row justify-between gap-3 shrink-0`}>
            <button onClick={() => { setSettingsDraft(DEFAULT_AI_SETTINGS); setOllamaStatus(''); setModelListStatus(''); }} className={`px-4 py-2 text-sm font-medium rounded-lg ${uiHover} ${uiText}`}>Reset</button>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowSettingsModal(false)} className={`px-4 py-2 text-sm font-medium rounded-lg ${uiHover} ${uiText}`}>Cancel</button>
              <button onClick={saveAiSettings} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-md">
                <Save className="w-4 h-4"/> Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Sync All Elements to Global Theme Button
  const forceApplyGlobalTypography = () => {
    // Removed window.confirm which gets blocked in secure iframe environments
    setSlides(slides.map(slide => ({
      ...slide,
      bgImage: null,
      customBgColor: null,
      bgOpacity: 1,
      elements: slide.elements.map(el => {
        if (el.type === 'text') {
          return { ...el, useThemeColor: true, fontFamily: null, fontSize: null, fontWeight: null, color: null };
        }
        return el;
      })
    })));
    
    setSyncText('✓ Synced Successfully!');
    setTimeout(() => setSyncText('Sync All Slides to Global Style'), 2000);
  };

  const clearAllSlideBackgrounds = () => {
    setSlides(slides.map(slide => ({
      ...slide,
      bgImage: null,
      customBgColor: null,
      bgOpacity: globalBgOpacity
    })));
    setBgSyncText('✓ Backgrounds Cleared!');
    setTimeout(() => setBgSyncText('Clear All Slide Backgrounds'), 2000);
  };

  // --- Editor Actions ---
  const addSlide = () => {
    const newSlide = {
      id: generateId(),
      notes: '',
      elements: [
        { id: generateId(), type: 'text', textRole: 'contentTitle', text: 'New Slide Title', x: 8, y: 8, w: 84, h: 20, align: 'left', useThemeColor: true },
        { id: generateId(), type: 'text', textRole: 'body', text: 'Add an introductory paragraph here to give context.\n\n• First main point\n• Second key detail', x: 8, y: 35, w: 84, h: 56, align: 'left', opacity: 0.9, useThemeColor: true }
      ]
    };
    setSlides([...slides, newSlide]);
    setActiveSlideId(newSlide.id);
    setActiveElementId(null);
  };

  const updateActiveSlide = (updates) => {
    const newSlides = [...slides];
    newSlides[activeSlideIndex] = { ...newSlides[activeSlideIndex], ...updates };
    setSlides(newSlides);
  };

  const updateElement = (id, updates) => {
    const newElements = activeSlide.elements.map(el => el.id === id ? { ...el, ...updates } : el);
    updateActiveSlide({ elements: newElements });
  };

  const addElement = (type) => {
    if (type === 'upload') {
      fileInputRef.current?.click();
      return;
    }
    
    let newEl;
    if (type === 'title') {
      newEl = { id: generateId(), type: 'text', textRole: 'title', text: 'New Title', x: 10, y: 10, w: 80, h: 20, align: 'center', useThemeColor: true };
    } else if (type === 'text') {
      newEl = { id: generateId(), type: 'text', textRole: 'body', text: 'New Text Block', x: 30, y: 40, w: 40, h: 10, align: 'left', useThemeColor: true };
    } else {
      newEl = { id: generateId(), type: 'imagePlaceholder', prompt: 'Describe an image...', x: 30, y: 20, w: 40, h: 50 };
    }
    
    updateActiveSlide({ elements: [...activeSlide.elements, newEl] });
    setActiveElementId(newEl.id);
    setRightPanelTab('format');
  };

  const deleteElement = (id) => {
    updateActiveSlide({ elements: activeSlide.elements.filter(el => el.id !== id) });
    if (activeElementId === id) setActiveElementId(null);
  };

  const reorderElement = (id, direction) => {
    const els = [...activeSlide.elements];
    const idx = els.findIndex(e => e.id === id);
    if (idx < 0) return;
    const [el] = els.splice(idx, 1);
    
    if (direction === 'front') els.push(el);
    else if (direction === 'back') els.unshift(el);
    else if (direction === 'forward') els.splice(Math.min(els.length, idx + 1), 0, el);
    else if (direction === 'backward') els.splice(Math.max(0, idx - 1), 0, el);
    
    updateActiveSlide({ elements: els });
  };

  // --- Slide Drag & Drop Handlers ---
  const handleSlideDragStart = (e, index) => {
    setDraggedSlideIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleSlideDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlideIndex !== index) setDragOverSlideIndex(index);
  };
  
  const handleSlideDragEnd = () => {
    setDraggedSlideIndex(null);
    setDragOverSlideIndex(null);
  };
  
  const handleSlideDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedSlideIndex === null || draggedSlideIndex === targetIndex) {
      handleSlideDragEnd();
      return;
    }
    const newSlides = [...slides];
    const [draggedItem] = newSlides.splice(draggedSlideIndex, 1);
    newSlides.splice(targetIndex, 0, draggedItem);
    setSlides(newSlides);
    handleSlideDragEnd();
  };

  // --- Drag & Smart Snapping Logic ---
  const handlePointerDown = (e, elId) => {
    if (isPlaying) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveElementId(elId);
    setRightPanelTab('format');
    
    const el = activeSlide.elements.find(e => e.id === elId);
    if (!el || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXPercent = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
    const mouseYPercent = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;

    setDragOffset({ x: mouseXPercent - el.x, y: mouseYPercent - el.y });
    setIsDragging(true);
  };

  const handleResizePointerDown = (e, dir) => {
    if (isPlaying) return;
    e.stopPropagation();
    e.preventDefault(); 
    if (!activeElement || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setResizeState({
      dir, startX: e.clientX, startY: e.clientY,
      origX: activeElement.x, origY: activeElement.y,
      origW: activeElement.w, origH: activeElement.h,
      canvasW: rect.width, canvasH: rect.height
    });
  };

  const handlePointerMove = useCallback((e) => {
    if (!activeElementId || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();

    if (resizeState) {
      const deltaXPct = ((e.clientX - resizeState.startX) / canvasRect.width) * 100;
      const deltaYPct = ((e.clientY - resizeState.startY) / canvasRect.height) * 100;

      let newX = resizeState.origX;
      let newY = resizeState.origY;
      let newW = resizeState.origW;
      let newH = resizeState.origH;

      if (resizeState.dir.includes('e')) newW += deltaXPct;
      if (resizeState.dir.includes('s')) newH += deltaYPct;
      if (resizeState.dir.includes('w')) { newX += deltaXPct; newW -= deltaXPct; }
      if (resizeState.dir.includes('n')) { newY += deltaYPct; newH -= deltaYPct; }

      if (e.shiftKey || activeElement.lockAspectRatio) {
        const aspect = resizeState.origW / resizeState.origH;
        if (Math.abs(deltaXPct) > Math.abs(deltaYPct)) {
           newH = newW / aspect;
           if (resizeState.dir.includes('n')) newY = resizeState.origY + (resizeState.origH - newH);
        } else {
           newW = newH * aspect;
           if (resizeState.dir.includes('w')) newX = resizeState.origX + (resizeState.origW - newW);
        }
      }

      newW = Math.max(5, newW);
      newH = Math.max(5, newH);

      updateElement(activeElementId, { x: newX, y: newY, w: newW, h: newH });
      return;
    }

    if (isDragging) {
      let newX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100 - dragOffset.x;
      let newY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100 - dragOffset.y;
      newX = Math.max(0, Math.min(newX, 100 - activeElement?.w));
      newY = Math.max(0, Math.min(newY, 100 - activeElement?.h));
      
      let activeGuides = [];
      const snapThreshold = 1.5;
      const elCenterY = newY + activeElement.h / 2;
      const elCenterX = newX + activeElement.w / 2;

      if (Math.abs(elCenterX - 50) < snapThreshold) { newX = 50 - activeElement.w/2; activeGuides.push({ type: 'v', pos: 50 }); }
      if (Math.abs(elCenterY - 50) < snapThreshold) { newY = 50 - activeElement.h/2; activeGuides.push({ type: 'h', pos: 50 }); }
      if (Math.abs(newX - 5) < snapThreshold) { newX = 5; activeGuides.push({ type: 'v', pos: 5 }); } 
      if (Math.abs((newX + activeElement.w) - 95) < snapThreshold) { newX = 95 - activeElement.w; activeGuides.push({ type: 'v', pos: 95 }); } 
      
      activeSlide.elements.forEach(other => {
        if (other.id === activeElement.id) return;
        const otherCenterX = other.x + other.w / 2;
        const otherCenterY = other.y + other.h / 2;
        
        if (Math.abs(newX - other.x) < snapThreshold) { newX = other.x; activeGuides.push({ type: 'v', pos: other.x }); }
        if (Math.abs(elCenterX - otherCenterX) < snapThreshold) { newX = otherCenterX - activeElement.w/2; activeGuides.push({ type: 'v', pos: otherCenterX }); }
        
        if (Math.abs(newY - other.y) < snapThreshold) { newY = other.y; activeGuides.push({ type: 'h', pos: other.y }); }
        if (Math.abs(elCenterY - otherCenterY) < snapThreshold) { newY = otherCenterY - activeElement.h/2; activeGuides.push({ type: 'h', pos: otherCenterY }); }
      });

      setSnapGuides(activeGuides);
      updateElement(activeElementId, { x: newX, y: newY });
    }
  }, [isDragging, resizeState, activeElementId, dragOffset, activeElement, activeSlide]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setResizeState(null);
    setSnapGuides([]);
  }, []);

  useEffect(() => {
    if (isDragging || resizeState) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    } else {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, resizeState, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlaying) {
        if (e.key === 'Escape') setIsPlaying(false);
        if (e.key === 'ArrowRight' || e.key === 'Space') setPlaySlideIndex(p => Math.min(slides.length - 1, p + 1));
        if (e.key === 'ArrowLeft') setPlaySlideIndex(p => Math.max(0, p - 1));
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeElementId) {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          deleteElement(activeElementId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, activeElementId, slides.length]);


  // --- Canvas Renderer ---
  const renderCanvasElement = (el, mode = 'canvas') => {
    const isPresentation = mode === 'presentation';
    const isThumbnail = mode === 'thumbnail';
    const isExport = mode === 'export';
    const isSelected = el.id === activeElementId && mode === 'canvas';
    
    const isHeading = el.textRole === 'title' || el.textRole === 'subtitle' || el.textRole === 'contentTitle';
    const scale = isHeading ? globalTitleScale : globalBodyScale;
    const resolvedFont = el.fontFamily || (isHeading ? (globalTitleFont || activeTheme.titleFont) : (globalBodyFont || activeTheme.bodyFont)) || activeTheme.font;
    const baseThemeColor = isHeading ? (globalTitleColor || activeTheme.text) : (globalBodyColor || activeTheme.text);
    const resolvedColor = el.useThemeColor ? baseThemeColor : (el.color || '#000000');
    
    let baseFontSize = 24;
    if (activeTheme.sizes) {
        if (el.textRole === 'title') baseFontSize = activeTheme.sizes.title;
        else if (el.textRole === 'contentTitle') baseFontSize = Math.round(activeTheme.sizes.title * 0.55);
        else if (el.textRole === 'subtitle') baseFontSize = activeTheme.sizes.subtitle;
        else baseFontSize = activeTheme.sizes.body;
    }
    const resolvedFontSize = (el.fontSize || baseFontSize) * scale;
    const resolvedFontWeight = el.fontWeight || (isHeading ? (globalTitleWeight || 'bold') : (globalBodyWeight || 'normal'));
    
    // Looser Line Heights for beautiful vertical rendering
    const resolvedLineHeight = (el.textRole === 'title' || el.textRole === 'contentTitle') ? '1.2' : '1.5';

    const baseStyle = {
      position: 'absolute',
      left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, 
      ...(el.type === 'text' ? { height: 'auto', minHeight: `${el.h}%` } : { height: `${el.h}%` }),
      cursor: (isPresentation || isThumbnail || isExport) ? 'default' : (isDragging && isSelected ? 'grabbing' : 'grab'),
      border: isSelected && !isExport ? `2px solid ${activeTheme.accent}` : '2px solid transparent',
      boxSizing: 'border-box',
      transition: (isDragging || resizeState || isExport) ? 'none' : 'all 0.2s ease',
      fontFamily: resolvedFont,
      opacity: el.opacity ?? 1,
      touchAction: 'none',
      zIndex: 1
    };

    const handleStyle = {
      position: 'absolute', width: '14px', height: '14px', backgroundColor: '#fff',
      border: `2px solid ${activeTheme.accent}`, borderRadius: '50%', zIndex: 10,
      touchAction: 'none'
    };

    const renderHandles = () => {
      if (!isSelected || isPresentation || isThumbnail || isExport) return null;
      return (
        <>
          <div onPointerDown={e => handleResizePointerDown(e, 'nw')} style={{...handleStyle, top: -7, left: -7, cursor: 'nwse-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'n')} style={{...handleStyle, top: -7, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'ne')} style={{...handleStyle, top: -7, right: -7, cursor: 'nesw-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'e')} style={{...handleStyle, top: '50%', right: -7, transform: 'translateY(-50%)', cursor: 'ew-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'se')} style={{...handleStyle, bottom: -7, right: -7, cursor: 'nwse-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 's')} style={{...handleStyle, bottom: -7, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'sw')} style={{...handleStyle, bottom: -7, left: -7, cursor: 'nesw-resize'}} />
          <div onPointerDown={e => handleResizePointerDown(e, 'w')} style={{...handleStyle, top: '50%', left: -7, transform: 'translateY(-50%)', cursor: 'ew-resize'}} />
        </>
      );
    };

    if (el.type === 'imagePlaceholder') {
      if (isThumbnail || isExport) {
         return <div key={el.id} style={{...baseStyle, backgroundColor: `${activeTheme.text}20`, borderRadius: '4px', border: `1px dashed ${activeTheme.text}40`}} />;
      }

      return (
        <div 
          key={el.id} 
          style={{...baseStyle, backgroundColor: `${activeTheme.text}15`, borderRadius: '8px', backdropFilter: 'blur(4px)'}}
          onPointerDown={(e) => !isPresentation && handlePointerDown(e, el.id)}
          className="flex flex-col items-center justify-center p-4 text-center group overflow-hidden"
        >
          {renderHandles()}
          {el.isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: activeTheme.accent }} />
              <span className="text-sm font-medium opacity-80" style={{ color: activeTheme.text }}>Generating...</span>
            </div>
          ) : (
            <>
              <ImagePlus className="w-8 h-8 mb-3 opacity-50" style={{ color: activeTheme.text }} />
              <p className="text-xs opacity-70 mb-4 line-clamp-3" style={{ color: activeTheme.text }}>{el.prompt}</p>
              {!isPresentation && (
                <div className="flex flex-col gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleGenerateImageForPlaceholder(el.id, el.prompt); }} className="px-4 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-2 shadow-lg hover:scale-105 transition-transform" style={{ backgroundColor: activeTheme.accent, color: '#fff' }}>
                    <Sparkles className="w-4 h-4" /> AI Image
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleGenerateAsciiForPlaceholder(el.id, el.prompt); }} className="px-4 py-2 rounded-full text-sm font-medium flex items-center justify-center gap-2 shadow hover:scale-105 transition-transform" style={{ backgroundColor: `${activeTheme.text}20`, color: activeTheme.text }}>
                    <Terminal className="w-4 h-4" /> AI ASCII Art
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (el.type === 'image') {
      return (
        <div 
          key={el.id} 
          style={{...baseStyle, backgroundImage: `url("${el.src}")`, backgroundSize: el.objectFit || 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', borderRadius: `${el.borderRadius || 0}px`}}
          onPointerDown={(e) => !isPresentation && !isExport && handlePointerDown(e, el.id)}
        >
          {renderHandles()}
        </div>
      );
    }

    return (
      <div
        key={el.id}
        style={{...baseStyle, padding: '4px', display: 'flex', flexDirection: 'column'}}
        onPointerDown={(e) => !isPresentation && !isExport && handlePointerDown(e, el.id)}
      >
        {renderHandles()}
        <div style={{ 
          width: '100%', 
          fontSize: isExport ? `${resolvedFontSize * 0.1388 * 12.8}px` : `${resolvedFontSize * 0.1388}cqw`,
          fontWeight: resolvedFontWeight, 
          color: resolvedColor, 
          textAlign: el.align, 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word', 
          overflowWrap: 'anywhere',
          lineHeight: resolvedLineHeight
        }}>
          {el.text}
        </div>
      </div>
    );
  };


  // --- VIEWS ---

  if (appState === 'home') {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#0f0f0f]' : 'bg-[#f7f5f2]'} relative overflow-hidden flex flex-col items-center justify-center p-4 md:p-6 font-['Inter',sans-serif] transition-colors`}>
        <AsciiBackground isDarkMode={isDarkMode} />
        {renderSourceModal()}
        {renderSettingsModal()}
        <div className={`w-full max-w-3xl rounded-2xl shadow-xl p-6 md:p-10 text-center border ${uiBgPanel} ${uiBorder} relative z-10`}>
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
               <input type="file" accept=".pptx" ref={pptxImportRef} onChange={handlePPTXImport} className="hidden" />
               <button onClick={() => pptxImportRef.current?.click()} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${uiBorder} ${uiHover} ${uiTextMuted} hover:text-indigo-500 transition-colors whitespace-nowrap`}>
                 <FolderOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Import PPTX</span>
               </button>
               <button onClick={() => {
                 const blankSlide = { id: generateId(), notes: '', elements: [{ id: generateId(), type: 'text', textRole: 'title', text: 'Untitled Presentation', x: 10, y: 40, w: 80, h: 20, align: 'center', useThemeColor: true }], customBgColor: null, bgImage: null, bgOpacity: 1 };
                 setDeckTitle('Untitled Presentation');
                 setSlides([blankSlide]);
                 setActiveSlideId(blankSlide.id);
                 setGlobalBgImage(null);
                 setCustomGlobalBgColor('');
                 setAppState('editor');
               }} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${uiBorder} ${uiHover} ${uiTextMuted} hover:text-indigo-500 transition-colors whitespace-nowrap`}>
                 <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Blank Slide</span>
               </button>
               {slides.length > 0 && (
                 <button onClick={() => setAppState('editor')} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors whitespace-nowrap`}>
                   <Zap className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Resume Project</span>
                 </button>
               )}
               <input type="file" accept=".json,.aipres.json" ref={projectImportRef} onChange={handleProjectImport} className="hidden" />
               <button onClick={() => projectImportRef.current?.click()} className={`shrink-0 hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border ${uiBorder} ${uiHover} ${uiTextMuted} hover:text-indigo-500 transition-colors whitespace-nowrap`}>
                 <FileUp className="w-3.5 h-3.5" /> Project
               </button>
             </div>
             <div className="flex items-center gap-1">
               <button onClick={() => setShowSourceModal(true)} className={`p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`} title="Source Code Setup">
                  <Code2 className="w-5 h-5" />
               </button>
               <button onClick={openSettings} className={`p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`} title="AI Settings">
                  <Settings className="w-5 h-5" />
               </button>
               <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`}>
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
               </button>
             </div>
          </div>
          <div className="flex flex-col items-center justify-center mb-6 w-full px-2 overflow-hidden">
             <div className="bg-indigo-900/5 dark:bg-indigo-900/20 border border-indigo-500/10 shadow-inner p-2 sm:p-4 rounded-xl flex justify-center w-full max-w-[450px]">
                <pre 
                  style={{ fontFamily: '"Consolas", "Courier New", monospace', lineHeight: '1', letterSpacing: '0px' }}
                  className="text-indigo-500 select-none text-left inline-block text-[4.5px] min-[360px]:text-[5.5px] min-[400px]:text-[6px] sm:text-[8px] md:text-[10px]"
                >
                  {asciiLogo}
                </pre>
             </div>
          </div>
          <p className={`text-sm md:text-lg mb-4 font-medium ${uiText}`}>Describe what you want to make, and the AI will draft the entire deck in seconds.</p>
          <button onClick={openSettings} className={`inline-flex items-center gap-2 mb-10 px-3 py-1.5 rounded-full border text-xs font-semibold ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
            <Settings className="w-3.5 h-3.5" /> {aiSettings.textProvider} · {aiSettings.customTextModel || aiSettings.textModel}
          </button>
          
          <div className="relative max-w-2xl mx-auto">
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="e.g. A pitch deck for a sustainable coffee brand..."
              className={`w-full h-32 p-5 pb-16 text-base md:text-lg border-2 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 resize-none transition-all outline-none ${isDarkMode ? 'bg-[#2a2a2a] border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
              onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerateDeck(); } }}
            />
            <div className="absolute bottom-4 right-4 flex gap-3">
              <button onClick={handleGenerateDeck} disabled={!promptInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900/50 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-all">
                <Wand2 className="w-4 h-4" /> Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'generating') {
    return (
      <div className={`min-h-screen ${uiBgMain} flex flex-col items-center justify-center p-6 font-['Inter',sans-serif]`}>
         <div className="flex flex-col items-center gap-6">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className={`text-xl font-semibold animate-pulse ${uiText}`}>{loadingMsg}</div>
            <div className={`w-64 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <div className="h-full bg-indigo-600 w-1/2 animate-[progress_1.5s_ease-in-out_infinite]"></div>
            </div>
         </div>
         <style>{`@keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
      </div>
    );
  }

  if (isPlaying) {
    const playSlide = slides[playSlideIndex];
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center font-['Inter',sans-serif]">
        <div 
          className="relative w-full max-w-7xl aspect-video bg-white overflow-hidden shadow-2xl transition-all duration-500" 
          style={{ background: resolveSlideBackground(playSlide), containerType: 'inline-size' }}
        >
          {(playSlide.bgImage || globalBgImage) && (
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${playSlide.bgImage || globalBgImage}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: playSlide.bgImage ? (playSlide.bgOpacity ?? 1) : globalBgOpacity, zIndex: 0 }} />
          )}
          {playSlide.elements.map(el => renderCanvasElement(el, 'presentation'))}
          <div className="absolute bottom-4 md:bottom-6 left-0 right-0 flex justify-center gap-4 opacity-0 hover:opacity-100 transition-opacity duration-300">
            <div className="bg-black/60 backdrop-blur-md text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full flex items-center gap-4 md:gap-6 text-xs md:text-sm shadow-xl">
              <button onClick={() => setPlaySlideIndex(Math.max(0, playSlideIndex - 1))} className="hover:text-indigo-400 transition-colors"><ChevronLeft className="w-4 h-4 md:w-5 md:h-5" /></button>
              <span className="font-medium tracking-wide">{playSlideIndex + 1} / {slides.length}</span>
              <button onClick={() => setPlaySlideIndex(Math.min(slides.length - 1, playSlideIndex + 1))} className="hover:text-indigo-400 transition-colors"><ChevronLeft className="w-4 h-4 md:w-5 md:h-5 rotate-180" /></button>
              <div className="w-px h-4 bg-white/20"></div>
              <button onClick={() => setIsPlaying(false)} className="hover:text-red-400 transition-colors font-medium">Exit</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Editor View ---
  return (
    <div className={`flex flex-col h-screen ${uiBgMain} ${uiText} font-['Inter',sans-serif] overflow-hidden transition-colors`}>
      
      {renderSourceModal()}
      {renderSettingsModal()}
      
      {/* Hidden Offscreen Container for HTML2Canvas Image Export */}
      <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none overflow-hidden h-0 w-0">
        {slides.map(slide => (
           <div key={`export-${slide.id}`} id={`export-slide-${slide.id}`} style={{ width: '1280px', height: '720px', background: resolveSlideBackground(slide), position: 'relative', overflow: 'hidden' }}>
              {(slide.bgImage || globalBgImage) && (
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${slide.bgImage || globalBgImage}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: slide.bgImage ? (slide.bgOpacity ?? 1) : globalBgOpacity, zIndex: 0 }} />
              )}
              {slide.elements.map(el => renderCanvasElement(el, 'export'))}
           </div>
        ))}
      </div>

      {/* Top Navigation */}
      <div className={`${uiBgPanel} ${uiBorder} border-b flex items-center px-4 py-3 shrink-0 shadow-sm z-30 justify-between transition-colors`}>
        <div className="flex items-center gap-2 md:gap-4 shrink min-w-0">
          <div className="w-8 h-8 shrink-0 bg-indigo-600 rounded flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition" onClick={() => setAppState('home')}>
             <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="flex items-center text-xs md:text-sm overflow-hidden">
            <span className={`hidden sm:inline ${uiTextMuted} cursor-pointer hover:${uiText}`} onClick={() => setAppState('home')}>Home</span>
            <span className={`hidden sm:inline mx-2 ${uiBorder.replace('border-', 'text-')}`}>/</span>
            <input 
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
              className={`font-semibold bg-transparent border-none outline-none px-1 py-1 rounded focus:ring-2 focus:ring-indigo-500/50 transition-all w-28 sm:w-40 md:w-64 truncate ${uiHover} ${uiText}`}
            />
            <button onClick={openSettings} className={`hidden xl:flex items-center gap-1.5 ml-2 px-2 py-1 rounded-full border text-[11px] ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`} title="AI provider settings">
              <PlugZap className="w-3 h-3" />
              {aiSettings.textProvider} / {aiSettings.customTextModel || aiSettings.textModel}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <input type="file" accept=".pptx" ref={pptxImportRef} onChange={handlePPTXImport} className="hidden" />
          <input type="file" accept=".json,.aipres.json" ref={projectImportRef} onChange={handleProjectImport} className="hidden" />
          <button onClick={() => pptxImportRef.current?.click()} className={`hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors border ${uiBorder} ${uiHover} ${uiTextMuted}`}>
            <FolderOpen className="w-4 h-4" />
          </button>
          <button onClick={() => projectImportRef.current?.click()} className={`hidden xl:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors border ${uiBorder} ${uiHover} ${uiTextMuted}`} title="Import project JSON">
            <FileUp className="w-4 h-4" />
          </button>
          <button onClick={exportProjectFile} className={`hidden xl:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors border ${uiBorder} ${uiHover} ${uiTextMuted}`} title="Save project JSON">
            <Save className="w-4 h-4" />
          </button>
          {lastSavedAt && (
            <span className={`hidden xl:inline text-[11px] ${uiTextMuted}`}>Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          
          <button onClick={() => setShowSourceModal(true)} className={`hidden sm:block p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`} title="Source Code Setup">
             <Code2 className="w-4 h-4" />
          </button>
          <button onClick={openSettings} className={`hidden md:block p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`} title="AI Settings">
             <Settings className="w-4 h-4" />
          </button>
          
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`hidden sm:block p-2 rounded-full ${uiHover} ${uiTextMuted} transition-colors`}>
             {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className={`hidden sm:block w-px h-6 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          
          {/* Dropdown Export Menu */}
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={isExporting || isExportingImages} className={`flex items-center gap-2 px-2 md:px-3 py-1.5 text-sm font-medium rounded-md transition-colors border ${uiBorder} ${uiHover} ${uiText}`}>
              {(isExporting || isExportingImages) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 
              <span className="hidden md:inline">{(isExporting || isExportingImages) ? 'Exporting...' : 'Export'}</span>
              <DropdownIcon className="w-3 h-3 ml-1" />
            </button>
            {showExportMenu && (
              <div className={`absolute top-full right-0 mt-2 w-48 md:w-56 rounded-lg shadow-xl border ${uiBorder} ${uiBgPanel} z-50 overflow-hidden`}>
                <button onClick={() => { setShowExportMenu(false); exportToPPTX(); }} className={`w-full text-left px-4 py-3 text-sm flex flex-col transition-colors ${uiHover}`}>
                  <span className={`font-semibold ${uiText}`}>Editable PPTX</span>
                  <span className={`text-[10px] ${uiTextMuted} mt-0.5`}>Fonts converted to safe system fonts. Layouts remain editable.</span>
                </button>
                <div className={`w-full h-px ${uiBorder}`}></div>
                <button onClick={() => { setShowExportMenu(false); exportToImagePPTX(); }} className={`w-full text-left px-4 py-3 text-sm flex flex-col transition-colors ${uiHover}`}>
                  <span className={`font-semibold ${uiText}`}>Exact Look PPTX</span>
                  <span className={`text-[10px] ${uiTextMuted} mt-0.5`}>Slides exported as high-res images. Preserves 100% visual fidelity.</span>
                </button>
                <div className={`w-full h-px ${uiBorder}`}></div>
                <button onClick={() => { setShowExportMenu(false); exportToHTML(); }} className={`w-full text-left px-4 py-3 text-sm flex flex-col transition-colors ${uiHover}`}>
                  <span className={`font-semibold ${uiText}`}>Standalone Presentation (HTML)</span>
                  <span className={`text-[10px] ${uiTextMuted} mt-0.5`}>Export slides as a fully working HTML presentation you can host anywhere.</span>
                </button>
                <div className={`w-full h-px ${uiBorder}`}></div>
                <button onClick={() => { setShowExportMenu(false); exportSpeakerNotes(); }} className={`w-full text-left px-4 py-3 text-sm flex flex-col transition-colors ${uiHover}`}>
                  <span className={`font-semibold ${uiText}`}>Speaker Notes</span>
                  <span className={`text-[10px] ${uiTextMuted} mt-0.5`}>Download a markdown presenter-notes file.</span>
                </button>
                <div className={`w-full h-px ${uiBorder}`}></div>
                <button onClick={() => { setShowExportMenu(false); exportProjectFile(); }} className={`w-full text-left px-4 py-3 text-sm flex flex-col transition-colors ${uiHover}`}>
                  <span className={`font-semibold ${uiText}`}>Project JSON</span>
                  <span className={`text-[10px] ${uiTextMuted} mt-0.5`}>Save an editable project backup with themes, notes, and media.</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 mr-2 border-r border-gray-200 dark:border-gray-700 pr-2">
            <button onClick={undo} disabled={historyIndex <= 0} className={`p-1.5 rounded-md transition-colors ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : uiHover} ${uiText}`}>
              <Undo className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className={`p-1.5 rounded-md transition-colors ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : uiHover} ${uiText}`}>
              <Redo className="w-4 h-4" />
            </button>
          </div>

          <button onClick={() => { setPlaySlideIndex(activeSlideIndex); setIsPlaying(true); }} className="flex items-center gap-2 px-3 md:px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors shadow-sm">
            <Play className="w-4 h-4 fill-white" /> <span className="hidden md:inline">Present</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Mobile Overlay Scrim */}
        {(mobileLeftOpen || mobileRightOpen) && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 xl:hidden" 
            onClick={() => { setMobileLeftOpen(false); setMobileRightOpen(false); }}
          />
        )}

        {/* Left Sidebar - Cards & Themes */}
        <div className={`w-64 ${uiBgSecondary} border-r ${uiBorder} flex flex-col shrink-0 absolute xl:relative z-50 xl:z-10 h-full transition-transform duration-300 ${mobileLeftOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'}`}>
          <div className={`p-3 border-b ${uiBorder} flex justify-between items-center relative`}>
            <span className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Cards</span>
            <div className="flex items-center gap-1">
               <button onClick={addSlide} className={`p-1 rounded ${uiHover} ${uiTextMuted}`} title="Add Card"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {slides.map((slide, i) => {
              const isActive = slide.id === activeSlideId;
              const isDraggingThis = draggedSlideIndex === i;
              const isDragOverThis = dragOverSlideIndex === i;
              
              let dropIndicatorClass = '';
              if (isDragOverThis) {
                 dropIndicatorClass = draggedSlideIndex < i ? 'border-b-4 border-indigo-500 pb-1' : 'border-t-4 border-indigo-500 pt-1';
              }

              return (
                <div 
                  key={slide.id} 
                  draggable
                  onDragStart={(e) => handleSlideDragStart(e, i)}
                  onDragOver={(e) => handleSlideDragOver(e, i)}
                  onDragEnd={handleSlideDragEnd}
                  onDrop={(e) => handleSlideDrop(e, i)}
                  onClick={() => { setActiveSlideId(slide.id); setActiveElementId(null); if(window.innerWidth < 1024) setMobileLeftOpen(false); }} 
                  className={`group relative flex items-stretch gap-2 cursor-pointer transition-all ${isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100'} ${isDraggingThis ? 'opacity-40 scale-95' : ''} ${dropIndicatorClass}`}
                >
                  <div className={`w-1 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-transparent'}`} />
                  <div 
                    className={`flex-1 aspect-video rounded-lg shadow-sm border overflow-hidden relative transition-all ${isActive ? 'border-indigo-500 ring-2 ring-indigo-500/20' : uiBorder}`}
                    style={{ background: resolveSlideBackground(slide), containerType: 'inline-size' }}
                  >
                     {(slide.bgImage || globalBgImage) && (
                       <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${slide.bgImage || globalBgImage}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: slide.bgImage ? (slide.bgOpacity ?? 1) : globalBgOpacity, zIndex: 0 }} />
                     )}
                     {slide.elements.map(el => renderCanvasElement(el, 'thumbnail'))}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setSlides(slides.filter(s => s.id !== slide.id)); if(isActive && slides.length > 1) setActiveSlideId(slides[0].id); }} className={`absolute right-2 top-2 p-1.5 bg-red-500 text-white rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity ${slides.length === 1 ? 'hidden' : ''}`}><Trash2 className="w-3 h-3" /></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 md:p-8 relative" onPointerDown={() => { setActiveElementId(null); }}>
          <div 
            ref={canvasRef} 
            className="w-full max-w-5xl aspect-video shadow-[0_0_40px_rgba(0,0,0,0.1)] relative overflow-hidden rounded-xl ring-1 ring-gray-200/50 transition-all duration-300" 
            style={{ background: resolveSlideBackground(activeSlide), containerType: 'inline-size' }}
          >
            {(activeSlide?.bgImage || globalBgImage) && (
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${activeSlide?.bgImage || globalBgImage}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: activeSlide?.bgImage ? (activeSlide?.bgOpacity ?? 1) : globalBgOpacity, zIndex: 0 }} />
            )}
            {activeSlide?.elements.map(el => renderCanvasElement(el, 'canvas'))}
            
            {/* Snapping Guides */}
            {snapGuides.map((g, i) => (
               <div key={i} className="absolute bg-pink-500 z-50 pointer-events-none" style={{
                  ...(g.type === 'v' ? { left: `${g.pos}%`, top: 0, bottom: 0, width: '1px' } : { top: `${g.pos}%`, left: 0, right: 0, height: '1px' })
               }} />
            ))}
          </div>

          {/* Quick Add Menu */}
          <div className={`absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 ${isDarkMode ? 'bg-[#2a2a2a]/90 border-gray-700 text-gray-200' : 'bg-white/90 border-gray-200 text-gray-600'} backdrop-blur shadow-xl border rounded-full px-2 py-1.5 flex gap-1 z-20 w-max max-w-[90vw] overflow-x-auto`}>
             <button onClick={() => addElement('title')} className={`p-2 rounded-full flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium transition-colors shrink-0 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><Heading className="w-4 h-4" /> <span className="hidden sm:inline">Title</span></button>
             <div className={`w-px h-6 my-auto mx-1 shrink-0 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
             <button onClick={() => addElement('text')} className={`p-2 rounded-full flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium transition-colors shrink-0 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><Type className="w-4 h-4" /> <span className="hidden sm:inline">Text</span></button>
             <div className={`w-px h-6 my-auto mx-1 shrink-0 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
             <button onClick={() => addElement('imagePlaceholder')} className={`p-2 rounded-full flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium transition-colors shrink-0 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><ImageIcon className="w-4 h-4" /> <span className="hidden sm:inline">AI Image</span></button>
             <div className={`w-px h-6 my-auto mx-1 shrink-0 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
             <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLocalImageUpload} className="hidden" />
             <button onClick={() => addElement('upload')} className={`p-2 rounded-full flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium transition-colors shrink-0 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}><Upload className="w-4 h-4" /> <span className="hidden sm:inline">Upload</span></button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={`w-80 max-w-[85vw] ${uiBgPanel} border-l ${uiBorder} flex flex-col shrink-0 absolute right-0 xl:relative z-50 xl:z-10 h-full shadow-[-4px_0_24px_rgba(0,0,0,0.05)] transition-transform duration-300 ${mobileRightOpen ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'}`}>
          <div className={`grid grid-cols-3 border-b ${uiBorder} p-2 gap-1 ${uiBgSecondary} relative`}>
            <button onClick={() => setRightPanelTab('format')} className={`py-2 text-[11px] font-semibold rounded-md transition-colors flex items-center justify-center gap-1 ${rightPanelTab === 'format' ? (isDarkMode ? 'bg-[#3a3a3a] text-white shadow-sm' : 'bg-white shadow-sm text-gray-800') : uiTextMuted}`}><Layout className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Format</span></button>
            <button onClick={() => setRightPanelTab('themes')} className={`py-2 text-[11px] font-semibold rounded-md transition-colors flex items-center justify-center gap-1 ${rightPanelTab === 'themes' ? (isDarkMode ? 'bg-[#3a3a3a] text-white shadow-sm' : 'bg-white shadow-sm text-gray-800') : uiTextMuted}`}><Palette className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Themes</span></button>
            <button onClick={() => setRightPanelTab('chat')} className={`py-2 text-[11px] font-semibold rounded-md transition-colors flex items-center justify-center gap-1 ${rightPanelTab === 'chat' ? (isDarkMode ? 'bg-[#3a3a3a] text-white shadow-sm' : 'bg-[#1a1a1a] text-gray-300') : uiTextMuted}`}><MessageSquare className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Chat</span></button>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col">
            
            {/* FORMAT TAB */}
            {rightPanelTab === 'format' && activeElement && (
              <div className="p-5 space-y-6 animate-in slide-in-from-right-2 duration-200">
                {activeElement.type === 'text' && (
                  <>
                    <div className="space-y-2">
                      <label className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Content</label>
                      <textarea value={activeElement.text} onChange={(e) => updateElement(activeElement.id, { text: e.target.value })} className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[100px] resize-y ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`} />
                    </div>

                    <div className={`p-3 rounded-lg border ${isDarkMode ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50/50 border-indigo-100'}`}>
                       <label className={`text-xs font-semibold flex items-center gap-1.5 mb-2 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}`}><Wand2 className="w-3.5 h-3.5" /> AI Writer</label>
                       <div className="flex gap-2 mb-2">
                         <button onClick={() => handleAITextRewrite('Rewrite this to sound more professional.')} className={`text-[10px] px-2 py-1 rounded-full border ${isDarkMode ? 'border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300' : 'border-indigo-200 hover:bg-indigo-100 text-indigo-700'}`}>Rewrite</button>
                         <button onClick={() => handleAITextRewrite('Make this text shorter and punchier.')} className={`text-[10px] px-2 py-1 rounded-full border ${isDarkMode ? 'border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300' : 'border-indigo-200 hover:bg-indigo-100 text-indigo-700'}`}>Shorten</button>
                         <button onClick={() => handleAITextRewrite('Expand this text with more detail.')} className={`text-[10px] px-2 py-1 rounded-full border ${isDarkMode ? 'border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300' : 'border-indigo-200 hover:bg-indigo-100 text-indigo-700'}`}>Expand</button>
                       </div>
                       <div className="flex gap-2">
                         <input value={aiTextInstruction} onChange={(e)=>setAiTextInstruction(e.target.value)} placeholder="Or type instruction..." className={`flex-1 text-xs p-1.5 rounded border ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                         <button onClick={() => handleAITextRewrite(aiTextInstruction)} disabled={isGeneratingText || !aiTextInstruction.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-2 rounded flex items-center justify-center">
                           {isGeneratingText ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                         </button>
                       </div>
                    </div>

                    <div className={`space-y-4 pt-4 border-t ${uiBorder}`}>
                      <div className="flex justify-between items-center mb-1.5">
                         <label className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Typography</label>
                         {(activeElement.fontFamily || activeElement.fontSize || activeElement.fontWeight || !activeElement.useThemeColor) && (
                            <button onClick={() => updateElement(activeElement.id, { fontFamily: null, fontSize: null, fontWeight: null, useThemeColor: true, color: null })} className="text-[10px] text-indigo-500 hover:text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded">Reset Style</button>
                         )}
                      </div>
                      <div>
                        <span className={`text-xs mb-1.5 block flex items-center justify-between ${uiTextMuted}`}>
                           <span className="flex items-center gap-1"><FontIcon className="w-3 h-3" /> Font Family</span>
                           {('queryLocalFonts' in window) && (
                              <button onClick={loadLocalFonts} className="text-[10px] text-indigo-500 hover:text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">Load PC Fonts</button>
                           )}
                        </span>
                        <select value={[...FONTS, ...localFonts].some(f => f.family === activeElement.fontFamily) || !activeElement.fontFamily ? (activeElement.fontFamily || '') : 'custom'} onChange={(e) => {
                          if (e.target.value !== 'custom') {
                            updateElement(activeElement.id, { fontFamily: e.target.value || null });
                          }
                        }} className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 mb-2 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                          <option value="">Default (Theme)</option>
                          {[...FONTS, ...localFonts].map(f => <option key={f.name} value={f.family}>{f.name}</option>)}
                          <option value="custom">Custom System Font...</option>
                        </select>
                        {(![...FONTS, ...localFonts].some(f => f.family === activeElement.fontFamily) && activeElement.fontFamily) && (
                           <input type="text" placeholder="e.g. Arial, Times New Roman" value={activeElement.fontFamily.replace(/['"]/g, '')} onChange={(e) => updateElement(activeElement.id, { fontFamily: e.target.value ? `"${e.target.value}", sans-serif` : null })} className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`} />
                        )}
                        {(!activeElement.fontFamily) && (
                           <input type="text" placeholder="Or type System Font Name..." onChange={(e) => { if(e.target.value) updateElement(activeElement.id, { fontFamily: `"${e.target.value}", sans-serif` }) }} className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`} />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className={`text-xs mb-1.5 block ${uiTextMuted}`}>Size (px)</span>
                          <input type="number" value={activeElement.fontSize || (activeTheme.sizes ? activeTheme.sizes[activeElement.textRole || 'body'] : 24)} onChange={(e) => updateElement(activeElement.id, { fontSize: parseInt(e.target.value) || 12 })} className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`} />
                        </div>
                        <div>
                          <span className={`text-xs mb-1.5 block ${uiTextMuted}`}>Weight</span>
                          <select value={activeElement.fontWeight || (activeElement.textRole === 'title' || activeElement.textRole === 'contentTitle' ? 'bold' : 'normal')} onChange={(e) => updateElement(activeElement.id, { fontWeight: e.target.value })} className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                           <label className="flex items-center gap-2 cursor-pointer mt-2">
                             <input type="checkbox" checked={activeElement.useThemeColor} onChange={(e) => updateElement(activeElement.id, { useThemeColor: e.target.checked })} className="rounded text-indigo-600 focus:ring-indigo-500" />
                             <span className={`text-xs ${uiText}`}>Theme Color</span>
                           </label>
                        </div>
                        {!activeElement.useThemeColor && (
                          <div className="flex items-center gap-2">
                            <input type="color" value={activeElement.color || '#000000'} onChange={(e) => updateElement(activeElement.id, { color: e.target.value, useThemeColor: false })} className="w-8 h-8 p-0 border-0 rounded cursor-pointer" />
                            <span className={`text-xs uppercase font-mono ${uiText}`}>{activeElement.color || '#000000'}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <span className={`text-xs mb-1.5 block ${uiTextMuted}`}>Alignment</span>
                        <div className={`flex rounded-lg border p-1 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700' : 'bg-gray-100/50 border-gray-200'}`}>
                          <button onClick={() => updateElement(activeElement.id, { align: 'left' })} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${activeElement.align === 'left' ? (isDarkMode ? 'bg-[#444] shadow text-indigo-400' : 'bg-white shadow text-indigo-600') : uiTextMuted}`}><AlignLeft className="w-4 h-4" /></button>
                          <button onClick={() => updateElement(activeElement.id, { align: 'center' })} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${activeElement.align === 'center' ? (isDarkMode ? 'bg-[#444] shadow text-indigo-400' : 'bg-white shadow text-indigo-600') : uiTextMuted}`}><AlignCenter className="w-4 h-4" /></button>
                          <button onClick={() => updateElement(activeElement.id, { align: 'right' })} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${activeElement.align === 'right' ? (isDarkMode ? 'bg-[#444] shadow text-indigo-400' : 'bg-white shadow text-indigo-600') : uiTextMuted}`}><AlignRight className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeElement.type === 'imagePlaceholder' && (
                  <div className="space-y-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Image Prompt</label>
                    <textarea value={activeElement.prompt} onChange={(e) => updateElement(activeElement.id, { prompt: e.target.value })} className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[100px] ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200'}`} />
                    <button onClick={() => handleGenerateImageForPlaceholder(activeElement.id, activeElement.prompt)} disabled={activeElement.isLoading} className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-sm font-medium flex justify-center items-center gap-2">
                      {activeElement.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate Image
                    </button>
                    <button onClick={() => handleGenerateAsciiForPlaceholder(activeElement.id, activeElement.prompt)} disabled={activeElement.isLoading} className={`w-full py-2 rounded-lg text-sm font-medium flex justify-center items-center gap-2 border transition-colors ${isDarkMode ? 'bg-indigo-900/20 text-indigo-400 border-indigo-900/50 hover:bg-indigo-900/40' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'}`}>
                      {activeElement.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />} Generate ASCII Art
                    </button>
                  </div>
                )}

                <div className={`space-y-4 pt-4 border-t ${uiBorder}`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Layout Geometry</label>
                    {(activeElement.type === 'image' || activeElement.type === 'imagePlaceholder') && (
                      <button 
                        onClick={() => updateElement(activeElement.id, { lockAspectRatio: !activeElement.lockAspectRatio })}
                        className={`p-1.5 rounded-md transition-colors ${activeElement.lockAspectRatio ? (isDarkMode ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-100 text-indigo-600') : uiTextMuted} ${uiHover}`}
                        title={activeElement.lockAspectRatio ? "Unlock Aspect Ratio" : "Lock Aspect Ratio (Uniform Scaling)"}
                      >
                        {activeElement.lockAspectRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Width ({Math.round(activeElement.w)}%)</span>
                      <input type="range" min="5" max="100" value={activeElement.w} onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (activeElement.lockAspectRatio && activeElement.w > 0) {
                          updateElement(activeElement.id, { w: val, h: activeElement.h * (val / activeElement.w) });
                        } else {
                          updateElement(activeElement.id, { w: val });
                        }
                      }} className="w-full accent-indigo-600" />
                    </div>
                    <div>
                      <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Height ({Math.round(activeElement.h)}%)</span>
                      <input type="range" min="5" max="100" value={activeElement.h} onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (activeElement.lockAspectRatio && activeElement.h > 0) {
                          updateElement(activeElement.id, { h: val, w: activeElement.w * (val / activeElement.h) });
                        } else {
                          updateElement(activeElement.id, { h: val });
                        }
                      }} className="w-full accent-indigo-600" />
                    </div>
                  </div>
                </div>

                <div className={`space-y-4 pt-4 border-t ${uiBorder}`}>
                  <label className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${uiTextMuted}`}>
                    <Layers className="w-3.5 h-3.5" /> Layering & Opacity
                  </label>
                  
                  <div>
                    <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Opacity ({Math.round((activeElement.opacity ?? 1) * 100)}%)</span>
                    <input 
                      type="range" min="0" max="100" 
                      value={(activeElement.opacity ?? 1) * 100} 
                      onChange={(e) => updateElement(activeElement.id, { opacity: parseFloat(e.target.value) / 100 })} 
                      className="w-full accent-indigo-600" 
                    />
                  </div>

                  <div>
                    <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Layer Order</span>
                    <div className={`flex rounded-lg border p-1 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700' : 'bg-gray-100/50 border-gray-200'}`}>
                      <button onClick={() => reorderElement(activeElement.id, 'back')} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${uiHover} ${uiTextMuted}`} title="Send to Back"><ArrowDownToLine className="w-4 h-4" /></button>
                      <button onClick={() => reorderElement(activeElement.id, 'backward')} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${uiHover} ${uiTextMuted}`} title="Send Backward"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => reorderElement(activeElement.id, 'forward')} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${uiHover} ${uiTextMuted}`} title="Bring Forward"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => reorderElement(activeElement.id, 'front')} className={`flex-1 py-1.5 flex justify-center rounded-md transition-colors ${uiHover} ${uiTextMuted}`} title="Bring to Front"><ArrowUpToLine className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>

                {activeElement.type === 'image' && (
                  <div className={`space-y-4 pt-4 border-t ${uiBorder}`}>
                    <label className={`text-xs font-semibold uppercase tracking-wider ${uiTextMuted}`}>Image Settings</label>
                    
                    <div>
                      <span className={`text-xs mb-1.5 block ${uiTextMuted}`}>Image Fit</span>
                      <select 
                        value={activeElement.objectFit || 'cover'} 
                        onChange={(e) => updateElement(activeElement.id, { objectFit: e.target.value })} 
                        className={`w-full text-sm p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}
                      >
                        <option value="cover">Fill (Cover)</option>
                        <option value="contain">Fit (Contain)</option>
                        <option value="100% 100%">Stretch</option>
                      </select>
                    </div>
                    
                    <div>
                      <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Corner Radius ({activeElement.borderRadius || 0}px)</span>
                      <input 
                        type="range" min="0" max="100" 
                        value={activeElement.borderRadius || 0} 
                        onChange={(e) => updateElement(activeElement.id, { borderRadius: parseInt(e.target.value) })} 
                        className="w-full accent-indigo-600" 
                      />
                    </div>
                    
                    <div>
                      <button 
                        onClick={() => convertImageToAscii(activeElement.src, activeElement.id)} 
                        disabled={isConvertingAscii === activeElement.id}
                        className={`w-full py-2.5 rounded-lg text-sm font-medium flex justify-center items-center gap-2 border transition-colors ${isDarkMode ? 'bg-indigo-900/20 text-indigo-400 border-indigo-900/50 hover:bg-indigo-900/40' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'}`}
                      >
                        {isConvertingAscii === activeElement.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                        {isConvertingAscii === activeElement.id ? 'Converting...' : 'Make ASCII Art'}
                      </button>
                      {activeElement.asciiText && (
                        <div className="flex gap-2 w-full mt-2">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(activeElement.asciiText);
                            }} 
                            className={`flex-1 py-2.5 rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border transition-colors ${isDarkMode ? 'bg-[#333] border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`}
                          >
                            <Copy className="w-4 h-4" /> Copy Text
                          </button>
                          <button 
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = activeElement.src;
                              a.download = `ascii-art-${activeElement.id}.png`;
                              a.click();
                            }} 
                            className={`flex-1 py-2.5 rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 border transition-colors ${isDarkMode ? 'bg-[#333] border-gray-600 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`}
                          >
                            <Download className="w-4 h-4" /> Save Image
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-6">
                   <button onClick={() => deleteElement(activeElement.id)} className={`w-full py-2.5 rounded-lg text-sm font-medium flex justify-center items-center gap-2 border transition-colors ${isDarkMode ? 'bg-red-900/20 text-red-400 border-red-900/50 hover:bg-red-900/40' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}>
                     <Trash2 className="w-4 h-4" /> Remove Element
                   </button>
                </div>
              </div>
            )}

            {rightPanelTab === 'format' && !activeElement && (
              <div className="p-5 space-y-6 animate-in slide-in-from-right-2 duration-200">
                <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-[#252525] border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <h3 className={`text-sm font-semibold flex items-center gap-2 mb-3 ${uiText}`}>
                    <BarChart3 className="w-4 h-4 text-indigo-500"/> Deck Health
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className={uiTextMuted}>Slides</span>
                      <div className={`text-lg font-semibold ${uiText}`}>{slides.length}</div>
                    </div>
                    <div>
                      <span className={uiTextMuted}>Words</span>
                      <div className={`text-lg font-semibold ${uiText}`}>{deckStats.words}</div>
                    </div>
                    <div>
                      <span className={uiTextMuted}>Visuals</span>
                      <div className={`text-lg font-semibold ${uiText}`}>{deckStats.images}</div>
                    </div>
                    <div>
                      <span className={uiTextMuted}>Score</span>
                      <div className={`text-lg font-semibold ${deckStats.score >= 80 ? 'text-emerald-500' : deckStats.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{deckStats.score}</div>
                    </div>
                  </div>
                  <div className={`mt-3 flex items-start gap-2 text-[11px] ${uiTextMuted}`}>
                    <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0"/>
                    <span>{deckStats.overloadedSlides || deckStats.imagePlaceholders ? `${deckStats.overloadedSlides} dense slide(s), ${deckStats.imagePlaceholders} image prompt(s) pending.` : 'Slide density and image completion look ready.'}</span>
                  </div>
                </div>

                <div className="">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 mb-1 ${uiText}`}><StickyNote className="w-4 h-4 text-indigo-500"/> Speaker Notes</h3>
                  <p className={`text-xs mb-3 ${uiTextMuted}`}>Keep presenter talking points with the selected slide.</p>
                  <textarea
                    value={activeSlide?.notes || ''}
                    onChange={(e) => updateActiveSlide({ notes: e.target.value })}
                    placeholder="Add presenter notes for this slide..."
                    className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[100px] resize-y ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}
                  />
                  <button onClick={exportSpeakerNotes} className={`w-full mt-2 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${uiBorder} ${uiHover} ${uiText}`}>
                    <Download className="w-4 h-4"/> Export Notes
                  </button>
                </div>

                <div className="">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 mb-1 ${uiText}`}><ImageIcon className="w-4 h-4 text-indigo-500"/> Slide Background</h3>
                  <p className={`text-xs mb-4 ${uiTextMuted}`}>Customize the background for this specific slide, overriding the global theme.</p>
                  
                  <div className="space-y-4">
                    {/* Slide Solid Colors */}
                     <div>
                        <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-2 block`}>Solid Color</span>
                        <div className="flex flex-wrap gap-2">
                           {PRESET_COLORS.map(color => (
                             <button key={color} onClick={() => updateActiveSlide({ customBgColor: color, bgImage: null })} className={`w-6 h-6 rounded-md shadow-sm border ${uiBorder}`} style={{ backgroundColor: color }} />
                           ))}
                           <div className="relative">
                             <input type="color" value={activeSlide?.customBgColor || '#ffffff'} onChange={e => updateActiveSlide({ customBgColor: e.target.value, bgImage: null })} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                             <button className={`w-6 h-6 rounded-md shadow-sm border flex items-center justify-center ${uiBorder} ${uiBgSecondary} ${uiText}`}><Pipette className="w-3.5 h-3.5" /></button>
                           </div>
                        </div>
                     </div>

                    <div>
                      <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-2 block`}>AI Image</span>
                      <textarea 
                         value={slideBgPrompt} 
                         onChange={e => setSlideBgPrompt(e.target.value)}
                         placeholder="e.g. A serene mountain landscape at dawn..."
                         className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[60px] resize-none ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}
                       />
                      <button onClick={handleGenerateSlideBgImage} disabled={isGeneratingSlideBg || !slideBgPrompt.trim()} className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex justify-center items-center gap-2">
                         {isGeneratingSlideBg ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />} Generate for this Slide
                      </button>
                    </div>

                    <input type="file" accept="image/*" ref={slideBgFileInputRef} onChange={handleSlideBgUpload} className="hidden" />
                    <div className="flex gap-2">
                      <button onClick={() => slideBgFileInputRef.current?.click()} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${uiBorder} ${uiHover} ${uiText}`}>
                        <Upload className="w-4 h-4"/> Local Image
                      </button>
                      {(activeSlide?.bgImage || activeSlide?.customBgColor) && (
                        <button onClick={() => updateActiveSlide({ bgImage: null, customBgColor: null, bgOpacity: 1 })} className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${isDarkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-red-50 text-red-600 hover:bg-red-100'}`} title="Remove slide background">
                           <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {activeSlide?.bgImage && (
                      <div className="mt-2">
                        <span className={`text-[10px] mb-1 block ${uiTextMuted}`}>Image Opacity ({Math.round((activeSlide.bgOpacity ?? 1) * 100)}%)</span>
                        <input 
                          type="range" min="0" max="100" 
                          value={(activeSlide.bgOpacity ?? 1) * 100} 
                          onChange={(e) => updateActiveSlide({ bgOpacity: parseFloat(e.target.value) / 100 })} 
                          className="w-full accent-indigo-600" 
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Global Typography Setup */}
                <div className={`pt-6 border-t ${uiBorder}`}>
                   <h3 className={`text-sm font-semibold flex items-center gap-2 mb-1 ${uiText}`}><FontIcon className="w-4 h-4 text-indigo-500"/> Global Typography</h3>
                   <p className={`text-xs mb-3 ${uiTextMuted}`}>Adjust fonts and base sizes across all slides.</p>
                   
                   <button onClick={forceApplyGlobalTypography} className="w-full mb-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-indigo-100">
                     <RefreshCw className="w-3.5 h-3.5" /> {syncText}
                   </button>
                   <p className={`text-[10px] mb-3 ${uiTextMuted} text-center`}>This removes custom slide backgrounds and fonts, syncing all slides to the global theme.</p>

                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 flex items-center justify-between`}>
                           Title Font
                           {('queryLocalFonts' in window) && (
                              <button onClick={loadLocalFonts} title="Load system fonts from this PC" className="text-[10px] text-indigo-500 hover:text-indigo-600 normal-case bg-indigo-50 px-1 py-0.5 rounded">PC Fonts</button>
                           )}
                         </span>
                         <select value={globalTitleFont} onChange={(e) => setGlobalTitleFont(e.target.value)} className={`w-full text-[11px] p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                           <option value="">Default (Theme)</option>
                           {[...FONTS, ...localFonts].map(f => <option key={`title-${f.name}`} value={f.family}>{f.name}</option>)}
                         </select>
                       </div>
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Content Font</span>
                         <select value={globalBodyFont} onChange={(e) => setGlobalBodyFont(e.target.value)} className={`w-full text-[11px] p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                           <option value="">Default (Theme)</option>
                           {[...FONTS, ...localFonts].map(f => <option key={`body-${f.name}`} value={f.family}>{f.name}</option>)}
                         </select>
                       </div>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Title Weight</span>
                         <select value={globalTitleWeight} onChange={(e) => setGlobalTitleWeight(e.target.value)} className={`w-full text-[11px] p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                           <option value="">Default</option>
                           <option value="normal">Normal</option>
                           <option value="bold">Bold</option>
                         </select>
                       </div>
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Content Weight</span>
                         <select value={globalBodyWeight} onChange={(e) => setGlobalBodyWeight(e.target.value)} className={`w-full text-[11px] p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}>
                           <option value="">Default</option>
                           <option value="normal">Normal</option>
                           <option value="bold">Bold</option>
                         </select>
                       </div>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Title Color</span>
                         <div className="flex items-center gap-2">
                           <input type="color" value={globalTitleColor || activeTheme.text} onChange={e => setGlobalTitleColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer" />
                           <span className={`text-[10px] uppercase font-mono ${uiText}`}>{globalTitleColor ? 'Custom' : 'Theme'}</span>
                         </div>
                       </div>
                       <div>
                         <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Content Color</span>
                         <div className="flex items-center gap-2">
                           <input type="color" value={globalBodyColor || activeTheme.text} onChange={e => setGlobalBodyColor(e.target.value)} className="w-8 h-8 p-0 border-0 rounded cursor-pointer" />
                           <span className={`text-[10px] uppercase font-mono ${uiText}`}>{globalBodyColor ? 'Custom' : 'Theme'}</span>
                         </div>
                       </div>
                     </div>
                     <div>
                       <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Title Scale ({Math.round(globalTitleScale * 100)}%)</span>
                       <input type="range" min="0.5" max="2" step="0.05" value={globalTitleScale} onChange={(e) => setGlobalTitleScale(parseFloat(e.target.value))} className="w-full accent-indigo-600" />
                     </div>
                     <div>
                       <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Content Scale ({Math.round(globalBodyScale * 100)}%)</span>
                       <input type="range" min="0.5" max="2" step="0.05" value={globalBodyScale} onChange={(e) => setGlobalBodyScale(parseFloat(e.target.value))} className="w-full accent-indigo-600" />
                     </div>
                   </div>
                </div>

                {/* Background Setting Setup */}
                <div className={`pt-6 border-t ${uiBorder}`}>
                   <h3 className={`text-sm font-semibold flex items-center gap-2 mb-1 ${uiText}`}><ImageIcon className="w-4 h-4 text-indigo-500"/> Global Background</h3>
                   <p className={`text-xs mb-3 ${uiTextMuted}`}>Customize the background of all slides.</p>
                   
                   <div className="space-y-4">
                      {/* Clear All Backgrounds Button */}
                      <button onClick={clearAllSlideBackgrounds} className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors border ${isDarkMode ? 'bg-red-900/10 border-red-500/20 text-red-400 hover:bg-red-900/20' : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100'}`}>
                        <Trash2 className="w-3.5 h-3.5" /> {bgSyncText}
                      </button>
                      <p className={`text-[10px] mb-3 ${uiTextMuted} text-center`}>This removes custom images and colors from every slide so the global background can show through.</p>
                     {/* Solid Colors */}
                     <div>
                        <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-2 block`}>Solid Color</span>
                        <div className="flex flex-wrap gap-2">
                           {PRESET_COLORS.map(color => (
                             <button key={color} onClick={() => { setCustomGlobalBgColor(color); setGlobalBgImage(null); }} className={`w-6 h-6 rounded-md shadow-sm border ${uiBorder}`} style={{ backgroundColor: color }} />
                           ))}
                           <div className="relative">
                             <input type="color" value={customGlobalBgColor || '#ffffff'} onChange={e => { setCustomGlobalBgColor(e.target.value); setGlobalBgImage(null); }} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                             <button className={`w-6 h-6 rounded-md shadow-sm border flex items-center justify-center ${uiBorder} ${uiBgSecondary} ${uiText}`}><Pipette className="w-3.5 h-3.5" /></button>
                           </div>
                        </div>
                     </div>

                     {/* AI Image */}
                     <div>
                       <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-2 block`}>AI Image</span>
                       <textarea 
                         value={bgImagePrompt} 
                         onChange={e => setBgImagePrompt(e.target.value)}
                         placeholder="e.g. Abstract geometric pattern..."
                         className={`w-full text-sm p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[60px] resize-none ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'}`}
                       />
                       <button onClick={handleGenerateBgImage} disabled={isGeneratingBg || !bgImagePrompt.trim()} className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex justify-center items-center gap-2">
                          {isGeneratingBg ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />} Generate Background
                       </button>
                     </div>

                     <input type="file" accept="image/*" ref={bgFileInputRef} onChange={handleGlobalBgUpload} className="hidden" />
                     <div className="flex gap-2">
                       <button onClick={() => bgFileInputRef.current?.click()} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${uiBorder} ${uiHover} ${uiText}`}>
                         <Upload className="w-4 h-4"/> Local Image
                       </button>
                       {(globalBgImage || customGlobalBgColor) && (
                         <button onClick={() => { setGlobalBgImage(null); setCustomGlobalBgColor(''); }} className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${isDarkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-red-50 text-red-600 hover:bg-red-100'}`} title="Remove background">
                            <Trash2 className="w-4 h-4" />
                         </button>
                       )}
                     </div>

                     <div className="mt-4">
                       <span className={`text-[10px] uppercase font-semibold tracking-wider ${uiTextMuted} mb-1 block`}>Universal Background Opacity ({Math.round(globalBgOpacity * 100)}%)</span>
                       <p className={`text-[10px] mb-2 ${uiTextMuted}`}>Adjusts all slide backgrounds instantly.</p>
                       <input 
                         type="range" min="0" max="100" 
                         value={globalBgOpacity * 100} 
                         onChange={(e) => {
                           const val = parseFloat(e.target.value) / 100;
                           setGlobalBgOpacity(val);
                           setSlides(prev => prev.map(s => ({ ...s, bgOpacity: val })));
                         }} 
                         className="w-full accent-indigo-600" 
                       />
                     </div>
                   </div>
                </div>
              </div>
            )}

            {rightPanelTab === 'themes' && (
              <div className="p-5 space-y-6 animate-in slide-in-from-right-2 duration-200">
                {/* Global Themes Section */}
                <div>
                  <h3 className={`text-sm font-semibold mb-1 ${uiText}`}>Global Themes</h3>
                  <p className={`text-xs mb-4 ${uiTextMuted}`}>Change the look and feel instantly.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {THEMES.map(theme => (
                      <div key={theme.id} onClick={() => { 
                          setCurrentThemeId(theme.id); 
                          setCustomGlobalBgColor(''); 
                          setGlobalBgImage(null); 
                          setGlobalTitleColor('');
                          setGlobalBodyColor('');
                          setGlobalTitleWeight('');
                          setGlobalBodyWeight('');
                          const updatedSlides = slides.map(s => ({
                              ...s,
                              elements: s.elements.map(e => ({
                                  ...e, fontFamily: null, fontSize: null, useThemeColor: true
                              }))
                          }));
                          setSlides(updatedSlides);
                        }} 
                        className={`cursor-pointer rounded-xl border-2 transition-all overflow-hidden flex flex-col ${currentThemeId === theme.id ? 'border-indigo-500 shadow-md scale-[1.02]' : `${uiBorder} hover:border-indigo-300`}`}
                      >
                        <div className="h-[84px] p-3 flex flex-col justify-center gap-1" style={{ background: theme.bg }}>
                           <span className="font-bold leading-none tracking-tight" style={{ color: theme.text, fontFamily: theme.titleFont, fontSize: `${theme.sizes.title / 2.8}px` }}>Title</span>
                           <span className="opacity-80" style={{ color: theme.text, fontFamily: theme.bodyFont, fontSize: `${theme.sizes.body / 2.5}px` }}>Body & <span style={{ color: theme.accent, textDecoration: 'underline' }}>link</span></span>
                        </div>
                        <div className={`p-1.5 text-[11px] font-semibold text-center border-t flex-1 flex items-center justify-center ${isDarkMode ? 'bg-[#2a2a2a] text-gray-300 border-gray-700' : 'bg-white text-gray-700 border-gray-100'}`}>
                           {theme.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CHAT TAB */}
            {rightPanelTab === 'chat' && (
              <div className="flex flex-col h-full animate-in slide-in-from-right-2 duration-200">
                 <div className={`p-3 border-b ${uiBorder} flex justify-between items-center shrink-0 ${uiBgSecondary}`}>
                   <span className={`text-[10px] font-semibold uppercase tracking-wider ${uiTextMuted}`}>AI Assistant</span>
                   <button 
                     onClick={() => setChatMessages([{ role: 'ai', text: "Hi! I'm your AI assistant. Need brainstorming ideas or specific content for your slides?" }])} 
                     className={`text-[10px] font-medium flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${isDarkMode ? 'hover:bg-red-500/10 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                   >
                     <Trash2 className="w-3 h-3" /> Clear Chat
                   </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-4">
                   {chatMessages.map((msg, idx) => (
                     <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                       <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed relative group ${
                         msg.role === 'user' 
                           ? 'bg-indigo-600 text-white rounded-tr-sm' 
                           : `${isDarkMode ? 'bg-[#2a2a2a] text-gray-200 border-gray-700' : 'bg-white text-gray-800 border-gray-200'} border rounded-tl-sm shadow-sm`
                       }`}>
                         {msg.role === 'ai' ? (
                           <div className="markdown-body">
                             <Markdown>{msg.text}</Markdown>
                           </div>
                         ) : (
                           <span className="whitespace-pre-wrap">{msg.text}</span>
                         )}
                         
                         {msg.role === 'ai' && (
                           <button 
                             onClick={() => copyToClipboard(msg.text, idx)}
                             className={`absolute top-2 right-2 p-1.5 rounded-md backdrop-blur shadow-sm opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'bg-[#333] hover:bg-[#444] text-gray-300' : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200'}`}
                             title="Copy text"
                           >
                             {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                           </button>
                         )}
                       </div>
                     </div>
                   ))}
                   {isChatLoading && (
                     <div className="flex items-start">
                       <div className={`p-3 rounded-2xl border rounded-tl-sm ${isDarkMode ? 'bg-[#2a2a2a] border-gray-700' : 'bg-white border-gray-200'}`}>
                         <Loader2 className={`w-4 h-4 animate-spin ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                       </div>
                     </div>
                   )}
                   <div ref={chatEndRef} />
                 </div>

                 <div className={`p-4 border-t ${uiBorder} ${uiBgSecondary}`}>
                   <div className="relative">
                     <textarea
                       value={chatInput}
                       onChange={e => setChatInput(e.target.value)}
                       onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
                       placeholder="Ask AI for ideas..."
                       className={`w-full text-sm pl-4 pr-12 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 resize-none h-[52px] ${isDarkMode ? 'bg-[#1e1e1e] border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                     />
                     <button 
                       onClick={handleChatSubmit}
                       disabled={!chatInput.trim() || isChatLoading}
                       className="absolute right-2 top-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                     >
                       <Wand2 className="w-4 h-4" />
                     </button>
                   </div>
                   <p className={`text-[10px] text-center mt-2 ${uiTextMuted}`}>Use the copy icon on AI replies to paste into slides.</p>
                 </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Mobile Bottom Nav */}
      <div className={`xl:hidden flex items-center justify-around p-3 border-t ${uiBorder} ${uiBgPanel} shrink-0 z-30`}>
         <button onClick={() => { setMobileLeftOpen(true); setMobileRightOpen(false); }} className={`flex flex-col items-center gap-1 ${mobileLeftOpen ? 'text-indigo-600' : uiTextMuted} hover:${uiText}`}>
            <LayoutTemplate className="w-5 h-5"/>
            <span className="text-[10px] font-medium">Slides</span>
         </button>
         <button onClick={() => { setMobileRightOpen(true); setRightPanelTab('format'); setMobileLeftOpen(false); }} className={`flex flex-col items-center gap-1 ${(mobileRightOpen && rightPanelTab === 'format') ? 'text-indigo-600' : uiTextMuted} hover:${uiText}`}>
            <Palette className="w-5 h-5"/>
            <span className="text-[10px] font-medium">Format</span>
         </button>
         <button onClick={() => { setMobileRightOpen(true); setRightPanelTab('chat'); setMobileLeftOpen(false); }} className={`flex flex-col items-center gap-1 ${(mobileRightOpen && rightPanelTab === 'chat') ? 'text-indigo-600' : uiTextMuted} hover:${uiText}`}>
            <MessageSquare className="w-5 h-5"/>
            <span className="text-[10px] font-medium">AI Chat</span>
         </button>
      </div>

    </div>
  );
}
