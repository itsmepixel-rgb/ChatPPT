import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "25mb" }));

  type Provider = "gemini" | "openai" | "claude" | "ollama";
  type AiSettings = {
    textProvider?: Provider;
    textModel?: string;
    imageProvider?: "gemini" | "openai";
    imageModel?: string;
    geminiApiKey?: string;
    openaiApiKey?: string;
    claudeApiKey?: string;
    ollamaOrigin?: string;
  };

  const defaultSettings: Required<Pick<AiSettings, "textProvider" | "textModel" | "imageProvider" | "imageModel" | "ollamaOrigin">> = {
    textProvider: "gemini",
    textModel: "gemini-3.1-pro-preview",
    imageProvider: "gemini",
    imageModel: "imagen-4.0-generate-001",
    ollamaOrigin: "http://localhost:11434"
  };

  const normalizeOrigin = (origin?: string) => {
    const value = (origin || process.env.OLLAMA_ORIGIN || defaultSettings.ollamaOrigin).trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(value)) throw new Error("Ollama origin must start with http:// or https://");
    return value;
  };

  const getGeminiAI = (settings?: AiSettings) => {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key is not configured");
    return new GoogleGenAI({ apiKey });
  };

  const extractOpenAIText = (data: any) => {
    if (typeof data.output_text === "string") return data.output_text;
    const text = data.output?.flatMap((item: any) => item.content || [])
      .map((content: any) => content.text || "")
      .join("");
    return text || data.choices?.[0]?.message?.content || "";
  };

  const generateText = async ({
    settings,
    systemInstruction,
    prompt,
    messages,
    jsonMode = false,
    fallbackModel
  }: {
    settings?: AiSettings;
    systemInstruction: string;
    prompt?: string;
    messages?: Array<{ role: "user" | "ai"; text: string }>;
    jsonMode?: boolean;
    fallbackModel: string;
  }) => {
    const provider = settings?.textProvider || defaultSettings.textProvider;
    const model = settings?.textModel || fallbackModel;

    if (provider === "gemini") {
      const ai = getGeminiAI(settings);
      const contents = messages?.length
        ? messages.map(m => ({ role: m.role === "ai" ? "model" : "user", parts: [{ text: m.text }] }))
        : prompt || "";
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          ...(jsonMode ? { responseMimeType: "application/json" } : {})
        }
      });
      return response.text || "";
    }

    if (provider === "openai") {
      const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API key is not configured");
      const input = messages?.length
        ? messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }))
        : [{ role: "user", content: prompt || "" }];
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          instructions: systemInstruction,
          input,
          ...(jsonMode ? { text: { format: { type: "json_object" } } } : {})
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed");
      return extractOpenAIText(data);
    }

    if (provider === "claude") {
      const apiKey = settings?.claudeApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Claude API key is not configured");
      const anthropicMessages = messages?.length
        ? messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }))
        : [{ role: "user", content: prompt || "" }];
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: jsonMode ? 4096 : 1536,
          system: systemInstruction + (jsonMode ? "\nReturn only valid JSON." : ""),
          messages: anthropicMessages
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Claude request failed");
      return data.content?.map((item: any) => item.text || "").join("") || "";
    }

    const origin = normalizeOrigin(settings?.ollamaOrigin);
    const ollamaMessages = [
      { role: "system", content: systemInstruction + (jsonMode ? "\nReturn only valid JSON." : "") },
      ...(messages?.length
        ? messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }))
        : [{ role: "user", content: prompt || "" }])
    ];
    const response = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: false, ...(jsonMode ? { format: "json" } : {}) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ollama request failed");
    return data.message?.content || "";
  };

  app.post("/api/ai/deck", async (req, res) => {
    try {
      const topic = String(req.body?.topic || "").trim();
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      if (!topic) return res.status(400).json({ error: "Topic is required" });

      const text = await generateText({
        settings: aiSettings,
        fallbackModel: aiSettings?.textModel || defaultSettings.textModel,
        prompt: `Create a professional presentation about: "${topic}". Create between 5 and 7 slides. The first slide must be a title slide. The remaining slides should cover key points logically.`,
        jsonMode: true,
        systemInstruction: `You are an expert presentation designer. Respond ONLY with valid JSON.
          Schema:
          {
            "title": "Main Presentation Title",
            "slides": [
              {
                "type": "title",
                "title": "Slide Title",
                "subtitle": "Slide Subtitle (only if type is title)",
                "content": "The main body text for content slides. Write 1-2 short paragraphs OR a mix of a paragraph and bullet points. Keep it highly concise so it fits perfectly on a slide without overflowing.",
                "speakerNotes": "Short presenter notes for this slide.",
                "requiresImage": boolean,
                "imagePrompt": "A highly detailed prompt for an AI image generator describing the visual. Keep under 50 words."
              }
            ]
          }`
      });

      if (!text) throw new Error("Invalid response from Gemini");
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Deck generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Deck generation failed" });
    }
  });

  app.post("/api/ai/rewrite", async (req, res) => {
    try {
      const currentText = String(req.body?.currentText || "");
      const instruction = String(req.body?.instruction || "").trim();
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      if (!instruction) return res.status(400).json({ error: "Instruction is required" });

      const text = await generateText({
        settings: aiSettings,
        fallbackModel: aiSettings?.textModel || "gemini-3-flash-preview",
        prompt: `Instruction: ${instruction}\n\nCurrent Text:\n${currentText || "(None)"}`,
        systemInstruction: "You are an AI writing assistant for presentation slides. Return ONLY the final generated text. Do not include quotes, markdown formatting, or conversational filler. Keep it concise and impactful."
      });
      res.json({ text: text.trim() || "" });
    } catch (error) {
      console.error("Rewrite error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Rewrite failed" });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      if (!messages.length) return res.status(400).json({ error: "Messages are required" });

      const text = await generateText({
        settings: aiSettings,
        fallbackModel: aiSettings?.textModel || "gemini-3-flash-preview",
        messages,
        systemInstruction: "You are a brainstorming assistant for presentations. Provide concise, clear text that can easily be copied directly into a presentation slide."
      });
      res.json({ text: text || "Sorry, I couldn't generate a response." });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Chat failed" });
    }
  });

  app.post("/api/ai/image", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const imageModel = aiSettings?.imageModel || defaultSettings.imageModel;

      if ((aiSettings?.imageProvider || defaultSettings.imageProvider) === "openai") {
        const apiKey = aiSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OpenAI API key is not configured");
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: imageModel || "gpt-image-1.5",
            prompt,
            size: "1024x1024",
            response_format: "b64_json"
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "OpenAI image request failed");
        const imageBytes = data.data?.[0]?.b64_json;
        if (!imageBytes) throw new Error("Failed to generate image");
        res.json({ imageUrl: `data:image/png;base64,${imageBytes}` });
        return;
      }

      const ai = getGeminiAI(aiSettings);
      if (imageModel.startsWith("gemini-")) {
        const response = await ai.models.generateContent({
          model: imageModel,
          contents: prompt
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((part: any) => part.inlineData?.data);
        const imageBytes = imagePart?.inlineData?.data;
        const mimeType = imagePart?.inlineData?.mimeType || "image/png";
        if (!imageBytes) throw new Error("Failed to generate image");
        res.json({ imageUrl: `data:${mimeType};base64,${imageBytes}` });
        return;
      }

      const response = await ai.models.generateImages({
        model: imageModel,
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "1:1",
        },
      });
      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes) throw new Error("Failed to generate image");
      res.json({ imageUrl: `data:image/jpeg;base64,${imageBytes}` });
    } catch (error) {
      console.error("Image generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Image generation failed" });
    }
  });

  app.post("/api/ai/ascii", async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const text = await generateText({
        settings: aiSettings,
        fallbackModel: aiSettings?.textModel || "gemini-3-flash-preview",
        prompt: `Generate an impressive, detailed ASCII art representing: ${prompt}.`,
        systemInstruction: "You are an expert ASCII artist. Return purely the ASCII art with no text descriptions, no markdown code blocks, no intro, no outro, just the exact monospace ASCII string itself. Do not use triple backticks anywhere."
      });
      // Try removing any lingering code block wrappers if they slipped through
      let cleanedText = text.trim();
      if (cleanedText.startsWith('```')) {
        const lines = cleanedText.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines.length && lines[lines.length - 1].startsWith('```')) lines.pop();
        cleanedText = lines.join('\n');
      }
      res.json({ ascii: cleanedText || "" });
    } catch (error) {
      console.error("ASCII generation error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "ASCII generation failed" });
    }
  });

  app.get("/api/ollama/models", async (req, res) => {
    try {
      const origin = normalizeOrigin(String(req.query.origin || ""));
      const response = await fetch(`${origin}/api/tags`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not scan Ollama models");
      res.json({ models: (data.models || []).map((model: any) => model.name || model.model).filter(Boolean) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Could not scan Ollama models" });
    }
  });

  app.post("/api/ollama/pull", async (req, res) => {
    try {
      const origin = normalizeOrigin(req.body?.origin);
      const model = String(req.body?.model || "").trim();
      if (!model) return res.status(400).json({ error: "Model name is required" });
      const response = await fetch(`${origin}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ollama pull failed");
      res.json({ ok: true, status: data.status || "pulled" });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Ollama pull failed" });
    }
  });

  app.post("/api/models/list", async (req, res) => {
    try {
      const settings = req.body?.aiSettings as AiSettings | undefined;
      const provider = (req.body?.provider || settings?.textProvider || "gemini") as Provider;

      if (provider === "openai") {
        const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OpenAI API key is not configured");
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "OpenAI model list failed");
        res.json({ models: (data.data || []).map((model: any) => model.id).filter(Boolean).sort() });
        return;
      }

      if (provider === "claude") {
        const apiKey = settings?.claudeApiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("Claude API key is not configured");
        const response = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Claude model list failed");
        res.json({ models: (data.data || []).map((model: any) => model.id).filter(Boolean).sort() });
        return;
      }

      if (provider === "gemini") {
        const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key is not configured");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Gemini model list failed");
        res.json({ models: (data.models || []).map((model: any) => String(model.name || "").replace(/^models\//, "")).filter(Boolean).sort() });
        return;
      }

      const origin = normalizeOrigin(settings?.ollamaOrigin);
      const response = await fetch(`${origin}/api/tags`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ollama model list failed");
      res.json({ models: (data.models || []).map((model: any) => model.name || model.model).filter(Boolean).sort() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Model list failed" });
    }
  });

  // API route to export the full application as a standalone HTML file
  app.get("/api/export-app", async (req, res) => {
    try {
      const distPath = path.join(process.cwd(), "dist");
      const indexPath = path.join(distPath, "index.html");
      const assetsPath = path.join(distPath, "assets");
      const exportType = req.query.type || 'base64';
      
      if (!fs.existsSync(indexPath) || process.env.NODE_ENV !== "production") {
        console.log("Building frontend for standalone export...");
        await new Promise<void>((resolve, reject) => {
          import("child_process").then(({ exec }) => {
            exec("npx vite build", (error, stdout, stderr) => {
              if (error) {
                console.error(`Build error: ${error}`);
                return reject(error);
              }
              resolve();
            });
          });
        });
      }

      if (!fs.existsSync(indexPath)) {
        return res.status(500).send("Build failed to generate index.html");
      }

      let html = fs.readFileSync(indexPath, "utf8");

      // Find JS and CSS files
      const files = fs.readdirSync(assetsPath);
      const jsFile = files.find(f => f.startsWith("index-") && f.endsWith(".js"));
      const cssFile = files.find(f => f.startsWith("index-") && f.endsWith(".css"));

      if (jsFile) {
        let jsContent = fs.readFileSync(path.join(assetsPath, jsFile), "utf8");
        // Safely escape any closing script tags inside the JS code so they don't terminate the HTML <script> block early
        jsContent = jsContent.split('</script>').join('<\\/script>');
        
        // Use a function to avoid String.prototype.replace interpreting '$' sequences in the minified JS (like $', $&, $1)
        const scriptRegex = new RegExp(`<script[^>]*src="/assets/${jsFile}"[^>]*></script>`, 'i');
        html = html.replace(scriptRegex, () => `<script type="module">\n${jsContent}\n</script>`);
      }

      if (cssFile) {
        const cssContent = fs.readFileSync(path.join(assetsPath, cssFile), "utf8");
        const linkRegex = new RegExp(`<link[^>]*href="/assets/${cssFile}"[^>]*>`, 'i');
        html = html.replace(linkRegex, () => `<style>\n${cssContent}\n</style>`);
      }

      // Remove the aistudio-iframe.js script tag
      html = html.replace(/<script src="\/_aistudio-iframe.js"><\/script>/, '');

      res.setHeader("Content-Type", "text/html");
      const filename = exportType === 'base64' ? "standalone-app-base64.html" : "standalone-app-editable.html";
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(html);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).send("Failed to export application");
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
