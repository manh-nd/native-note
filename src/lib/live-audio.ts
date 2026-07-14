export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function floatTo16KhzPcm(input: Float32Array, sourceRate: number) {
  const ratio = sourceRate / 16_000;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(index * ratio)]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(output.buffer);
}

type EventLike = {
  serverContent?: {
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
  };
  sessionResumptionUpdate?: { newHandle?: string };
  goAway?: unknown;
};

export function extractLiveEvent(message: EventLike) {
  const audio: string[] = [];
  for (const part of message.serverContent?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) audio.push(part.inlineData.data);
  }
  return {
    audio,
    inputText: message.serverContent?.inputTranscription?.text,
    outputText: message.serverContent?.outputTranscription?.text,
    interrupted: message.serverContent?.interrupted === true,
    resumeHandle: message.sessionResumptionUpdate?.newHandle,
    shouldReconnect: Boolean(message.goAway),
  };
}
