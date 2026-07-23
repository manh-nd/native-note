export type PersonalInstructionsSnapshot = {
  pageId: string;
  contentRevision: number;
  snapshot: string;
};

export class InstructionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstructionValidationError";
  }
}

export type CompilerOptions = {
  maxSnapshotLength?: number;
};

export class InstructionsCompiler {
  private maxSnapshotLength: number;

  constructor(options: CompilerOptions = {}) {
    this.maxSnapshotLength = options.maxSnapshotLength ?? 2000;
  }

  compile({
    systemInstruction,
    personalInstructions,
  }: {
    systemInstruction: string;
    personalInstructions: PersonalInstructionsSnapshot | null;
  }): string {
    if (!personalInstructions || !personalInstructions.snapshot.trim()) {
      return systemInstruction;
    }

    if (personalInstructions.snapshot.length > this.maxSnapshotLength) {
      throw new InstructionValidationError(
        `Personal instruction snapshot length (${personalInstructions.snapshot.length}) exceeds max limit (${this.maxSnapshotLength}).`
      );
    }

    return `${systemInstruction}\n\nPersonal Instructions:\n${personalInstructions.snapshot}`;
  }
}
