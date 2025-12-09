// Interview engine types

export type PhaseId =
  | "setup"
  | "vision"      // AI-guided discovery phase
  | "finalize";

export type QuestionType = "text" | "select" | "multiline" | "confirm";

export type SelectOption = {
  label: string;
  value: string;
};

export type Question = {
  id: string;
  phase: PhaseId;
  text: string;
  type: QuestionType;
  options?: SelectOption[]; // For select type
  required?: boolean;
  // Depth thresholds - question shown if depth >= threshold
  // short = 1, medium = 2, deep = 3
  minDepth?: 1 | 2 | 3;
};

export type Answer = {
  questionId: string;
  value: string | string[];
  timestamp: string;
};

export type PhaseDefinition = {
  id: PhaseId;
  name: string;
  description: string;
  questions: Question[];
  summaryCheckQuestion: string;
};

export type InterviewState = {
  currentPhase: PhaseId;
  currentQuestionIndex: number;
  answers: Map<string, Answer>;
  isComplete: boolean;
};

// Depth number mapping
export function depthToNumber(depth: "short" | "medium" | "deep"): 1 | 2 | 3 {
  switch (depth) {
    case "short":
      return 1;
    case "medium":
      return 2;
    case "deep":
      return 3;
  }
}
