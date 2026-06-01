import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use((req, res, next) => {
  console.log("Vercel req details:", { url: req.url, originalUrl: req.originalUrl, path: req.path });
  next();
});
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

      const systemInstruction = `You are an expert presentation designer and assistant. The user can interact with you to brainstorm or to actively manipulate their slide deck. 
You MUST respond with a JSON object. 

JSON Schema:
{
  "reply": "A helpful, friendly conversational response answering the user's questions or explaining the action you are taking.",
  "command": null or {
    "action": "CREATE_DECK" | "ADD_SLIDE" | "ADD_ELEMENT" | "SET_THEME" | "UPDATE_ELEMENT" | "UPDATE_SLIDE" | "CLEAR_PROJECT" | "REMOVE_SLIDE",
    "payload": { ... }
  }
}

Command Specifications:
1. CREATE_DECK: If the user explicitly asks to generate/create/make a deck/presentation/PPT about a topic, set command to:
   {
     "action": "CREATE_DECK",
     "payload": {
       "title": "Presentation Title",
       "slides": [
         {
           "type": "title" | "content",
           "title": "Slide Title",
           "subtitle": "Subtitle (only for title slides)",
           "content": "The main text body. Use concise paragraphs or bullet points.",
           "speakerNotes": "Brief notes for presentation delivery.",
           "requiresImage": true or false,
           "imagePrompt": "Detailed prompt for an AI image generator describing the visual."
         }
       ]
     }
   }
   Create between 5 to 7 slides. The first slide MUST be 'title' type.

2. ADD_SLIDE: If the user asks to "add a slide about X" or "insert a slide on Y", set command to:
   {
     "action": "ADD_SLIDE",
     "payload": {
       "title": "Slide Title",
       "content": "Content formatted concisely as paragraphs or bullet points.",
       "speakerNotes": "Speaker delivering instruction.",
       "requiresImage": true or false,
       "imagePrompt": "Detailed visual description prompt."
     }
   }

3. ADD_ELEMENT: If the user asks to "add/insert a text/block/title/image with content X", set command to:
   {
     "action": "ADD_ELEMENT",
     "payload": {
       "type": "title" | "text" | "imagePlaceholder",
       "text": "Text content to add or the visual description for images."
     }
   }

4. SET_THEME: If the user asks to "change the design", "apply theme", "switch theme" or name a theme like "vortex" or "brutalism" or "dark theme", set command to:
   {
     "action": "SET_THEME",
     "payload": {
       "themeId": "pearl" | "vortex" | "corporate" | "elegance" | "brutal" | "aurora" | "neon-city" | "cyberpunk" | "monochrome" | "coral-glow"
     }
   }

5. UPDATE_ELEMENT: If the user asks to modify element properties, text styling, or colors (e.g. "make font color green", "change text font color to #22c55e", "make all titles green", "make slide 4's titles red", "make all slides text white", or "make active bold"), set command to:
   {
     "action": "UPDATE_ELEMENT",
     "payload": {
       "scope": "active" | "all_titles" | "all_body" | "all" | "slide_all" | "slide_titles" | "slide_body", // "active" (default), "all_titles", "all_body", "all", "slide_all" (all elements on chosen slide), "slide_titles" (titles on chosen slide), "slide_body" (body elements on chosen slide)
       "slideIndex": number or null, // 1-based slide index if targeting a specific slide, otherwise null
       "color": "A standard CSS hex color string (e.g. '#22c55e' for green, '#ef4444' for red, etc.)",
       "fontSize": number or null,
       "fontWeight": "bold" | "normal" | null,
       "align": "left" | "center" | "right" | null,
       "text": "Optional new text content if they want to change text content (only applicable for 'active' scope)."
     }
   }

6. UPDATE_SLIDE: If the user asks to change a slide background, solid background color, or add a color (e.g. "make slide background black", "change slide 2 background to blue", "change solid background color of slide 3 to lavender (#E6E6FA)"), set command to:
   {
     "action": "UPDATE_SLIDE",
     "payload": {
       "slideIndex": number or null, // 1-based slide index if targeting a specific slide, otherwise null for the active slide
       "customBgColor": "CSS hex color code starting with # (e.g. '#000000', '#e6e6fa')"
     }
   }

7. CLEAR_PROJECT: If the user asks to "clear the project", "clear slides", "delete all slides", "reset project", or "start a blank presentation", set command to:
   {
     "action": "CLEAR_PROJECT"
   }

8. REMOVE_SLIDE: If the user asks to delete/remove a slide (e.g. "delete this slide", "remove slide 3", "delete third slide"), set command to:
   {
     "action": "REMOVE_SLIDE",
     "payload": {
       "slideIndex": number or null // 1-based slide index like 3 for slide 3, or null if they mean the currently active slide.
     }
   }

If the user is just asking for ideas, suggestions, general questions, or chatting without asking to actively build or change slides, ALWAYS set "command" to null.
Ensure the JSON response is fully valid and conforms to the schema exactly.`;

      const responseText = await generateText({
        settings: aiSettings,
        fallbackModel: aiSettings?.textModel || "gemini-3-flash-preview",
        messages,
        jsonMode: true,
        systemInstruction
      });

      let parsed;
      try {
        parsed = JSON.parse(responseText.trim());
      } catch (e) {
        parsed = { reply: responseText, command: null };
      }

      res.json({
        text: parsed?.reply || responseText || "Sorry, I couldn't generate a response.",
        command: parsed?.command || null
      });
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

  app.get("/api/image-search", async (req, res) => {
    const curatedPool = [
      // Business / Corporate / Finance / Growth
      {
        id: "cb_1",
        keywords: "finance growth chart business analytics analysis presentation money coins graph progress",
        description: "Financial Growth Chart and Business Analytics Dashboard",
        urlId: "photo-1460925895917-afdab827c52f",
        photographer: "Carlos Muza"
      },
      {
        id: "cb_2",
        keywords: "corporate meeting conference presentation design workspace teamwork office laptop group discussion",
        description: "Modern Corporate Meeting and Team Presentation",
        urlId: "photo-1542744094-3a31f103e35f",
        photographer: "Campaign Creators"
      },
      {
        id: "cb_3",
        keywords: "creative whiteboard brainstorm design sticky notes idea strategy corporate team project",
        description: "Brainstorming and Strategy Planning Whiteboard Session",
        urlId: "photo-1551836022-d5d88e9218df",
        photographer: "Amy Hirschi"
      },
      {
        id: "cb_4",
        keywords: "office collaborative discussion project planning board teamwork success desk worker",
        description: "Collaborative Office Workspace Project Team",
        urlId: "photo-1508385082359-f38ae991e8f2",
        photographer: "Rawpixel"
      },
      {
        id: "cb_5",
        keywords: "classroom lecture students university learning education training study academy classroom group",
        description: "Interactive University Lecture and E-Learning Space",
        urlId: "photo-1517245386807-bb43f82c33c4",
        photographer: "Headway"
      },
      // Tech / Software / Cyber / Terminal
      {
        id: "ct_1",
        keywords: "tech cpu computer microchip processor board electronics matrix hardware semiconductor engineering logic dev development code coding program programming programming language",
        description: "High-Tech Computer Microchip and Silicon Processor",
        urlId: "photo-1518770660439-4636190af475",
        photographer: "Alexandre Debiève"
      },
      {
        id: "ct_2",
        keywords: "cyber security dynamic network data key lock padlock firewall technology shield digital space star hack server",
        description: "Advanced Cyber Security Digital Shield and Network",
        urlId: "photo-1550751827-4bd374c3f58b",
        photographer: "Dan Nelson"
      },
      {
        id: "ct_3",
        keywords: "matrix coding green software developer terminal server computing script screen software code html javascript database logic",
        description: "Developer Console Terminal with Neon Code Lines",
        urlId: "photo-1526374965328-7f61d4dc18c5",
        photographer: "Markus Spiske"
      },
      {
        id: "ct_4",
        keywords: "ui ux screen wireframe app design application digital mock mobile telephone phone graphic design website web design",
        description: "Mobile Application UI/UX Wireframe Sketches",
        urlId: "photo-1563986768609-322da13575f3",
        photographer: "Balázs Kétyi"
      },
      {
        id: "ct_5",
        keywords: "laptop coffee desk computer notebook keyboard workspace minimalist workplace work office table dog office pet desk dog pet workspace",
        description: "Minimalist Modern Tech Workspace Setup",
        urlId: "photo-1531297484001-80022131f5a1",
        photographer: "Carl Heyerdahl"
      },
      // Nature / Green / Ecology / Earth / Flower
      {
        id: "cn_1",
        keywords: "mountain landscape wild scenic horizon nature valley forest hills beautiful view fresh green peak sky",
        description: "Breath-taking Scenic Mountain Nature Horizon",
        urlId: "photo-1501854140801-50d01698950b",
        photographer: "Sven-Erik Arndt"
      },
      {
        id: "cn_2",
        keywords: "forest green trees path scenic woods trail eco nature conservation timber park grass woods foliage trail",
        description: "Lush Green Peaceful Forest Nature Trail",
        urlId: "photo-1447752875215-b2761acb3c5d",
        photographer: "Luke Stackpoole"
      },
      {
        id: "cn_3",
        keywords: "mist morning dawn foggy meadow spring sunrise grass background aesthetic fresh dew calm early nature",
        description: "Misty Meadow Spring Sunrise Background",
        urlId: "photo-1470071459604-3b5ec3a7fe05",
        photographer: "Evgeni Tcherkasski"
      },
      {
        id: "cn_4",
        keywords: "monstera leaf green foliage botanical simple minimal outline shadow plant background nature flower plant monstera plant leaf background minimal design",
        description: "Minimalist Green Monstera Leaf Presentation BG",
        urlId: "photo-1501004318641-b39e6451bec6",
        photographer: "Slate Botanical"
      },
      {
        id: "cn_5",
        keywords: "river creek fresh water rock stream cascade waterfall forest wilderness wild eco peace dynamic stream water",
        description: "Fresh Clean Cascade River in Wild Forest",
        urlId: "photo-1426604966848-d7adac402bff",
        photographer: "Kal Vis"
      },
      // Abstract / Backgrounds / Gradients / Colors
      {
        id: "ca_1",
        keywords: "ocean sand wave beach sea beach sun beach sunset cyber glowing neon summer yellow blue orange calm surf",
        description: "Golden Sunlit Ocean Wave Gradient Cyber Tone",
        urlId: "photo-1507525428034-b723cf961d3e",
        photographer: "Sean Oulashin"
      },
      {
        id: "ca_2",
        keywords: "pastel purple pink gradient vector abstract aesthetic background texture canvas slide bg smooth layout pattern elegant design colorful soft",
        description: "Aesthetic Smooth Purple Pink Gradient Background",
        urlId: "photo-1557683316-973673baf926",
        photographer: "Gradient Lab"
      },
      {
        id: "ca_3",
        keywords: "vibrant dynamic multi color fluid dynamic visual creative pattern splash paint energy graphic line shape vivid high contrast design",
        description: "Vibrant Dynamic Multicolor Tech Visual Pattern",
        urlId: "photo-1579546929518-9e396f3cc809",
        photographer: "Design Grid"
      },
      {
        id: "ca_4",
        keywords: "minimal geometric concrete block shadow light lines gray abstract structure slide grid modern art architecture line blocks pattern shadow",
        description: "Minimalist Concrete Block Geometric Light & Shadow",
        urlId: "photo-1533090161767-e6ffed986c88",
        photographer: "Concrete Canvas"
      },
      {
        id: "ca_5",
        keywords: "neon cyber lines futuristic laser light rays network grid technology abstract connections dark tech lines blue",
        description: "Modern Neon Cyber Light Rays Technology Network",
        urlId: "photo-1504384308090-c894fdcc538d",
        photographer: "Cyber Grid"
      },
      // Science / Medical / Healthcare / Laboratory
      {
        id: "cs_1",
        keywords: "science medical research lab laboratory analysis biotech testing test tube chemistry biology microscope vaccine pharmaceutical healthy virus checkup",
        description: "Scientific Biotech Research Laboratory Microscope",
        urlId: "photo-1532187863486-abf9d39d66e8",
        photographer: "Ousa Chea"
      },
      {
        id: "cs_2",
        keywords: "hospital clinic health healthcare medical doctor stethoscope clinical team medicine patient care wellness helper",
        description: "Stethoscope and Modern Healthcare Doctor Team",
        urlId: "photo-1505751172876-fa1923c5c528",
        photographer: "Online Marketing"
      },
      {
        id: "cs_3",
        keywords: "clinical testing diagnostics science medical discovery vaccine checkup health research laboratory safety bio test tube vial medicine healthcare",
        description: "Healthcare Clinical Testing and Vaccine Research",
        urlId: "photo-1576091160399-112ba8d25d1d",
        photographer: "National Cancer Institute"
      },
      {
        id: "cs_4",
        keywords: "outer space galaxy stars celestial cosmos nebula rocket science constellation gravity astrophotography earth universe space exploration deep space",
        description: "Starry Celestial Nebula Outer Space Cosmos",
        urlId: "photo-1451187580459-43490279c0fa",
        photographer: "NASA Space Explorers"
      },
      {
        id: "cs_5",
        keywords: "industrial engineer mechanic robot robotics arm automation lab automatic factory high tech physics tech automation mechanical robotic industry manufacturing machine",
        description: "Mechanical Automation Engineering Robotic Setup",
        urlId: "photo-1581091226825-a6a2a5aee158",
        photographer: "ThisIsEngineering"
      },
      // Education / Literature / Creative Writing
      {
        id: "ce_1",
        keywords: "book library education school student academic study learn reading stack shelf novel teaching research knowledge writing literature",
        description: "Stacked Vintage Library Books Academic Study",
        urlId: "photo-1497633762265-9d179a990aa6",
        photographer: "Kimberly Farmer"
      },
      {
        id: "ce_2",
        keywords: "desk study calendar pencil writing notes business desk computer cup coffee workspace key notebook planning organizer clock desk setup",
        description: "Quiet Study Desk Setup with Diary and Calendar",
        urlId: "photo-1456513080510-7bf3a84b82f8",
        photographer: "Yanko Peyankov"
      },
      {
        id: "ce_3",
        keywords: "organizer project calendar schedule agenda board whiteboard task goals checklist management strategy team work planner planning plan schedule board project control board blue blueprint",
        description: "Strategic Project Blueprint Whiteboard Goals",
        urlId: "photo-1506784983877-45594efa4cbe",
        photographer: "Rawpixel Workspace"
      },
      {
        id: "ce_4",
        keywords: "digital interactive school elearning online class screen tutor video course online teaching learning study computer team remote learning zoom video classroom web",
        description: "Interactive Online E-Learning Screen Zoom Class",
        urlId: "photo-1516321318423-f06f85e504b3",
        photographer: "E-Learn Hub"
      },
      {
        id: "ce_5",
        keywords: "literature story storytelling dream imagination clouds open book landscape design peak summit read fiction story book design mountain mountains landscape book",
        description: "Surreal Epic Literature Storytelling Concept Landscape",
        urlId: "photo-1495446815901-a7297e633e8d",
        photographer: "Clay Banks"
      },
      // Art / Architecture / Design / Shapes
      {
        id: "cr_1",
        keywords: "architecture building modern brutalist luxury sky skyscraper facade concrete lines minimalist design geometry urban structure shape shapes building design",
        description: "Brutalist Modern Minimalist Architectural Building",
        urlId: "photo-1600585154340-be6161a56a0c",
        photographer: "R-Architecture"
      },
      {
        id: "cr_2",
        keywords: "art watercolor paint splash brush canvas acrylic palette design creativity studio oil artistic watercolor splash canvas art board drawing design paints color colored colorful painting",
        description: "Creative Impressionist Abstract Watercolor Palette",
        urlId: "photo-1513364776144-60967b0f800f",
        photographer: "Alice Dietrich"
      },
      {
        id: "cr_3",
        keywords: "sketch outline drawing line ink modern face character shape silhouette wall design minimal creative black white contrast linear line sketch design portrait abstract art shapes layout",
        description: "Minimalist Ink Silhouette Line Sketch Graphic Art",
        urlId: "photo-1513542789411-b6a5d4f31634",
        photographer: "Minimal Lines"
      },
      {
        id: "cr_4",
        keywords: "city skyscrapers glass blue corporate high rise downtown tower reflection business luxury landmark tower office building landmark sky commercial high rise real estate modern architecture glass tower",
        description: "Blue Corporate Glass Building Downtown Skyscraper",
        urlId: "photo-1486406146926-c627a92ad1ab",
        photographer: "Sven Brandsma"
      },
      {
        id: "cr_5",
        keywords: "marble swirl paint abstract flowing colors pattern liquid background acrylic design flow luxury marble liquid paint abstract splash vector visual creative",
        description: "Liquid Marble Fluid Swirl Contemporary Paint Art",
        urlId: "photo-1541701494587-cb58502866ab",
        photographer: "Joel Filipe"
      },
      // Wellness / Health / Food
      {
        id: "cw_1",
        keywords: "food salad greens diet dynamic organic meal recipe vegetable plate visual appetizing healthy healthcare superfood fresh healthy organic lunch bowl gourmet tomato",
        description: "Vibrant Mediterranean Organic Fresh Salad Bowl",
        urlId: "photo-1540189549336-e6e99c3679fe",
        photographer: "Ella Olsson"
      },
      {
        id: "cw_2",
        keywords: "yoga meditation pilates physical recovery zen mind focus wellness healthy sunrise sun beach calmness yoga workout sports stretch sea beach water sunset dawn morning sun stretch",
        description: "Sea Sunrise Meditation and Yoga Fitness Wellness",
        urlId: "photo-1506126613408-eca07ce68773",
        photographer: "Jared Rice"
      },
      {
        id: "cw_3",
        keywords: "aromatherapy tea candles comfort retreat relax calm spa massage cozy herbal tea candles scent perfume mind therapy sensory organic",
        description: "Zen Aroma Retreat Cozy Herbal Tea Settings",
        urlId: "photo-1544367567-0f2fcb009e0b",
        photographer: "My Mind"
      },
      {
        id: "cw_4",
        keywords: "vegan superfood vegetable kitchen meal healthy clean eating diet colorful avocado broccoli balanced diet fresh diet meal plate cooking food salad green color fresh raw",
        description: "Balanced Healthy Superfood Vegan Nutritious Salad",
        urlId: "photo-1512621776951-a57141f2eefd",
        photographer: "Brooke Lark"
      },
      // Animals / Pets (Added specifically to match query 'dog', 'pet', etc.)
      {
        id: "ca_p1",
        keywords: "dog pet animal puppy golden retriever dogs canines active nature play playful friend animal companion",
        description: "Happy Golden Retriever Dog Playing in Green Grass",
        urlId: "photo-1543466835-00a7907e9de1",
        photographer: "Karsten Winegeart"
      },
      {
        id: "ca_p2",
        keywords: "dog cat pet puppy kitten fluffy animals animals pets desk pet cute friendship love animal",
        description: "Adorable Golden Puppy and Fluffy Kitten Friends",
        urlId: "photo-1514888286974-6c03e2ca1dba",
        photographer: "Paul Hanaoka"
      }
    ];

    try {
      const query = String(req.query.q || "").trim();
      if (!query) {
        return res.json({ results: [] });
      }

      // Try Wikimedia Commons API to get real, high-quality public domain images & illustrations
      try {
        const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800&format=json&origin=*`;
        const response = await fetch(searchUrl, {
          headers: {
            "User-Agent": "ChatPPTApp/1.0 (sauravgautam34@gmail.com) NodeFetch"
          },
          timeout: 5000
        } as any);

        if (response.ok) {
          const data = await response.json() as any;
          const pages = data?.query?.pages || {};
          const results = [];
          for (const key of Object.keys(pages)) {
            const page = pages[key];
            const imageinfo = page.imageinfo?.[0];
            if (imageinfo && imageinfo.url) {
              const originalUrl = imageinfo.url;
              const thumbUrl = imageinfo.thumburl || originalUrl;
              const title = page.title ? page.title.replace(/^File:/i, '').replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ') : "Wikimedia Image";
              const author = imageinfo.extmetadata?.Artist?.value 
                ? imageinfo.extmetadata.Artist.value.replace(/<\/?[^>]+(>|$)/g, "").trim()
                : "Wikimedia Commons Contributor";

              results.push({
                id: `wikimedia_${page.pageid || key}`,
                description: title,
                urls: {
                  regular: originalUrl,
                  small: thumbUrl,
                  thumb: thumbUrl
                },
                user: {
                  name: author || "Wikimedia Commons"
                }
              });
            }
          }
          if (results.length > 0) {
            return res.json({ results });
          }
        }
      } catch (liveErr) {
        console.warn("Live Wikimedia Commons API lookups failed/timed out, using offline fallbacks:", liveErr);
      }

      // Shuffler helper
      const shuffleArray = <T>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // Semantic local model matcher fallback
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      let matched = curatedPool.filter(item => {
        if (queryWords.length === 0) {
          return item.keywords.toLowerCase().includes(query.toLowerCase());
        }
        return queryWords.some(word => 
          item.keywords.toLowerCase().includes(word) || 
          item.description.toLowerCase().includes(word)
        );
      });
      
      // Expand matching with substring check of the full query
      if (matched.length === 0) {
        matched = curatedPool.filter(item => 
          item.keywords.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
        );
      }

      // Pad results randomly from our beautiful hand-curated pool (never matching identical indices)
      const shuffledCurated = shuffleArray(curatedPool);
      const addedIds = new Set(matched.map(item => item.id));
      for (const item of shuffledCurated) {
        if (matched.length >= 16) break;
        if (!addedIds.has(item.id)) {
          matched.push(item);
          addedIds.add(item.id);
        }
      }

      const results = matched.slice(0, 16).map(img => {
        const cleanUrlId = img.urlId.startsWith('photo-') ? img.urlId.substring(6) : img.urlId;
        return {
          id: img.id,
          description: img.description,
          urls: {
            regular: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=800&q=80`,
            small: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=400&q=80`,
            thumb: `https://images.unsplash.com/photo-${cleanUrlId}?auto=format&fit=crop&w=150&q=80`
          },
          user: {
            name: img.photographer
          }
        };
      });

      res.json({ results });
    } catch (err) {
      console.error("General search exception:", err);
      // Failover fallback array
      res.json({
        results: [
          {
            id: "fb_f1",
            description: "Modern Business Team Presentation",
            urls: {
              regular: "https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&w=800&q=80",
              small: "https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&w=400&q=80",
              thumb: "https://images.unsplash.com/photo-1542744094-3a31f103e35f?auto=format&fit=crop&w=150&q=80"
            },
            user: { name: "Campaign Creators" }
          },
          {
            id: "fb_f2",
            description: "Minimalist Pastel Green Monstera Leaf Background",
            urls: {
              regular: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80",
              small: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=400&q=80",
              thumb: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=150&q=80"
            },
            user: { name: "Slate Botanical" }
          },
          {
            id: "fb_f3",
            description: "Cosmic Celestial Starry Galaxy",
            urls: {
              regular: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
              small: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=400&q=80",
              thumb: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=150&q=80"
            },
            user: { name: "NASA" }
          }
        ]
      });
    }
  });

  app.all("/api/web-search", async (req, res) => {
    try {
      const type = String(req.query.type || req.body?.type || 'google').toLowerCase();
      const query = String(req.query.q || req.body?.q || '').trim();
      const aiSettings = req.body?.aiSettings as AiSettings | undefined;
      
      if (!query) {
        return res.json({ results: [] });
      }

      if (type === 'wikipedia') {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const response = await fetch(searchUrl);
        if (!response.ok) {
          throw new Error("Wikipedia search query failed");
        }
        const data = await response.json() as any;
        const searchList = data?.query?.search || [];
        
        const results = [];
        for (const item of searchList.slice(0, 5)) {
          const pageTitle = item.title;
          const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&titles=${encodeURIComponent(pageTitle)}&piprop=original&format=json&origin=*`;
          try {
            const detailRes = await fetch(detailUrl);
            if (detailRes.ok) {
              const detailData = await detailRes.json() as any;
              const pages = detailData?.query?.pages || {};
              const pageId = Object.keys(pages)[0];
              if (pageId && pageId !== '-1') {
                const page = pages[pageId];
                results.push({
                  title: page.title,
                  snippet: page.extract || item.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
                  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
                  image: page.original?.source || null
                });
              } else {
                results.push({
                  title: item.title,
                  snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
                  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                  image: null
                });
              }
            } else {
              results.push({
                title: item.title,
                snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
                image: null
              });
            }
          } catch(e) {
            results.push({
              title: item.title,
              snippet: item.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
              image: null
            });
          }
        }
        return res.json({ type: 'wikipedia', results });
      } else {
        const ai = getGeminiAI(aiSettings);
        const systemPrompt = `You are a Live Web Search engine assistant simulating real-time Google Search results for the query: "${query}".
Search for factual information, current trends, and presentation outline summaries for this query.
Return your output STRICTLY as a JSON array of 4 real search result objects. Do not write markdown annotations other than JSON.
The JSON format must be EXACTLY: [
  {
    "title": "Page Title",
    "snippet": "Short descriptive snippet of the search page",
    "url": "https://example.com/some-page",
    "facts": [
      "Factual slide-ready point 1",
      "Factual slide-ready point 2",
      "Factual slide-ready point 3"
    ]
  }
]`;
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Search web information simulation for: "${query}"`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json"
          }
        });
        const text = response.text || "[]";
        try {
          const results = JSON.parse(text);
          return res.json({ type: 'google', results });
        } catch(jsonErr) {
          return res.json({
            type: 'google',
            results: [
              {
                title: `${query.charAt(0).toUpperCase() + query.slice(1)} Overview`,
                snippet: `Factual web summaries about ${query} for slides and presentations context.`,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
                facts: [
                  `Key introduction to ${query}`,
                  "Main components and relevant structures",
                  "Industry outlook and research values"
                ]
              }
            ]
          });
        }
      }
    } catch (error: any) {
      console.error("Web Search error:", error);
      res.status(500).json({ error: error.message || "Failed to search web content" });
    }
  });

  app.get("/api/proxy-site", async (req, res) => {
    try {
      let targetUrl = String(req.query.url || "").trim();
      if (!targetUrl) {
        res.setHeader("Content-Type", "text/html");
        return res.send(`
          <div style="font-family:system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background-color:#111827; color:#F3F4F6; margin:0; padding:16px; text-align:center;">
            <h3 style="color:#6366F1; margin-bottom:8px;">🌐 Web Proxy Sandbox</h3>
            <p style="color:#9CA3AF; font-size:13px; max-w:300px; margin-bottom:16px;">Type any URL or Google search in the address bar above to safely browse and click images to append directly!</p>
          </div>
        `);
      }

      // If the target is not a URL but a query, search on DuckDuckGo HTML version or similar
      if (!/^https?:\/\//i.test(targetUrl)) {
        if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
          targetUrl = 'https://' + targetUrl;
        } else {
          // Default to searching images on DuckDuckGo images scraper (HTML edition)
          targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}+images`;
        }
      }

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch page: http status ${response.status}`);
      }

      let bodyText = await response.text();

      // Parse host & path to perform absolute path rewrites
      const parsedUrl = new URL(targetUrl);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      // Inject base tag so all relative URLs, assets, media, styles and scripts automatically resolve to target host
      const baseTag = `<base href="${targetUrl}">`;
      if (bodyText.includes('<head>')) {
        bodyText = bodyText.replace('<head>', `<head>${baseTag}`);
      } else if (bodyText.includes('<HEAD>')) {
        bodyText = bodyText.replace('<HEAD>', `<HEAD>${baseTag}`);
      } else {
        bodyText = baseTag + bodyText;
      }

      // Script injection to lock interface clicks, proxy anchor navigates, show toolbar popup over hovered images
      const injectString = `
        <style id="ppt-overlay-styles">
          /* Custom Premium Overlay Toolbar */
          #ppt-proxy-overlay {
            position: fixed !important;
            display: none;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 10px !important;
            z-index: 2147483647 !important;
            background: #111827 !important;
            border: 2px solid #6366f1 !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
            border-radius: 12px !important;
            padding: 8px 14px !important;
            color: #f3f4f6 !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 11px !important;
            user-select: none !important;
            width: 290px !important;
            box-sizing: border-box !important;
            pointer-events: auto !important;
            /* Positioned dynamically next to hovered image */
          }
          .ppt-proxy-title {
            font-weight: 700 !important;
            font-size: 10px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            color: #a1a1aa !important;
            margin: 0 !important;
            padding: 0 !important;
            text-overflow: ellipsis !important;
            overflow: hidden !important;
            white-space: nowrap !important;
          }
          .ppt-proxy-btn {
            background: #4f46e5 !important;
            color: white !important;
            border: none !important;
            padding: 5px 12px !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            font-weight: 600 !important;
            display: inline-block !important;
            font-size: 11px !important;
            outline: none !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
            transition: background 0.15s ease-in-out !important;
          }
          .ppt-proxy-btn:hover {
            background: #4338ca !important;
          }
          .ppt-proxy-btn-bg {
            background: #10b981 !important;
          }
          .ppt-proxy-btn-bg:hover {
            background: #059669 !important;
          }
          /* Custom highlight on elements */
          .ppt-proxy-highlight {
            outline: 3px solid #6366f1 !important;
            outline-offset: -3px !important;
            cursor: copy !important;
          }
        </style>
        
        <div id="ppt-proxy-overlay">
          <div style="flex: 1; min-width: 0;">
            <div class="ppt-proxy-title">📸 Image Selected</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
            <button id="ppt-btn-insert" class="ppt-proxy-btn">➕ Insert</button>
            <button id="ppt-btn-bg" class="ppt-proxy-btn ppt-proxy-btn-bg">🎨 BG</button>
          </div>
        </div>

        <script>
          (function() {
            // Dynamic URL rewrites inside the frame so that pages keep behaving as a proxy
            function rewriteAllUrls() {
              const proxyBase = window.location.protocol + '//' + window.location.host + '/api/proxy-site?url=';
              document.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (href && !href.startsWith(proxyBase) && !href.startsWith('/api/proxy-site') && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  try {
                    const resolved = new URL(href, "${targetUrl}").href;
                    a.setAttribute('href', proxyBase + encodeURIComponent(resolved));
                  } catch(e) {}
                }
              });
              document.querySelectorAll('form').forEach(f => {
                const action = f.getAttribute('action');
                if (action && !action.startsWith(proxyBase) && !action.startsWith('/api/proxy-site')) {
                  try {
                    const resolved = new URL(action, "${targetUrl}").href;
                    f.setAttribute('action', proxyBase + encodeURIComponent(resolved));
                  } catch(e) {}
                }
              });
            }
            
            rewriteAllUrls();
            const observer = new MutationObserver(rewriteAllUrls);
            observer.observe(document.body, { childList: true, subtree: true });

            // Keep links inside the proxy browser
            document.addEventListener('click', function(e) {
              const anchor = e.target.closest('a');
              if (anchor) {
                const targetHref = anchor.getAttribute('href');
                if (targetHref && !targetHref.startsWith('#') && !targetHref.startsWith('javascript:')) {
                  e.preventDefault();
                  let resolvedUrl = targetHref;
                  
                  // Extract raw URL if already proxied under our or relative path
                  if (targetHref.includes('/api/proxy-site')) {
                    try {
                      const urlObj = new URL(targetHref, window.location.origin);
                      const paramUrl = urlObj.searchParams.get('url');
                      if (paramUrl) {
                        resolvedUrl = paramUrl;
                      }
                    } catch(err) {
                      const match = targetHref.match(/[?&]url=([^&]+)/);
                      if (match) {
                        resolvedUrl = decodeURIComponent(match[1]);
                      }
                    }
                  } else {
                    try {
                      resolvedUrl = new URL(targetHref, "${targetUrl}").href;
                    } catch(err) {}
                  }
                  
                  // Notify parent window to update the URL bar and navigate
                  window.parent.postMessage({
                    type: 'PROXY_NAVIGATE',
                    url: resolvedUrl
                  }, '*');
                }
              }
            }, true);

            // Forward form actions inside the proxy
            document.addEventListener('submit', function(e) {
              const form = e.target;
              let action = form.getAttribute('action') || '';
              const method = (form.getAttribute('method') || 'GET').toUpperCase();
              
              if (method === 'GET') {
                e.preventDefault();
                
                // Extract original target if already modified
                if (action.includes('/api/proxy-site')) {
                  try {
                    const urlObj = new URL(action, window.location.origin);
                    const paramUrl = urlObj.searchParams.get('url');
                    if (paramUrl) {
                      action = paramUrl;
                    }
                  } catch(err) {
                    const match = action.match(/[?&]url=([^&]+)/);
                    if (match) {
                      action = decodeURIComponent(match[1]);
                    }
                  }
                }
                
                let resolvedUrl = action;
                try {
                  resolvedUrl = new URL(action, "${targetUrl}").href;
                } catch(err) {}
                
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const [key, val] of formData.entries()) {
                  if (typeof val === 'string') params.append(key, val);
                }
                const separator = resolvedUrl.includes('?') ? '&' : '?';
                const finalUrl = resolvedUrl + separator + params.toString();

                window.parent.postMessage({
                  type: 'PROXY_NAVIGATE',
                  url: finalUrl
                }, '*');
              }
            }, true);

            const overlay = document.getElementById('ppt-proxy-overlay');
            const btnInsert = document.getElementById('ppt-btn-insert');
            const btnBg = document.getElementById('ppt-btn-bg');
            let hoveredImg = null;

            document.addEventListener('mouseover', function(e) {
              if (e.target.tagName === 'IMG') {
                const img = e.target;
                if (img.width < 32 || img.height < 32) return; // skip tiny elements

                if (hoveredImg) {
                  hoveredImg.classList.remove('ppt-proxy-highlight');
                }
                hoveredImg = img;
                hoveredImg.classList.add('ppt-proxy-highlight');

                overlay.style.display = 'flex';
                overlay.style.position = 'fixed'; // FIXED guarantees viewport-relative coordinates

                // Center horizontally relative to the image
                const rect = img.getBoundingClientRect();
                let left = rect.left + (rect.width / 2) - 145; // 145 is half of 290px overlay width
                let top = rect.bottom + 8; // Placed immediately below the image

                // Margins & viewport clamping limits (safe 12px inset from any edge)
                const minLeft = 12;
                const maxLeft = window.innerWidth - 302; // 290px width + 12px margin
                const minTop = 12;
                const maxTop = window.innerHeight - 56; // 44px height + 12px margin

                if (left < minLeft) left = minLeft;
                if (left > maxLeft) left = maxLeft;

                // Adjust to be inside image bottom if overflows viewport bottom
                if (top > maxTop) {
                  top = rect.bottom - 52;
                }
                if (top < minTop) {
                  top = minTop;
                }

                overlay.style.left = left + 'px';
                overlay.style.top = top + 'px';
                overlay.style.bottom = 'auto';
                overlay.style.transform = 'none';
              }
            });

            document.addEventListener('mousemove', function(e) {
              if (overlay.style.display === 'flex') {
                const isOverImg = e.target === hoveredImg;
                const isOverOverlay = overlay.contains(e.target);
                if (!isOverImg && !isOverOverlay) {
                  if (window.pptHideTimeout) clearTimeout(window.pptHideTimeout);
                  window.pptHideTimeout = setTimeout(() => {
                    if (hoveredImg && e.target !== hoveredImg && !overlay.contains(e.target)) {
                      overlay.style.display = 'none';
                      hoveredImg.classList.remove('ppt-proxy-highlight');
                      hoveredImg = null;
                    }
                  }, 1200);
                } else {
                  if (window.pptHideTimeout) clearTimeout(window.pptHideTimeout);
                }
              }
            });

            btnInsert.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              if (hoveredImg) {
                window.parent.postMessage({
                  type: 'BROWSER_IMAGE_SELECT',
                  src: hoveredImg.src
                }, '*');
                
                btnInsert.innerText = '✅ Added!';
                setTimeout(() => {
                  btnInsert.innerText = '➕ Insert';
                }, 1500);
              }
            });

            btnBg.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              if (hoveredImg) {
                window.parent.postMessage({
                  type: 'BROWSER_IMAGE_BG_SELECT',
                  src: hoveredImg.src
                }, '*');

                btnBg.innerText = '✅ Set BG!';
                setTimeout(() => {
                  btnBg.innerText = '🎨 BG';
                }, 1500);
              }
            });
          })();
        </script>
      `;

      bodyText = bodyText.replace('</body>', `${injectString}</body>`);

      res.setHeader("Content-Type", "text/html");
      res.send(bodyText);
    } catch (err) {
      console.error("Proxy error:", err);
      res.setHeader("Content-Type", "text/html");
      res.send(`
        <div style="font-family:system-ui, sans-serif; padding:32px; background-color:#111827; color:#EF4444; text-align:center; height:100vh; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <h4 style="margin:0 0 12px 0;">⚠️ Security Constraints or Offline domain</h4>
          <p style="color:#9CA3AF; margin:0 0 16px 0; font-size:12px; max-width:320px;">The website requested could not be fetched. This can happen with strict corporate firewalls or sites that deny proxied server heads.</p>
          <a href="#" onclick="window.parent.postMessage({type:'PROXY_NAVIGATE', url:'https://commons.wikimedia.org'}, '*'); return false;" style="color:#6366f1; text-decoration:none; font-size:12px; font-weight:600; border:1px solid #6366f1; padding:6px 12px; border-radius:6px;">Try Wikimedia search instead</a>
        </div>
      `);
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

  async function startServer() {
    const PORT = Number(process.env.PORT) || 3000;

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Only start long-running listeners if not running inside serverless host environment like Vercel
    if (process.env.NODE_ENV !== "production" || process.env.RUN_STANDALONE === "true" || !process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

  startServer();

  export default app;
