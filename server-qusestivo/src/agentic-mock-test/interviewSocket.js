import { Server } from 'socket.io';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'; // 🛠️ HIGH-STABILITY STABLE INGESTION LAYER
import prisma from '../prismaClient.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Persistent Memory Maps to prevent runtime data resets across socket drops
const globalSessionMemory = new Map();
const ttsBufferCache = new Map(); // In-Memory Hashing to eliminate redundant TTS compute loops

function float32ToWav(float32Array, sampleRate = 16000) {
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const buffer = new ArrayBuffer(44 + float32Array.length * 2);
  const view = new DataView(buffer);

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + float32Array.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, float32Array.length * 2, true);

  let offset = 44;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return Buffer.from(buffer);
}

// 🔈 100% ERROR-FREE FREE NEURAL TTS VOICE COMPILER WITH REGISTERED INSTANCE
async function generateVoiceBuffer(text) {
  const cleanSpeechString = text.replace(/[*#`_\-]/g, ' ').trim();
  if (!cleanSpeechString) return null;

  const textHashKey = crypto.createHash('md5').update(cleanSpeechString).digest('hex');
  if (ttsBufferCache.has(textHashKey)) {
    console.log(`💾 [TTS Engine Cache] Reclaimed voice buffer match for signature: ${textHashKey}`);
    return ttsBufferCache.get(textHashKey);
  }

  try {
    const ttsEngine = new MsEdgeTTS();
    
    // Set standard output formatting baseline parameters
    await ttsEngine.setMetadata(
      'en-US-AvaMultilingualNeural', 
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBPS_TRUESILK
    );

    // Direct memory array resolution without hitting disk leaks boundaries
    const rawDataBuffer = await ttsEngine.toBuffer(cleanSpeechString);
    
    ttsBufferCache.set(textHashKey, rawDataBuffer);
    return rawDataBuffer;

  } catch (err) {
    console.error("⚠️ [TTS Client Engine Exception Log]:", err);
    return null;
  }
}

export const initializeInterviewSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 5e7
  });

  io.on('connection', (socket) => {
    console.log(`📡 [WebSocket Gateway] Stream tunnel ready for instance: ${socket.id}`);

    socket.on('join-interview-session', async (sessionId) => {
      try {
        if (!sessionId) return;
        socket.join(sessionId);
        socket.sessionId = sessionId;

        if (globalSessionMemory.has(sessionId)) {
          const cachedSession = globalSessionMemory.get(sessionId);
          socket.chatMemoryHistory = cachedSession.history;
          console.log(`🔄 [WebSocket Gateway] Persistent history recovered safely for session ID: ${sessionId}`);
          return;
        }

        const sessionDetails = await prisma.interviewSession.findUnique({
          where: { id: sessionId }
        });

        if (!sessionDetails) {
          socket.emit('engine-exception', { error: 'Target session context not found or expired.' });
          return;
        }

        const allocatedSeconds = (sessionDetails.durationMinutes || 15) * 60;

        socket.chatMemoryHistory = [
          {
            role: 'system',
            content: `You are an elite, sharp technical interviewer and mentor for the position of "${sessionDetails.experienceLevel} ${sessionDetails.targetRole}" at "${sessionDetails.targetCompany}".

CANDIDATE PARSED RESUME MATRIX DATA:
${sessionDetails.resumeSnapshot}

TARGET JOB CONTEXT / SCOPE LOGS:
${sessionDetails.jobDescription || 'Evaluate standard algorithms, full-stack architecture paradigms, optimization limits and patterns.'}

CORE OPERATIONAL LOGIC & FEEDBACK ENGINE:
1. Conduct a rigorous live conversational simulation interview round.
2. Ask exactly ONE question at a time. Do not use markdown syntax. Maximum response length is 3 sentences total.
3. GREETING RULE: On your absolute first turn, warmly greet candidate by name (Ajay), state their target profile path, and deliver a welcoming technical query.
4. MENTORSHIP & CRITIQUE RULE (Turn 2 onwards): First provide a 1-sentence analytical critique of their answer. Explicitly point out what they missed or how to improve. Then, use 1-2 sentences to pose the next contextual engineering question. Transition smoothly. Ensure every generated phrase forms a completely closed structure.`
          }
        ];

        globalSessionMemory.set(sessionId, {
          history: socket.chatMemoryHistory,
          aiBusy: false,
          processingVoice: false,
          timeRemaining: allocatedSeconds
        });

        console.log(`🎯 [WebSocket Gateway] System context loaded for session ID: ${sessionId}`);
        await runAgentInferenceLoop(socket);

      } catch (err) {
        console.error('❌ Connection handshake routing error on socket context layer:', err);
      }
    });

    socket.on('interview-timer-sync', (data) => {
      const sessId = socket.sessionId;
      if (!sessId) return;
      let sessionContext = globalSessionMemory.get(sessId);
      if (sessionContext) {
        sessionContext.timeRemaining = data.timeRemaining;
        globalSessionMemory.set(sessId, sessionContext);
      }
    });

    socket.on('candidate-voice-stream', async (rawAudioData) => {
      const sessId = socket.sessionId;
      if (!sessId) return;

      let sessionContext = globalSessionMemory.get(sessId);
      if (!sessionContext) return;

      if (sessionContext.aiBusy || sessionContext.processingVoice) {
        console.log("⏳ [Engine Dropped Block] Input ignored while AI transaction loop completes.");
        return;
      }

      try {
        sessionContext.processingVoice = true;
        socket.emit('engine-status-sync', { state: 'FINAL_TRANSCRIBING', text: 'Processing high-res stream matrices...' });

        let floatArray;
        if (Buffer.isBuffer(rawAudioData)) {
          floatArray = new Float32Array(rawAudioData.buffer, rawAudioData.byteOffset, rawAudioData.length / 4);
        } else if (rawAudioData && rawAudioData.buffer) {
          floatArray = new Float32Array(rawAudioData.buffer);
        } else {
          floatArray = new Float32Array(Object.values(rawAudioData));
        }

        if (floatArray.length === 0) {
          sessionContext.processingVoice = false;
          return;
        }

        const tempWavFilename = path.join(process.cwd(), `./transient_speech_${socket.id}_${Date.now()}.wav`);
        const wavBuffer = float32ToWav(floatArray);
        
        fs.writeFileSync(tempWavFilename, wavBuffer);

        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempWavFilename),
          model: 'whisper-large-v3',
          temperature: 0.0
        });

        if (fs.existsSync(tempWavFilename)) fs.unlinkSync(tempWavFilename);

        const candidateTextResponse = transcription.text;
        if (!candidateTextResponse || !candidateTextResponse.trim()) {
          sessionContext.processingVoice = false;
          socket.emit('engine-status-sync', { state: 'LISTENING', text: 'Listening...' });
          return;
        }

        socket.emit('candidate-transcript-final', { text: candidateTextResponse });
        sessionContext.history.push({ role: 'user', content: candidateTextResponse });

        await prisma.interviewMessage.create({
          data: {
            sessionId: sessId,
            sender: 'candidate',
            content: candidateTextResponse
          }
        });

        sessionContext.processingVoice = false;
        await runAgentInferenceLoop(socket);

      } catch (err) {
        console.error('❌ Ingestion conversion pipeline crash caught on socket thread:', err);
        sessionContext.processingVoice = false;
        socket.emit('engine-status-sync', { state: 'LISTENING', text: 'Listening...' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Voice transmission gateway channel closed for socket ID: ${socket.id}`);
    });
  });
};

async function runAgentInferenceLoop(socket) {
  const sessId = socket.sessionId;
  if (!sessId) return;

  let sessionContext = globalSessionMemory.get(sessId);
  if (!sessionContext) return;

  try {
    sessionContext.aiBusy = true;
    socket.emit('engine-status-sync', { state: 'THINKING', text: 'AI is thinking up technical vectors...' });

    const systemPrompt = sessionContext.history[0];
    const computationalChatHistory = sessionContext.history.slice(1);
    
    if (computationalChatHistory.length > 6) {
      const compressedSlidingWindow = computationalChatHistory.slice(-6);
      sessionContext.history = [systemPrompt, ...compressedSlidingWindow];
    }

    if (sessionContext.timeRemaining <= 30 && sessionContext.timeRemaining > 0) {
      console.log(`⚠️ [Inference Engine] Time remaining constraint active: ${sessionContext.timeRemaining}s. Forcing wrap-up prompt rules.`);
      sessionContext.history.push({
        role: 'system',
        content: "CRITICAL NOTIFICATION: The allocation timer is nearly exhausted. State exactly 'Let's conclude your interview' followed by a short summary breakdown of their performance matrix. Do not request any additional questions."
      });
    }

    const completionChain = await groq.chat.completions.create({
      messages: sessionContext.history,
      model: 'llama-3.1-8b-instant',
      temperature: 0.4,
      max_tokens: 250 
    });

    let aiGeneratedQuestion = completionChain.choices[0]?.message?.content;
    if (!aiGeneratedQuestion) {
      sessionContext.aiBusy = false;
      return;
    }

    aiGeneratedQuestion = aiGeneratedQuestion.replace(/[*#`_\-]/g, ' ').replace(/\s+/g, ' ').trim();

    if (sessionContext.history[sessionContext.history.length - 1]?.content?.includes("CRITICAL NOTIFICATION")) {
      sessionContext.history.pop();
    }

    sessionContext.history.push({ role: 'assistant', content: aiGeneratedQuestion });
    globalSessionMemory.set(sessId, sessionContext);

    socket.emit('candidate-transcript-final', { sender: 'ai', text: aiGeneratedQuestion });
    socket.emit('engine-status-sync', { state: 'GENERATING_VOICE', text: 'Synthesizing neural vocal structures...' });
    
    await prisma.interviewMessage.create({
      data: {
        sessionId: sessId,
        sender: 'ai',
        content: aiGeneratedQuestion
      }
    });

    const audioBuffer = await generateVoiceBuffer(aiGeneratedQuestion);
    if (audioBuffer) {
      socket.emit('ai-speech-packet', audioBuffer);
    } else {
      console.warn("⚠️ [TTS Failover Trigger] Server synthesis faulted. Dropping fallback signal token.");
      socket.emit('ai-speech-failover', { text: aiGeneratedQuestion });
    }

    sessionContext.aiBusy = false;

  } catch (error) {
    console.error('❌ Failed processing dynamic question synthesis loops over agent context layer:', error);
    sessionContext.aiBusy = false;
    socket.emit('engine-status-sync', { state: 'LISTENING', text: 'Listening...' });
  }
}