import type { Tracer } from '@opentelemetry/api';
import type { AxSignature } from '../dsp/sig.js';
import type { AxGenIn, AxGenOut, AxMessage } from '../dsp/types.js';
import type { AxAPI } from '../util/apicall.js';

// --- Function-related types ---
export type AxFunctionJSONSchema = {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
  description?: string;
  properties?: Record<string, AxFunctionJSONSchema>;
  required?: string[];
  items?: AxFunctionJSONSchema;
  enum?: (string | number)[];
  oneOf?: AxFunctionJSONSchema[];
  format?: string;
  nullable?: boolean;
  maxItems?: number;
  minItems?: number;
  minProperties?: number;
  maxProperties?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  example?: any;
  anyOf?: AxFunctionJSONSchema[];
  propertyOrdering?: string[];
  default?: any;
  minimum?: number;
  maximum?: number;
};

export type AxFunctionHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  options?: Readonly<AxAIServiceActionOptions>
) => unknown | Promise<unknown>;

export interface AxFunction {
  name: string;
  description: string;
  parameters: AxFunctionJSONSchema;
  func?: AxFunctionHandler;
}

// --- Model and Config types ---
export type AxModelConfig = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stream?: boolean;
  stopSequences?: readonly string[];
  endSequences?: readonly string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  n?: number;
};

export interface AxModelInfo {
  name: string;
  currency: 'usd' | string;
  promptTokenCostPer1M: number;
  completionTokenCostPer1M: number;
  characterIsToken?: boolean;
  inputCostPer1KTokens?: number;
  outputCostPer1KTokens?: number;
  hasThinkingBudget?: boolean;
  hasShowThoughts?: boolean;
}

export type AxAIModelMap<TModel = string, TEmbedModel = undefined> = {
  key: TModel | string;
  model: string;
  description: string;
  embedModel?: TEmbedModel | string;
};
export type AxAIInputModelList<
  TModel = string,
  TEmbedModel = undefined,
> = Readonly<AxAIModelMap<TModel, TEmbedModel>[]>;

// --- AI Service interfaces ---

export interface AxAIPromptConfig {
  showThoughts?: boolean;
  thinkingTokenBudget?:
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'highest'
  | 'none';
}

export interface AxAIServiceOptions {
  fetch?: typeof fetch;
  debug?: boolean;
  tracer?: Tracer;
}

export type AxLoggerFunction = (
  message: string,
  options: {
    tags: string[];
  }
) => void;

export type AxRateLimiterFunction = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: () => Promise<any>,
  info: {
    modelUsage: AxChatResponse['modelUsage'];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

export interface AxAIServiceActionOptions {
  sessionId?: string;
  traceId?: string;
  abortSignal?: AbortSignal;
  ai?: AxAIService;
}

// --- Chat request/response types ---
export type AxChatRequest = {
  // Can be a standard message array or a provider-specific request object
  chatPrompt: ReadonlyArray<AxMessage> | object;
  functions?: readonly AxFunction[];
  functionCall?: 'auto' | 'none' | 'required' | { name: string };
  modelConfig?: Readonly<Partial<AxModelConfig>>;
  model?: string;
  signature?: AxSignature;
};

export type AxChatResponseResult = {
  content?: string | null;
  functionCalls?: {
    id: string;
    type: 'function';
    function: { name: string; params: object | string };
  }[];
  finishReason?:
  | 'stop'
  | 'length'
  | 'function_calls'
  | 'content_filter'
  | 'other'
  | string;
  name?: string;
  thought?: string;
};

export type AxTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  thoughtsTokens?: number;
};

export type AxChatResponse = {
  results: AxChatResponseResult[];
  modelUsage?: AxTokenUsage & {
    ai: string;
    model: string;
  };
};

// --- Embed request/response types ---
export type AxEmbedResponse = {
  embeddings: number[][];
  modelUsage?: AxTokenUsage & {
    ai: string;
    model: string;
  };
};

// --- Internal request types used by the Base AI class ---
export type AxInternalChatRequest<TModel> = AxChatRequest & { model?: TModel };
export type AxInternalEmbedRequest<TEmbedModel> = {
  texts: readonly string[];
  embedModel?: TEmbedModel;
};

// --- The core AI Service interface ---
export interface AxAIService {
  chat(
    req: Readonly<AxChatRequest>,
    options?: Readonly<
      AxAIServiceActionOptions &
      AxAIPromptConfig & {
        rateLimiter?: AxRateLimiterFunction;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        traceContext?: any;
        debug?: boolean;
        stream?: boolean;
      }
    >
  ): Promise<AxChatResponse | ReadableStream<AxChatResponse>>;

  embed(
    req: Readonly<{ texts: readonly string[]; embedModel?: string }>,
    options?: Readonly<AxAIServiceActionOptions>
  ): Promise<AxEmbedResponse>;

  prepareChatRequest(
    req: Readonly<AxChatRequest>,
    options?: Readonly<
      AxAIServiceActionOptions &
      AxAIPromptConfig & {
        rateLimiter?: AxRateLimiterFunction;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        traceContext?: any;
        debug?: boolean;
        stream?: boolean;
      }
    >
  ): Promise<unknown>;

  getOptions(): Readonly<AxAIServiceOptions>;
  getLogger(): AxLoggerFunction;
  getName(): string;
  getModelList(): AxAIInputModelList;
  getFeatures(model?: string): {
    functions: boolean;
    streaming: boolean;
    json: boolean;
    hasThinkingBudget: boolean;
    hasShowThoughts: boolean;
    functionCot: boolean;
  };
  getLastUsedChatModel(): string | undefined;
  getLastUsedModelConfig(): Readonly<AxModelConfig> | undefined;
}

// --- The implementation interface for a specific AI provider ---
export interface AxAIServiceImpl<
  TModel,
  TEmbedModel,
  TChatReq,
  TEmbedReq,
  TChatResp,
  TChatStreamResp,
  TEmbedResp,
> {
  getModelConfig(): AxModelConfig;
  getTokenUsage(): AxTokenUsage | undefined;
  createChatReq(
    req: Readonly<AxInternalChatRequest<TModel>>,
    config: Readonly<AxAIPromptConfig>
  ): [AxAPI, TChatReq]; // AxAPI is from apicall.ts
  createEmbedReq(
    req: Readonly<AxInternalEmbedRequest<TEmbedModel>>
  ): [AxAPI, TEmbedReq];
  createChatResp(resp: Readonly<TChatResp>): AxChatResponse;
  createChatStreamResp(resp: Readonly<TChatStreamResp>): AxChatResponse;
  createEmbedResp(resp: Readonly<TEmbedResp>): AxEmbedResponse;
}