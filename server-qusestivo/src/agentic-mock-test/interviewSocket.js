import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
// `parseCookie`, and imported by name. cookie@2 has no default export and
// renamed `parse` — either mistake fails at module-instantiation time, which
// takes the whole server down at boot rather than erroring on the first socket.
import { parseCookie } from 'cookie';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'; // 🛠️ HIGH-STABILITY STABLE INGESTION LAYER
import prisma from '../prismaClient.js';
// Credentials, models and cross-provider failover live in the AI client.
import { chat, transcribe, ROLES } from '../lib/aiClient.js';
import { isAllowedOrigin } from '../lib/allowedOrigins.js';

/**
 * Who is on the other end of this socket.
 *
 * The REST side of interviews checks ownership properly —
 * getInterviewTranscript refuses a session that is not yours. The socket did
 * not check anything at all: it accepted a connection from any origin, and
 * `join-interview-session` took a session id and loaded that session's
 * `resumeSnapshot` into the model's system prompt. Anyone holding an id could
 * join a stranger's interview and simply ask the interviewer to recite the
 * candidate's resume back to them. The careful check on the HTTP route was
 * bypassable by connecting over the websocket instead.
 *
 * A socket carries the same two credentials an HTTP request does: the session
 * cookie is sent on the handshake, and the client can pass the bearer token in
 * `auth.token`. Both are read here so the socket authenticates exactly the way
 * every other entry point does.
 */
function identifySocket(socket) {
  const fromAuth = socket.handshake?.auth?.token;
  const header = socket.handshake?.headers?.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : null;

  let fromCookie = null;
  try {
    const raw = socket.handshake?.headers?.cookie;
    if (raw) fromCookie = parseCookie(raw).token || null;
  } catch {
    // A malformed Cookie header is not a session; fall through to the others.
  }

  const token = fromCookie || (typeof fromAuth === 'string' && fromAuth) || bearer;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.Secret_Token);
    return decoded?.userId || null;
  } catch {
    return null;
  }
}

/**
 * The id an interview started without an account is filed under.
 *
 * interviewController stores `anon:<ip>` when nobody is signed in, and the
 * analyser is deliberately usable logged out, so refusing every socket without
 * a JWT would break a supported flow rather than close a hole. Matching the
 * same string here lets an anonymous candidate rejoin their own session and
 * nobody else's.
 *
 * It is a weak identity and it is meant to be — it stands in for "the same
 * browser on the same connection", not for a person. Anything worth protecting
 * belongs to a signed-in user and is compared against a verified token above.
 * The first hop of x-forwarded-for is used for the same reason otpThrottle uses
 * it: behind Vercel and Render, req.ip is the proxy on every request.
 */
function anonymousId(socket) {
  const fwd = socket.handshake?.headers?.['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0];
  const ip = (first || socket.handshake?.address || 'unknown').trim();
  return `anon:${ip}`;
}

/**
 * May this socket see the session owned by `ownerId`?
 *
 * A signed-in socket must be the owner. A socket with no token may only reach
 * a session that was itself anonymous and carries the same anon: marker — never
 * one belonging to a real account, which is the case that was leaking resumes.
 */
export function maySeeSession(socket, ownerId) {
  if (!ownerId) return false;
  if (socket.userId) return ownerId === socket.userId;
  return ownerId.startsWith('anon:') && ownerId === socket.anonId;
}

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
    /**
     * The same allow-list the HTTP layer uses, not '*'.
     *
     * With credentials on the handshake, '*' let any page on the internet open
     * an authenticated socket to this server using the visitor's own cookie.
     */
    cors: {
      origin: (origin, cb) =>
        isAllowedOrigin(origin)
          ? cb(null, true)
          : cb(new Error(`Origin not allowed by CORS: ${origin}`)),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    /**
     * 5 MB, down from 50.
     *
     * The largest thing a client legitimately sends is one chunk of recorded
     * audio. Fifty megabytes per message, accepted before any authentication
     * happened, was an invitation to allocate the process to death from an
     * anonymous connection.
     */
    maxHttpBufferSize: 5e6
  });

  io.on('connection', (socket) => {
    // Resolved once per connection rather than per event: the handshake is
    // where the credentials are, and re-reading them on every message would not
    // make them any fresher.
    socket.userId = identifySocket(socket);
    socket.anonId = anonymousId(socket);

    console.log(`📡 [WebSocket Gateway] Stream tunnel ready for instance: ${socket.id}`);

    socket.on('join-interview-session', async (sessionId) => {
      try {
        if (!sessionId) return;

        /**
         * Ownership, before anything about this session is loaded.
         *
         * The session row is fetched first because the answer depends on who
         * owns it, and it is fetched here rather than after the cache lookup
         * below because the in-memory cache was itself a way past this check:
         * a second socket joining an id already in globalSessionMemory got the
         * history handed to it without a database read at all.
         */
        const owner = await prisma.interviewSession.findUnique({
          where: { id: sessionId },
          select: { userId: true },
        });

        if (!owner) {
          socket.emit('engine-exception', { error: 'Target session context not found or expired.' });
          return;
        }

        if (!maySeeSession(socket, owner.userId)) {
          // Deliberately the same message as "not found". Distinguishing the
          // two would turn this socket into an oracle for which interview ids
          // exist, which is the first half of the attack it just refused.
          socket.emit('engine-exception', { error: 'Target session context not found or expired.' });
          return;
        }

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
        // Say so. This branch used to log and return, so a database hiccup
        // during the join left the client sitting on a silent socket with a
        // spinner and no way to know the join had failed at all.
        socket.emit('engine-exception', {
          error: 'Could not start the interview session. Please try again.',
        });
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

        // fileFactory, not a stream: a stream consumed by a failed attempt
        // cannot be replayed, so a retry on the next provider would upload an
        // empty body and "succeed" with an empty transcript.
        const transcription = await transcribe({
          fileFactory: () => fs.createReadStream(tempWavFilename),
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

    const completionChain = await chat(ROLES.CONVERSATION, {
      messages: sessionContext.history,
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