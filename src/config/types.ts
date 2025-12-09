// Configuration types for Lachesis

export type AIProvider = "anthropic" | "openai" | "vertex" | "other";

export type LachesisConfig = {
  vaultPath: string; // Base Obsidian projects path
  defaultInterviewDepth: "short" | "medium" | "deep";
  defaultQuestionMode: "single" | "batch";
  // AI configuration
  defaultProvider: AIProvider;
  defaultModel: string;
  apiKeyEnvVar: string;
};

export const DEFAULT_CONFIG: LachesisConfig = {
  vaultPath: "", // Will be set based on OS detection
  defaultInterviewDepth: "medium",
  defaultQuestionMode: "single",
  defaultProvider: "openai",
  defaultModel: "chatgpt-5.1",
  apiKeyEnvVar: "OPENAI_API_KEY",
};
