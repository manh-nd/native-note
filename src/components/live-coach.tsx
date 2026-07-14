"use client";

import { useRef, useState } from "react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { ArrowLeft, Loader2, Mic, MicOff, Trash2 } from "lucide-react";
import {
  base64ToBytes,
  bytesToBase64,
  extractLiveEvent,
  floatTo16KhzPcm,
} from "@/lib/live-audio";

type Status = "idle" | "connecting" | "connected" | "reconnecting" | "finished";
type Line = { speaker: "Bạn" | "Coach"; text: string };

export function LiveCoach({ onBack }: { onBack(): void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [hasDue, setHasDue] = useState<boolean | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const practiceId = useRef("");
  const tokenRef = useRef("");
  const resumeHandle = useRef<string | undefined>(undefined);
  const mediaStream = useRef<MediaStream | null>(null);
  const inputContext = useRef<AudioContext | null>(null);
  const outputContext = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const nextPlayTime = useRef(0);
  const reconnecting = useRef(false);

  function clearPlayback() {
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    sources.current.clear();
    nextPlayTime.current = 0;
  }

  function playPcm(base64: string) {
    const context = outputContext.current;
    if (!context) return;
    const bytes = base64ToBytes(base64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const frameCount = Math.floor(bytes.byteLength / 2);
    const buffer = context.createBuffer(1, frameCount, 24_000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1)
      channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.03, nextPlayTime.current);
    source.start(start);
    nextPlayTime.current = start + buffer.duration;
    sources.current.add(source);
    source.onended = () => sources.current.delete(source);
  }

  function handleMessage(message: LiveServerMessage) {
    const event = extractLiveEvent(message);
    for (const audio of event.audio) playPcm(audio);
    if (event.inputText)
      setLines((current) => [
        ...current,
        { speaker: "Bạn", text: event.inputText! },
      ]);
    if (event.outputText)
      setLines((current) => [
        ...current,
        { speaker: "Coach", text: event.outputText! },
      ]);
    if (event.interrupted) clearPlayback();
    if (event.resumeHandle) resumeHandle.current = event.resumeHandle;
    if (event.shouldReconnect && !reconnecting.current) void reconnect();
  }

  async function connect(token: string, handle?: string) {
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: "v1alpha" },
    });
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: handle ? { handle } : {},
      },
      callbacks: {
        onopen: () => {
          setStatus("connected");
          reconnecting.current = false;
        },
        onmessage: handleMessage,
        onerror: (event) =>
          setError(
            event instanceof Error ? event.message : "Kết nối Live API gặp lỗi."
          ),
        onclose: () => {
          if (!reconnecting.current && status !== "finished") setStatus("idle");
        },
      },
    });
    sessionRef.current = session;
    if (!handle)
      session.sendRealtimeInput({
        text: "Please start the role-play now with one short opening question.",
      });
  }

  async function reconnect() {
    if (!tokenRef.current || !resumeHandle.current) {
      setError("Phiên Live đã kết thúc. Hãy bắt đầu phiên mới.");
      return;
    }
    reconnecting.current = true;
    setStatus("reconnecting");
    try {
      sessionRef.current?.close();
      await connect(tokenRef.current, resumeHandle.current);
    } catch {
      reconnecting.current = false;
      setStatus("idle");
      setError("Không thể nối lại phiên luyện nói.");
    }
  }

  async function startMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    mediaStream.current = stream;
    const context = new AudioContext();
    inputContext.current = context;
    const source = context.createMediaStreamSource(stream);
    const node = context.createScriptProcessor(4096, 1, 1);
    processor.current = node;
    node.onaudioprocess = (event) => {
      if (mutedRef.current || !sessionRef.current) return;
      const pcm = floatTo16KhzPcm(
        event.inputBuffer.getChannelData(0),
        context.sampleRate
      );
      sessionRef.current.sendRealtimeInput({
        audio: { data: bytesToBase64(pcm), mimeType: "audio/pcm;rate=16000" },
      });
    };
    source.connect(node);
    node.connect(context.destination);
  }

  async function start() {
    setStatus("connecting");
    setError("");
    setSummary("");
    setLines([]);
    setHasDue(null);
    try {
      const response = await fetch("/api/live/token", { method: "POST" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Không thể tạo phiên Live.");
      if (body.hasDueItems === false) {
        setHasDue(false);
        setStatus("idle");
      } else {
        setHasDue(true);
        tokenRef.current = body.token;
        practiceId.current = body.sessionId;
        outputContext.current = new AudioContext();
        await connect(body.token);
        await startMicrophone();
      }
    } catch (cause) {
      setStatus("idle");
      setError(
        cause instanceof Error ? cause.message : "Không thể bắt đầu luyện nói."
      );
    }
  }

  function toggleMic() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    for (const track of mediaStream.current?.getAudioTracks() ?? [])
      track.enabled = !next;
    if (next) sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
  }

  async function finish() {
    sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    sessionRef.current?.close();
    sessionRef.current = null;
    processor.current?.disconnect();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    await inputContext.current?.close();
    clearPlayback();
    await outputContext.current?.close();
    setStatus("finished");
    const transcript = lines
      .map((line) => `${line.speaker}: ${line.text}`)
      .join("\n");
    if (transcript.length < 10)
      return setSummary("Phiên quá ngắn để đánh giá.");
    try {
      const response = await fetch(
        `/api/live/sessions/${practiceId.current}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSummary(body.assessment.summaryVi);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể đánh giá transcript."
      );
    }
  }

  function deleteTranscript() {
    setLines([]);
    setSummary("");
  }

  return (
    <section className="practice-page">
      <nav className="top-nav">
        <button className="soft-button" onClick={onBack}>
          <ArrowLeft size={15} /> Quay lại luyện viết
        </button>
      </nav>
      <header className="practice-hero">
        <div className="finding-category">Gemini Live</div>
        <h1>Luyện nói từ lỗi đã viết</h1>
        <p>
          Coach sẽ tạo một cuộc hội thoại buộc bạn chủ động dùng lại những cách
          diễn đạt đang cần ôn.
        </p>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="practice-card" style={{ textAlign: "center" }}>
        <div
          className={`live-orb ${status === "connected" && !muted ? "active" : ""}`}
          aria-hidden
        />
        <p className="muted">
          {status === "idle"
            ? hasDue === false
              ? "Không có nội dung cần luyện nói"
              : "Sẵn sàng cho một phiên tối đa 10 phút"
            : status === "connecting"
              ? "Đang kết nối…"
              : status === "reconnecting"
                ? "Đang nối lại phiên…"
                : status === "finished"
                  ? "Phiên đã hoàn tất"
                  : muted
                    ? "Microphone đang tắt"
                    : "Đang lắng nghe"}
        </p>
        {status === "idle" &&
          (hasDue === false ? (
            <div style={{ maxWidth: "440px", margin: "0 auto" }}>
              <p
                className="muted"
                style={{ lineHeight: 1.6, marginBottom: "1.5rem" }}
              >
                Tuyệt vời! Bạn không có cụm từ nào đến hạn luyện nói hôm nay.
                Hãy tiếp tục viết và tương tác với AI để lưu thêm bài học nhé!
              </p>
              <button className="primary-button" onClick={start}>
                <Mic size={16} /> Kiểm tra lại
              </button>
            </div>
          ) : (
            <button className="primary-button" onClick={start}>
              <Mic size={16} /> Bắt đầu luyện nói
            </button>
          ))}
        {(status === "connecting" || status === "reconnecting") && (
          <button className="primary-button" disabled>
            <Loader2 className="animate-spin" size={16} /> Đang kết nối
          </button>
        )}
        {status === "connected" && (
          <div className="card-actions" style={{ justifyContent: "center" }}>
            <button className="soft-button" onClick={toggleMic}>
              {muted ? <Mic size={16} /> : <MicOff size={16} />}{" "}
              {muted ? "Bật mic" : "Tắt mic"}
            </button>
            <button className="primary-button" onClick={finish}>
              Kết thúc
            </button>
          </div>
        )}
        {summary && (
          <div className="verdict" style={{ textAlign: "left" }}>
            <div className="finding-category">Nhận xét sau phiên</div>
            <p>{summary}</p>
          </div>
        )}
        {!!lines.length && (
          <div className="transcript" style={{ textAlign: "left" }}>
            {lines.map((line, index) => (
              <p key={`${line.speaker}-${index}`}>
                <strong>{line.speaker}:</strong> {line.text}
              </p>
            ))}
            <button className="soft-button" onClick={deleteTranscript}>
              <Trash2 size={14} /> Xóa transcript
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
