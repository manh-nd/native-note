import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, extractLiveEvent, floatTo16KhzPcm } from "./live-audio";

describe("Live audio helpers", () => {
  it("round-trips PCM bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("resamples float audio to 16kHz signed PCM", () => {
    const output = floatTo16KhzPcm(new Float32Array(48_000).fill(0.5), 48_000);
    expect(output.byteLength).toBe(32_000);
    expect(new Int16Array(output.buffer)[0]).toBeGreaterThan(16_000);
  });

  it("processes every audio part in a server event", () => {
    const event = extractLiveEvent({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: "one" } }, {}, { inlineData: { data: "two" } }] },
        inputTranscription: { text: "hello" }, outputTranscription: { text: "hi" }, interrupted: true,
      },
      sessionResumptionUpdate: { newHandle: "resume" }, goAway: {},
    });
    expect(event).toEqual({ audio: ["one", "two"], inputText: "hello", outputText: "hi", interrupted: true, resumeHandle: "resume", shouldReconnect: true });
  });
});
