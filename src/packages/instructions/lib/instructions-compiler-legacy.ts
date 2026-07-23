import {
  InstructionsCompiler,
  type PersonalInstructionsSnapshot,
} from "./instructions-compiler";

const defaultCompiler = new InstructionsCompiler();

export function applyPersonalInstructions(
  systemInstruction: string,
  instructions: PersonalInstructionsSnapshot | null
): string {
  return defaultCompiler.compile({
    systemInstruction,
    personalInstructions: instructions,
  });
}
