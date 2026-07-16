export type PersonalInstructionsSnapshot = {
  pageId: string;
  contentRevision: number;
  snapshot: string;
};

export function applyPersonalInstructions(
  systemInstruction: string,
  instructions: PersonalInstructionsSnapshot | null
) {
  if (!instructions) return systemInstruction;
  return `${systemInstruction}\n\nPersonal Instructions:\n${instructions.snapshot}`;
}
