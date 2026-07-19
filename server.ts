import express from 'express';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize users.json with default administrator credentials
if (!fs.existsSync(USERS_FILE)) {
  const defaultAdmin = [
    {
      id: 'admin-id',
      username: 'admin',
      password: 'admin_sanzo_2026',
      role: 'admin',
      createdAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2), 'utf-8');
}

function readUsers(): any[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read users file', err);
  }
  return [];
}

function writeUsers(users: any[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write users file', err);
  }
}

const TRACKS_FILE = path.join(__dirname, 'tracks.json');

// Initialize tracks.json
if (!fs.existsSync(TRACKS_FILE)) {
  fs.writeFileSync(TRACKS_FILE, JSON.stringify([], null, 2), 'utf-8');
}

function readTracks(): any[] {
  try {
    if (fs.existsSync(TRACKS_FILE)) {
      const data = fs.readFileSync(TRACKS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read tracks file', err);
  }
  return [];
}

function writeTracks(tracks: any[]) {
  try {
    fs.writeFileSync(TRACKS_FILE, JSON.stringify(tracks, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write tracks file', err);
  }
}


const app = express();
app.use(express.json());

interface LocalTask {
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  url?: string;
  errorMessage?: string;
  isCloud?: boolean;
  cloudProvider?: 'CN' | 'AI';
  cloudTaskId?: string;
}
const localTasks = new Map<string, LocalTask>();

app.use('/output_music', express.static('/home1/wuzi/ComfyUI/output_music'));

// Enable native CORS to allow localhost:3000 browser queries to pass freely
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = 3001;
const useLocalLLM = process.env.USE_LOCAL_LLM === 'true';
const lmStudioUrl = process.env.LM_STUDIO_API_URL || 'http://localhost:1234/v1/chat/completions';

// DeepSeek API endpoints config
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

// RunningHub domain/endpoint config & local concurrency limits
const RUNNINGHUB_BASE_URL = (process.env.RUNNINGHUB_BASE_URL || 'https://www.runninghub.cn').replace(/\/$/, '');
const MAX_LOCAL_CONCURRENCY = parseInt(process.env.MAX_LOCAL_CONCURRENCY || '1', 10);

// RunningHub individual credentials
const RUNNINGHUB_AI_API_KEY = process.env.RUNNINGHUB_AI_API_KEY || '7155e9437d894ab6b7e63fb158523a04';
const RUNNINGHUB_AI_APP_ID = process.env.RUNNINGHUB_AI_APP_ID || '2044441753280847873';
const RUNNINGHUB_AI_COVER_APP_ID = process.env.RUNNINGHUB_AI_COVER_APP_ID || '2070144315099271170';

const RUNNINGHUB_CN_API_KEY = process.env.RUNNINGHUB_CN_API_KEY || '1098ab9c5554401dbeb8f464383511bd';
const RUNNINGHUB_CN_APP_ID = process.env.RUNNINGHUB_CN_APP_ID || '2077026060922871809';
const RUNNINGHUB_CN_COVER_APP_ID = process.env.RUNNINGHUB_CN_COVER_APP_ID || '2070144315099271170';

const isCN = RUNNINGHUB_BASE_URL.includes('.cn');
const RUNNINGHUB_API_KEY = isCN ? RUNNINGHUB_CN_API_KEY : RUNNINGHUB_AI_API_KEY;
const RUNNINGHUB_APP_ID = isCN ? RUNNINGHUB_CN_APP_ID : RUNNINGHUB_AI_APP_ID;
const RUNNINGHUB_COVER_APP_ID = isCN ? RUNNINGHUB_CN_COVER_APP_ID : RUNNINGHUB_AI_COVER_APP_ID;

if (!RUNNINGHUB_CN_API_KEY && !RUNNINGHUB_AI_API_KEY) {
  console.warn('[SECURITY WARNING] Neither RunningHub CN nor AI API Keys are configured in .env file!');
}

// Common caller to fetch chat completion from either local LM Studio or DeepSeek API (OpenAI Compatible)
async function callChatModel(systemPrompt: string, userPrompt: string): Promise<string> {
  const url = useLocalLLM ? lmStudioUrl : DEEPSEEK_API_URL;
  const apiKey = useLocalLLM ? '' : DEEPSEEK_API_KEY;
  const modelName = useLocalLLM ? (process.env.LOCAL_LLM_MODEL || 'qwen3.5:35b-a3b') : 'deepseek-v4-flash';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (!useLocalLLM && apiKey && apiKey !== 'your_deepseek_api_key_here') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 增加超时至60秒以保证复杂大模型文本生成与思考链路的稳定性

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        ...(!useLocalLLM ? {
          thinking: { type: 'disabled' }
        } : {}),
        temperature: 0.7
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Model API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    throw new Error('Invalid response structure from LLM provider.');
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Model API request timed out after 60 seconds');
    }
    throw err;
  }
}

function parseModelJson(text: string): any {
  let cleanText = text.trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```[a-zA-Z]*\s*/, '');
    cleanText = cleanText.replace(/\s*```$/, '');
  }
  const startIdx = cleanText.indexOf('{');
  const endIdx = cleanText.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleanText = cleanText.slice(startIdx, endIdx + 1);
  }
  try {
    return JSON.parse(cleanText.trim());
  } catch (initialErr: any) {
    try {
      console.warn("Standard JSON parsing failed, attempting syntax cleaning...", initialErr.message);
      // 容错处理：替换非转义的控制字符（如真实的回车换行）
      const sanitized = cleanText.trim()
        .replace(/[\n\r]/g, '\\n')
        .replace(/\t/g, ' ');
      return JSON.parse(sanitized);
    } catch (fallbackErr) {
      console.error("All JSON parser fallbacks exhausted. Raw string was:", text);
      throw initialErr;
    }
  }
}

function sanitizeStyle(style: any): string {
  if (!style) return '';
  let styleStr = '';
  if (Array.isArray(style)) {
    styleStr = style.join(', ');
  } else if (typeof style === 'string') {
    styleStr = style;
  } else {
    styleStr = String(style);
  }
  return styleStr.replace(/,?\s*\d+\s*bpms?/gi, '').replace(/^,|,$/g, '').trim();
}

// Route 1: Prompt Expansion to full song configuration (JSON output)
app.post('/api/generate-track', async (req, res) => {
  const { prompt } = req.body;
  const isAnalyzeMode = prompt && prompt.includes('[LYRIC ANALYZE MODE]');
  const lang = /[\u4e00-\u9fa5]/.test(prompt || '') ? 'Chinese (简体中文)' : 'English';
  
  let userContent = '';
  let systemInstruction = '';
  
  if (isAnalyzeMode) {
    const rawLyrics = prompt.replace('[LYRIC ANALYZE MODE] Please analyze this lyric to recommend title, bpm and style. Do not invent new lyrics:\n', '');
    userContent = `用户提供的歌词文本为:\n"${rawLyrics}"\n[强制命令/CRITICAL] 你的 "lyrics" 字段必须原样返回用户提供的歌词文本，绝对不准重新创作或发明新歌词！在生成的 JSON 串中，"lyrics" 字段中的换行必须严格使用字符 "\\n" 进行转义，以确保返回标准的 JSON。`;
    
    systemInstruction = `你是一个专业的 AI 音乐合成助理。你的任务是读取用户提供的歌词文本，并为其设计一首结构完整的歌曲属性和元数据。
    你必须且只能输出一个合法的 JSON 对象，不包含任何 Markdown 标记。
    JSON 结构限制如下：
    - "title": 歌曲名。基于歌词意境起一个好听的歌名。
    - "style": 曲风标签列表，例如 "Liquid Synthwave, Cyberpunk, Retrowave"（注意：风格中绝对不能包含BPM、拍子或任何数字，例如不得出现"70BPM"、"4/4"）。
    - "bpm": 适合该歌词节奏的 BPM 整数（60 到 160 之间）。
    - "chords": 适合的和弦走向，例如 "Minor 9th / Sus4" 或 "I-V-vi-IV Progression"。
    - "timeSig": 拍子记号如 "4/4"、"3/4"、"7/8"。
    - "lyrics": 你必须直接原样返回用户提供的歌词文本，绝对不要重新创作歌词！
    - "voice": "Female", "Male" 或 "Instrumental" 之一。
    - "duration": 时长格式为 MM:SS，比如 "03:15"。`;
  } else {
    userContent = `用户的情绪描述为: "${prompt || 'Deep Void'}"\n[强制命令/CRITICAL] 你必须完全使用 ${lang} 语言来撰写 "lyrics" 字段的歌词文本！如果输入是中文，你只准输出简体中文歌词，绝对不准翻译成英文！`;
    
    systemInstruction = `你是一个专业的 AI 音乐合成助理。你的任务是读取用户输入的情绪、想法或故事描述，并将其转化为一首结构完整的歌曲属性和元数据。
    你必须且只能输出一个合法的 JSON 对象，不包含任何 Markdown 标记。
    JSON 结构限制如下：
    - "title": 歌曲名。你必须检测输入语种，并确保生成的歌曲标题的语种与歌词主体语种完全对应（如果生成的歌词是中文，则必须使用适宜歌曲意境的中文歌名；如果生成的歌词是英文，则使用大写的英文歌名）。
    - "style": 曲风标签列表，例如 "Liquid Synthwave, Cyberpunk, Retrowave"（注意：风格中绝对不能包含BPM、拍子或任何数字，例如不得出现"70BPM"、"4/4"）。
    - "bpm": 适合的 BPM 整数（60 到 160 之间）。
    - "chords": 适合的和弦走向，例如 "Minor 9th / Sus4" 或 "I-V-vi-IV Progression"。
    - "timeSig": 拍子记号如 "4/4"、"3/4"、"7/8"。
    - "lyrics": 包含 [Verse 1], [Chorus], [Outro] 等标签的格式化歌词。你必须检测用户输入的主体语言，并确保生成的歌词语言与输入完全一致。
    - "voice": "Female", "Male" 或 "Instrumental" 之一。
    - "duration": 时长格式为 MM:SS，比如 "03:15"。`;
  }

  try {
    const resultText = await callChatModel(systemInstruction, userContent);
    const trackData = parseModelJson(resultText);
    if (trackData.style) {
      trackData.style = sanitizeStyle(trackData.style);
    }
    res.json(trackData);
  } catch (error) {
    console.error('API /api/generate-track error:', error);
    res.status(500).json({ error: 'LLM Generation failed' });
  }
});

// Route 2: One-click lyrics polishing & advanced parameters extraction
app.post('/api/polish-lyrics', async (req, res) => {
  const { lyrics } = req.body;
  const lang = /[\u4e00-\u9fa5]/.test(lyrics || '') ? 'Chinese (简体中文)' : 'English';
  const userContent = `润色此歌词：\n${lyrics || ''}\n[强制命令/CRITICAL] 你必须完全使用 ${lang} 语言输出 "lyrics" 字段的歌词！绝对不要发生跨语种的自动翻译。如果输入是中文，你就只能输出中文！`;
  
  const systemInstruction = `你是一个专业的作词家和音乐制作助理。读取用户提供的粗糙歌词文本，在保留原意境和核心词句的基础上，对其进行字句润色、押韵和修辞精修，并重构为带有专业结构（如 [Verse 1], [Chorus], [Bridge], [Outro]）的高品质歌词。请不要抛弃或完全重写用户的心血创作。
  同时，你需要基于润色后的新歌词意境，设计并返回完整的歌曲高级参数配置。
  你必须且只能返回一个合法的 JSON 对象，不包含任何 Markdown 标记。
  [CRITICAL FORMAT RULE] 在生成的 JSON 串中，"lyrics" 字段中的换行必须严格使用字符 "\\n" 进行转义，绝对不能直接写入真实的回车换行，且所有的双引号必须转义为 "\\\""，以确保返回一个绝对标准、可直接 JSON.parse 的合法 JSON 串。
  JSON 对象字段如下：
  - "title": 最适配该歌词意境与情绪的精美歌名（中英文需与实际输出语种完全一致，通常为3-8个字，例如 "夜幕频率" 或 "Neon Rhythm"）。
  - "lyrics": 润色精修后的歌词文本。你必须检测并采用与用户输入完全一致 of 语种（英文则生成英文歌词，中文则生成中文歌词，粤语则生成粤语歌词等），绝不发生任何跨语种翻译！
  - "style": 提炼出的编曲风格，例如 "Cosmic Pad, Acoustic Chimes, Ambient Drone"（注意：风格中绝不能包含BPM或任何数字，例如不得包含"70BPM"）。
  - "bpm": 最适配该歌词的BPM整数（60-160之间）。
  - "chords": 最适配的和弦矩阵。
  - "timeSig": 拍子记号如 "4/4", "3/4", "7/8"。
  - "duration": 时长格式如 "03:15"。
  - "language": 自动分析的主体语言，如 "Mandarin", "English" 或 "Cantonese"。（需与实际输出语种完全匹配）。
  - "voice": 推荐人声 "Female", "Male" 或 "Instrumental"。`;

  try {
    const resultText = await callChatModel(systemInstruction, userContent);
    const data = parseModelJson(resultText);
    if (data.style) {
      data.style = sanitizeStyle(data.style);
    }
    if (data.chords && Array.isArray(data.chords)) {
      data.chords = data.chords.join(' - ');
    }
    res.json(data);
  } catch (error) {
    console.error('API /api/polish-lyrics error:', error);
    res.status(500).json({ error: 'Lyrics polish failed' });
  }
});

// Route 3: One-click song style tags polishing (No BPM returned)
app.post('/api/polish-style', async (req, res) => {
  const { style } = req.body;
  const systemInstruction = `你是一个资深音乐评论家和编曲师。将用户输入的直白曲风（例如“悲伤的电子”）精修扩写为专业的声学曲风标签。
  你必须且只能返回包含 {"polished": "扩写后的曲风标签，例如 'Ambient Drone, Cosmic Space Pad'"} 格式的 JSON 字符串，不要包含任何多余文字。
  注意：曲风中绝不能包含BPM、拍子或任何数字（例如不得包含"120 BPM"、"70BPM"、"4/4"）。`;

  try {
    const resultText = await callChatModel(systemInstruction, `润色曲风: "${style || ''}"`);
    const data = parseModelJson(resultText);
    if (data.polished) {
      data.polished = sanitizeStyle(data.polished);
    }
    res.json(data);
  } catch (error) {
    console.error('API /api/polish-style error:', error);
    res.status(500).json({ error: 'Style polish failed' });
  }
});

// Route 4: One-click mood prompt polishing
app.post('/api/polish-mood', async (req, res) => {
  const { prompt } = req.body;
  const lang = /[\u4e00-\u9fa5]/.test(prompt || '') ? 'Chinese (简体中文)' : 'English';
  const userContent = `润色情绪: "${prompt || ''}"\n[强制命令/CRITICAL] 你必须完全使用 ${lang} 来输出 "polished" 字段的提示词，绝对不准将其翻译成英文！`;
  
  const systemInstruction = `你是一个专业的音乐情绪策划师和作词家。读取用户提供的简短情绪描述，帮其润色并写成一段极具画面感、故事感与音乐共鸣度的歌词写意提示词。
  你必须且只能返回包含 {"polished": "歌词形式的提示词"} 格式 of JSON 字符串。
  注意：提示词必须使用歌词那样的分行、分段格式排版（一般在 3-4 行，使用换行符 \\n 分隔），无需添加 Verse 等标签。生成的歌词提示词语种必须与用户输入完全保持一致，不要跨语种翻译。`;

  try {
    const resultText = await callChatModel(systemInstruction, userContent);
    res.json({ polished: parseModelJson(resultText).polished });
  } catch (error) {
    console.error('API /api/polish-mood error:', error);
    res.status(500).json({ error: 'Mood polish failed' });
  }
});

// Route 5: Submit RunningHub ComfyUI Music & Cover Creation Tasks
app.post('/api/runninghub/generate', async (req, res) => {
  const { style, lyrics, duration, language, chords, timeSig, bpm, skipCover, voice } = req.body;

  const taskId = `local_music_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const coverTaskId = `local_cover_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // 1. Mock the Cover Task
  localTasks.set(coverTaskId, {
    status: 'SUCCESS',
    url: `https://picsum.photos/seed/${encodeURIComponent((style || 'WAVE') + '-' + Math.floor(Math.random() * 10000))}/400/400`
  });

  // 2. Duration MM:SS to seconds float
  let durationSec = 60.0;
  if (duration && typeof duration === 'string' && duration.includes(':')) {
    const parts = duration.split(':');
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    durationSec = m * 60 + s;
  } else if (duration) {
    durationSec = parseFloat(duration) || 60.0;
  }

  // 3. Mapping fields to match local script expectations
  // Language mapping: "zh", "ja", "en", etc.
  const validLanguages = ["en", "ja", "zh", "es", "de", "fr", "pt", "ru", "it", "nl", "pl", "tr", "vi", "cs", "fa", "id", "ko", "uk", "hu", "ar", "sv", "ro", "el"];
  let langCode = 'zh';
  const langLower = (language || '').toLowerCase().trim();
  if (validLanguages.includes(langLower)) {
    langCode = langLower;
  } else if (langLower.includes('ja') || langLower.includes('japan')) {
    langCode = 'ja';
  } else if (langLower.includes('en') || langLower.includes('english')) {
    langCode = 'en';
  } else if (langLower.includes('cantonese') || langLower.includes('mandarin') || langLower.includes('chinese') || langLower.includes('zh')) {
    langCode = 'zh';
  }

  // Keyscale mapping
  const validChords = [
    "C major", "C# major", "Db major", "D major", "D# major", "Eb major", "E major", "F major", "F# major", "Gb major", "G major", "G# major", "Ab major", "A major", "A# major", "Bb major", "B major",
    "C minor", "C# minor", "Db minor", "D minor", "D# minor", "Eb minor", "E minor", "F minor", "F# minor", "Gb minor", "G minor", "G# minor", "Ab minor", "A minor", "A# minor", "Bb minor", "B minor"
  ];
  let keyscaleValue = "C major";
  const chordsLower = (chords || '').toLowerCase().trim();
  const directMatch = validChords.find(vc => chordsLower.includes(vc.toLowerCase()));
  if (directMatch) {
    keyscaleValue = directMatch;
  } else {
    if (chordsLower.includes('minor') || chordsLower.includes('min') || chordsLower.includes('vi')) {
      keyscaleValue = "A minor";
    } else {
      keyscaleValue = "C major";
    }
  }

  // Time signature
  let beats = "4";
  if (timeSig && typeof timeSig === 'string' && timeSig.includes('/')) {
    beats = timeSig.split('/')[0];
  } else if (timeSig) {
    beats = String(timeSig);
  }
  if (!["2", "3", "4", "6"].includes(beats)) {
    beats = "4";
  }

  // BPM
  const bpmVal = Math.round(Number(bpm)) || 95;

  // Default voice to 'Female' if not provided but lyrics are present and not empty
  let actualVoice = voice;
  if (!actualVoice && lyrics && lyrics.trim() && !lyrics.toLowerCase().includes('[instrumental]')) {
    actualVoice = 'Female';
  }

  // Append voice prompts to style tag to enforce vocal generation
  let finalStyle = style || 'Ambient';
  if (actualVoice) {
    const voiceLower = actualVoice.toLowerCase();
    if (voiceLower.includes('female')) {
      finalStyle += ', Female vocals, Singing, Female vocalist';
    } else if (voiceLower.includes('male')) {
      finalStyle += ', Male vocals, Singing, Male vocalist';
    } else if (voiceLower.includes('instrumental')) {
      finalStyle += ', Instrumental, No vocals, Pure instrumental';
    }
  }

  // Count active local music tasks
  let activeLocalMusicTasks = 0;
  for (const [id, task] of localTasks.entries()) {
    if (id.startsWith('local_music_') && (task.status === 'RUNNING' || task.status === 'QUEUED')) {
      activeLocalMusicTasks++;
    }
  }

  let useRunningHub = activeLocalMusicTasks >= MAX_LOCAL_CONCURRENCY;

  if (useRunningHub) {
    console.log(`[Concurrency Control] Concurrency detected (${activeLocalMusicTasks} active tasks). Trying cloud dispatch...`);
    
    let rhTaskId: string | null = null;
    let cloudProvider: 'CN' | 'AI' | null = null;

    // 1. Try RunningHub.cn first if key exists
    if (RUNNINGHUB_CN_API_KEY) {
      try {
        console.log(`[Concurrency Control] Attempting dispatch to RunningHub.cn...`);
        const rhUrl = `https://www.runninghub.cn/openapi/v2/run/ai-app/${RUNNINGHUB_CN_APP_ID}`;
        const rhPayload = {
          nodeInfoList: [
            { nodeId: "41", fieldName: "text", fieldValue: finalStyle },
            { nodeId: "40", fieldName: "text", fieldValue: lyrics || '[Intro]' },
            { nodeId: "43", fieldName: "value", fieldValue: String(durationSec) },
            { nodeId: "36", fieldName: "language", fieldValue: langCode },
            { nodeId: "36", fieldName: "keyscale", fieldValue: keyscaleValue },
            { nodeId: "36", fieldName: "timesignature", fieldValue: beats },
            { nodeId: "44", fieldName: "value", fieldValue: String(bpmVal) }
          ],
          instanceType: "default",
          usePersonalQueue: "false"
        };

        const rhResponse = await fetch(rhUrl, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RUNNINGHUB_CN_API_KEY}`
          },
          body: JSON.stringify(rhPayload)
        });

        if (rhResponse.ok) {
          const rhResult = await rhResponse.json();
          if (rhResult.taskId && (!rhResult.errorCode || rhResult.errorCode === "")) {
            rhTaskId = rhResult.taskId;
            cloudProvider = 'CN';
            console.log(`[Concurrency Control] RunningHub.cn submission successful. Task ID: ${rhTaskId}`);
          } else {
            console.warn(`[Concurrency Control] RunningHub.cn returned error: ${rhResult.errorMessage || JSON.stringify(rhResult)}`);
          }
        } else {
          console.warn(`[Concurrency Control] RunningHub.cn HTTP error: ${rhResponse.status}`);
        }
      } catch (err: any) {
        console.error(`[Concurrency Control] RunningHub.cn dispatch exception:`, err.message || err);
      }
    }

    // 2. If CN failed or wasn't configured, try RunningHub.ai
    if (!rhTaskId && RUNNINGHUB_AI_API_KEY) {
      try {
        console.log(`[Concurrency Control] Attempting dispatch to RunningHub.ai...`);
        const rhUrl = `https://www.runninghub.ai/openapi/v2/run/ai-app/${RUNNINGHUB_AI_APP_ID}`;
        const rhPayload = {
          nodeInfoList: [
            { nodeId: "41", fieldName: "text", fieldValue: finalStyle },
            { nodeId: "40", fieldName: "text", fieldValue: lyrics || '[Intro]' },
            { nodeId: "43", fieldName: "value", fieldValue: String(durationSec) },
            { nodeId: "36", fieldName: "language", fieldValue: langCode },
            { nodeId: "36", fieldName: "keyscale", fieldValue: keyscaleValue },
            { nodeId: "36", fieldName: "timesignature", fieldValue: beats },
            { nodeId: "44", fieldName: "value", fieldValue: String(bpmVal) }
          ],
          instanceType: "default",
          usePersonalQueue: "false"
        };

        const rhResponse = await fetch(rhUrl, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RUNNINGHUB_AI_API_KEY}`
          },
          body: JSON.stringify(rhPayload)
        });

        if (rhResponse.ok) {
          const rhResult = await rhResponse.json();
          if (rhResult.taskId && (!rhResult.errorCode || rhResult.errorCode === "")) {
            rhTaskId = rhResult.taskId;
            cloudProvider = 'AI';
            console.log(`[Concurrency Control] RunningHub.ai submission successful. Task ID: ${rhTaskId}`);
          } else {
            console.warn(`[Concurrency Control] RunningHub.ai returned error: ${rhResult.errorMessage || JSON.stringify(rhResult)}`);
          }
        } else {
          console.warn(`[Concurrency Control] RunningHub.ai HTTP error: ${rhResponse.status}`);
        }
      } catch (err: any) {
        console.error(`[Concurrency Control] RunningHub.ai dispatch exception:`, err.message || err);
      }
    }

    // 3. If either cloud dispatch succeeded, store task details and return local taskId to frontend
    if (rhTaskId && cloudProvider) {
      localTasks.set(taskId, {
        status: 'RUNNING',
        isCloud: true,
        cloudProvider: cloudProvider,
        cloudTaskId: rhTaskId
      });

      return res.json({
        taskId,
        coverTaskId
      });
    }

    console.warn(`[Concurrency Control] Both RunningHub CN and AI dispatches failed. Falling back to local GPU queue.`);
  }

  // Set up the Music Task for local execution
  localTasks.set(taskId, { status: 'QUEUED' });

  // Output filename
  const outputFilename = `song_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp3`;

  // Start the generation asynchronously in the background
  const pythonPath = '/home1/wuzi/anaconda3/envs/comfyui/bin/python';
  const scriptPath = path.join(__dirname, 'generate_music_api.py');
  const outputDir = '/home1/wuzi/ComfyUI/output_music';

  console.log(`[Local AI Studio] Spawning ComfyUI Music Generation via spawn`);

  localTasks.set(taskId, { status: 'RUNNING' });

  // Spawn child process for better security and argument handling
  const child = spawn(pythonPath, [
    scriptPath,
    '--lyrics', lyrics || '[Intro]',
    '--style', finalStyle,
    '--duration', String(durationSec),
    '--bpm', String(bpmVal),
    '--timesignature', beats,
    '--language', langCode,
    '--keyscale', keyscaleValue,
    '--output_dir', outputDir,
    '--output_filename', outputFilename
  ]);

  let stdoutData = '';
  let stderrData = '';

  child.stdout?.on('data', (chunk) => {
    stdoutData += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    stderrData += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`[Local AI Studio] Generation error for task ${taskId}: exit code ${code}`);
      console.error(`Stderr: ${stderrData}`);
      localTasks.set(taskId, {
        status: 'FAILED',
        errorMessage: stderrData.trim() || `Python execution failed with code ${code}`
      });
      return;
    }

    console.log(`[Local AI Studio] Generation success for task ${taskId}`);
    const downloadUrl = `/output_music/${outputFilename}`;

    localTasks.set(taskId, {
      status: 'SUCCESS',
      url: downloadUrl
    });
  });

  res.json({
    taskId,
    coverTaskId
  });
});

// Route 6: Generate Album Cover only
app.post('/api/runninghub/generate-cover', async (req, res) => {
  const { style } = req.body;
  const taskId = `local_cover_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  // Count active local cover tasks
  let activeLocalCoverTasks = 0;
  for (const [id, task] of localTasks.entries()) {
    if (id.startsWith('local_cover_') && (task.status === 'RUNNING' || task.status === 'QUEUED')) {
      activeLocalCoverTasks++;
    }
  }

  let useRunningHub = activeLocalCoverTasks >= MAX_LOCAL_CONCURRENCY;

  if (useRunningHub) {
    console.log(`[Concurrency Control] Cover concurrency detected (${activeLocalCoverTasks} active tasks). Trying cloud dispatch...`);
    
    let rhTaskId: string | null = null;
    let cloudProvider: 'CN' | 'AI' | null = null;

    // 1. Try RunningHub.cn first if key exists
    if (RUNNINGHUB_CN_API_KEY) {
      try {
        console.log(`[Concurrency Control] Attempting cover dispatch to RunningHub.cn...`);
        const rhUrl = `https://www.runninghub.cn/openapi/v2/run/ai-app/${RUNNINGHUB_CN_COVER_APP_ID}`;
        const rhPayload = {
          nodeInfoList: [
            {
              nodeId: "98",
              fieldName: "text_b",
              fieldValue: style || 'music cover art, abstract, high quality, masterpiece'
            }
          ],
          instanceType: "default",
          usePersonalQueue: "false"
        };

        const rhResponse = await fetch(rhUrl, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RUNNINGHUB_CN_API_KEY}`
          },
          body: JSON.stringify(rhPayload)
        });

        if (rhResponse.ok) {
          const rhResult = await rhResponse.json();
          if (rhResult.taskId && (!rhResult.errorCode || rhResult.errorCode === "")) {
            rhTaskId = rhResult.taskId;
            cloudProvider = 'CN';
            console.log(`[Concurrency Control] RunningHub.cn cover submission successful. Task ID: ${rhTaskId}`);
          } else {
            console.warn(`[Concurrency Control] RunningHub.cn cover returned error: ${rhResult.errorMessage || JSON.stringify(rhResult)}`);
          }
        } else {
          console.warn(`[Concurrency Control] RunningHub.cn cover HTTP error: ${rhResponse.status}`);
        }
      } catch (err: any) {
        console.error(`[Concurrency Control] RunningHub.cn cover dispatch exception:`, err.message || err);
      }
    }

    // 2. If CN failed or wasn't configured, try RunningHub.ai
    if (!rhTaskId && RUNNINGHUB_AI_API_KEY) {
      try {
        console.log(`[Concurrency Control] Attempting cover dispatch to RunningHub.ai...`);
        const rhUrl = `https://www.runninghub.ai/openapi/v2/run/ai-app/${RUNNINGHUB_AI_COVER_APP_ID}`;
        const rhPayload = {
          nodeInfoList: [
            {
              nodeId: "98",
              fieldName: "text_b",
              fieldValue: style || 'music cover art, abstract, high quality, masterpiece'
            }
          ],
          instanceType: "default",
          usePersonalQueue: "false"
        };

        const rhResponse = await fetch(rhUrl, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RUNNINGHUB_AI_API_KEY}`
          },
          body: JSON.stringify(rhPayload)
        });

        if (rhResponse.ok) {
          const rhResult = await rhResponse.json();
          if (rhResult.taskId && (!rhResult.errorCode || rhResult.errorCode === "")) {
            rhTaskId = rhResult.taskId;
            cloudProvider = 'AI';
            console.log(`[Concurrency Control] RunningHub.ai cover submission successful. Task ID: ${rhTaskId}`);
          } else {
            console.warn(`[Concurrency Control] RunningHub.ai cover returned error: ${rhResult.errorMessage || JSON.stringify(rhResult)}`);
          }
        } else {
          console.warn(`[Concurrency Control] RunningHub.ai cover HTTP error: ${rhResponse.status}`);
        }
      } catch (err: any) {
        console.error(`[Concurrency Control] RunningHub.ai cover dispatch exception:`, err.message || err);
      }
    }

    // 3. If either cloud dispatch succeeded, store task details and return local taskId to frontend
    if (rhTaskId && cloudProvider) {
      localTasks.set(taskId, {
        status: 'RUNNING',
        isCloud: true,
        cloudProvider: cloudProvider,
        cloudTaskId: rhTaskId
      });

      return res.json({
        taskId
      });
    }

    console.warn(`[Concurrency Control] Both RunningHub CN and AI cover dispatches failed. Falling back to local GPU queue.`);
  }

  // Set up the Cover Task for local execution
  localTasks.set(taskId, { status: 'QUEUED' });

  const pythonPath = '/home1/wuzi/anaconda3/envs/comfyui/bin/python';
  const scriptPath = path.join(__dirname, 'generate_text2img_api.py');
  const outputDir = '/home1/wuzi/ComfyUI/output_music';
  const outputFilename = `cover_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`;

  console.log(`[Local AI Studio] Spawning ComfyUI Cover Generation via spawn`);

  localTasks.set(taskId, { status: 'RUNNING' });

  // Spawn child process for better security and argument handling
  const child = spawn(pythonPath, [
    scriptPath,
    '--prompt', style || 'music cover art, abstract, high quality, masterpiece',
    '--output_dir', outputDir,
    '--output_filename', outputFilename
  ]);

  let stdoutData = '';
  let stderrData = '';

  child.stdout?.on('data', (chunk) => {
    stdoutData += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    stderrData += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`[Local AI Studio] Cover generation error for task ${taskId}: exit code ${code}`);
      console.error(`Stderr: ${stderrData}`);
      localTasks.set(taskId, {
        status: 'FAILED',
        errorMessage: stderrData.trim() || `Python execution failed with code ${code}`
      });
      return;
    }

    console.log(`[Local AI Studio] Cover generation success for task ${taskId}`);
    const downloadUrl = `/output_music/${outputFilename}`;

    localTasks.set(taskId, {
      status: 'SUCCESS',
      url: downloadUrl
    });
  });

  res.json({ taskId });
});

// Route 7: Query Task Status
app.post('/api/runninghub/query', async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Missing taskId' });
  }

  if (localTasks.has(taskId)) {
    const task = localTasks.get(taskId)!;

    if (task.isCloud) {
      const apiKey = task.cloudProvider === 'CN' ? RUNNINGHUB_CN_API_KEY : RUNNINGHUB_AI_API_KEY;
      const baseUrl = task.cloudProvider === 'CN' ? 'https://www.runninghub.cn' : 'https://www.runninghub.ai';

      try {
        const response = await fetch(`${baseUrl}/openapi/v2/query`, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({ taskId: task.cloudTaskId })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Cloud query failed: ${response.status} - ${errText}`);
        }

        const data = await response.json();

        // Sync local cache
        if (data.status === 'SUCCESS') {
          const url = data.results && data.results[0] && data.results[0].url;
          task.status = 'SUCCESS';
          task.url = url;
          localTasks.set(taskId, task);
        } else if (data.status === 'FAILED') {
          task.status = 'FAILED';
          task.errorMessage = data.errorMessage || 'Cloud task failed';
          localTasks.set(taskId, task);
        } else if (data.status === 'RUNNING' || data.status === 'QUEUED') {
          task.status = data.status;
          localTasks.set(taskId, task);
        }

        return res.json(data);
      } catch (err: any) {
        console.error(`Error querying cloud task ${task.cloudTaskId} on ${task.cloudProvider}:`, err);
        return res.json({ status: task.status });
      }
    }

    if (task.status === 'SUCCESS') {
      return res.json({
        status: 'SUCCESS',
        results: [{ url: task.url }]
      });
    } else if (task.status === 'FAILED') {
      return res.json({
        status: 'FAILED',
        errorMessage: task.errorMessage
      });
    } else {
      return res.json({
        status: task.status // QUEUED or RUNNING
      });
    }
  }

  // Fallback to RunningHub query if taskId is not local (e.g. legacy tasks)
  try {
    const url = `${RUNNINGHUB_BASE_URL}/openapi/v2/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNNINGHUB_API_KEY}`
      },
      body: JSON.stringify({ taskId })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`RunningHub query failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('API /api/runninghub/query error:', error);
    res.status(500).json({ error: 'RunningHub query failed' });
  }
});

// Auth API: Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = readUsers();
  const existingUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username,
    password, // Plain text for simplicity
    role: 'user',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsers(users);

  res.json({
    message: 'Registration successful',
    user: { id: newUser.id, username: newUser.username, role: newUser.role }
  });
});

// Auth API: Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  res.json({
    message: 'Login successful',
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// Admin API: List Users
app.get('/api/admin/users', (req, res) => {
  const adminUsername = req.headers['x-admin-username'];
  const users = readUsers();

  const adminUser = users.find(u => u.username === adminUsername && u.role === 'admin');
  if (!adminUser) {
    return res.status(403).json({ error: 'Unauthorized. Admin access only.' });
  }

  const filteredUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt
  }));

  res.json(filteredUsers);
});

// Admin API: Delete User
app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const adminUsername = req.headers['x-admin-username'];
  const users = readUsers();

  const adminUser = users.find(u => u.username === adminUsername && u.role === 'admin');
  if (!adminUser) {
    return res.status(403).json({ error: 'Unauthorized. Admin access only.' });
  }

  const userIndex = users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userToDelete = users[userIndex];
  if (userToDelete.role === 'admin') {
    return res.status(400).json({ error: 'Cannot delete admin account' });
  }

  users.splice(userIndex, 1);
  writeUsers(users);

  res.json({ message: 'User deleted successfully' });
});

// Save generated track for a user
app.post('/api/tracks', (req, res) => {
  const { track, taskId } = req.body;
  const username = req.headers['x-username'] as string;

  if (!username || !track) {
    return res.status(400).json({ error: 'Username header and track details are required' });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Determine modelSource
  let modelSource: 'local' | 'runninghub' | 'offline' = 'local';
  if (!taskId) {
    modelSource = 'offline';
  } else if (localTasks.has(taskId)) {
    const task = localTasks.get(taskId)!;
    if (task.isCloud) {
      modelSource = 'runninghub';
    } else {
      modelSource = 'local';
    }
  } else {
    // If not in localTasks, it is a cloud taskId forwarded from RunningHub
    modelSource = 'runninghub';
  }

  const tracks = readTracks();
  const newTrack = {
    ...track,
    userId: user.id,
    username: user.username,
    modelSource,
    createdAt: new Date().toISOString()
  };

  tracks.push(newTrack);
  writeTracks(tracks);

  res.json({ message: 'Track saved successfully', track: newTrack });
});

// Get saved tracks for a user
app.get('/api/tracks', (req, res) => {
  const username = req.headers['x-username'] as string;
  if (!username) {
    return res.status(400).json({ error: 'Username header is required' });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const tracks = readTracks();
  // Return tracks created by this user
  const userTracks = tracks.filter(t => t.userId === user.id);
  res.json(userTracks);
});

// Admin API: List all generated tracks
app.get('/api/admin/tracks', (req, res) => {
  const adminUsername = req.headers['x-admin-username'] as string;
  const users = readUsers();

  const adminUser = users.find(u => u.username === adminUsername && u.role === 'admin');
  if (!adminUser) {
    return res.status(403).json({ error: 'Unauthorized. Admin access only.' });
  }

  const tracks = readTracks();
  res.json(tracks);
});

// Admin API: Delete a generated track
app.delete('/api/admin/tracks/:id', (req, res) => {
  const { id } = req.params;
  const adminUsername = req.headers['x-admin-username'] as string;
  const users = readUsers();

  const adminUser = users.find(u => u.username === adminUsername && u.role === 'admin');
  if (!adminUser) {
    return res.status(403).json({ error: 'Unauthorized. Admin access only.' });
  }

  let tracks = readTracks();
  const trackIndex = tracks.findIndex(t => t.id === id);
  if (trackIndex === -1) {
    return res.status(404).json({ error: 'Track not found' });
  }

  tracks.splice(trackIndex, 1);
  writeTracks(tracks);

  res.json({ message: 'Track deleted successfully' });
});

app.listen(PORT, () => {
  console.log(`[Sanzo LLM Backend] Running on http://localhost:${PORT}`);
  console.log(`[Mode] ${useLocalLLM ? 'Local (LM Studio)' : 'Cloud (DeepSeek API)'}`);
});
