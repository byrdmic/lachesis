// Types inferred from the AI SDK OpenAI provider documentation.
// These are kept locally so we can validate provider options without depending
// on upstream type availability.

export type OpenAIServiceTier = 'auto' | 'flex' | 'priority' | 'default'
export type OpenAIReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
export type OpenAIReasoningSummary = 'auto' | 'detailed'
export type OpenAITextVerbosity = 'low' | 'medium' | 'high'
export type OpenAIPromptCacheRetention = 'in_memory' | '24h'
export type OpenAIImageDetail = 'low' | 'high' | 'auto'

export type OpenAIResponsesProviderOptions = {
  parallelToolCalls?: boolean
  store?: boolean
  maxToolCalls?: number
  metadata?: Record<string, string>
  conversation?: string
  previousResponseId?: string
  instructions?: string
  user?: string
  reasoningEffort?: OpenAIReasoningEffort
  reasoningSummary?: OpenAIReasoningSummary
  strictJsonSchema?: boolean
  serviceTier?: OpenAIServiceTier
  textVerbosity?: OpenAITextVerbosity
  include?: ('file_search_call.results' | 'message.output_text.logprobs')[]
  truncation?: 'auto' | 'disabled'
  promptCacheKey?: string
  promptCacheRetention?: OpenAIPromptCacheRetention
  safetyIdentifier?: string
  imageDetail?: OpenAIImageDetail
}

export type OpenAIChatLanguageModelOptions = {
  logitBias?: Record<number, number>
  logprobs?: boolean | number
  parallelToolCalls?: boolean
  user?: string
  reasoningEffort?: Exclude<OpenAIReasoningEffort, 'none'>
  structuredOutputs?: boolean
  maxCompletionTokens?: number
  store?: boolean
  metadata?: Record<string, string>
  prediction?: Record<string, unknown>
  serviceTier?: OpenAIServiceTier
  strictJsonSchema?: boolean
  textVerbosity?: OpenAITextVerbosity
  promptCacheKey?: string
  promptCacheRetention?: OpenAIPromptCacheRetention
  safetyIdentifier?: string
  imageDetail?: OpenAIImageDetail
}

export type OpenAICompletionModelOptions = {
  echo?: boolean
  logitBias?: Record<number, number>
  logprobs?: boolean | number
  suffix?: string
  user?: string
}

export type OpenAIWebSearchUserLocation = {
  type: 'approximate'
  city?: string
  region?: string
  country?: string
}

export type OpenAIWebSearchToolOptions = {
  externalWebAccess?: boolean
  searchContextSize?: 'low' | 'medium' | 'high'
  userLocation?: OpenAIWebSearchUserLocation
}

export type OpenAIFileSearchFilter = {
  key: string
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin'
  value: string | number | boolean
}

export type OpenAIFileSearchRanking = {
  ranker?: 'auto'
  scoreThreshold?: number
}

export type OpenAIFileSearchToolOptions = {
  vectorStoreIds: string[]
  maxNumResults?: number
  filters?: OpenAIFileSearchFilter
  ranking?: OpenAIFileSearchRanking
}

export type OpenAIImageGenerationToolOptions = {
  outputFormat?: 'png' | 'webp' | 'jpeg'
  quality?: 'low' | 'standard' | 'high'
  size?:
    | '256x256'
    | '512x512'
    | '1024x1024'
    | '1024x1792'
    | '1792x1024'
}

export type OpenAICodeInterpreterToolOptions = {
  container?: string | { fileIds?: string[] }
}

export type OpenAILocalShellToolOptions = {
  execute: ({ action }: { action: string }) => Promise<{ output: string }>
}

export type OpenAIPredictionOptions = {
  type: 'content'
  content: string
}

export type OpenAIProviderMetadata = {
  responseId?: string
  cachedPromptTokens?: number
  reasoningTokens?: number
  acceptedPredictionTokens?: number
  rejectedPredictionTokens?: number
  logprobs?: unknown
}

