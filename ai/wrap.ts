import type { ReadableStream } from 'stream/web'

import { AxAIDeepSeek, type AxAIDeepSeekArgs } from './deepseek/api.js'
import type { AxAIDeepSeekModel } from './deepseek/types.js'
import {
  AxAIGoogleGemini,
  type AxAIGoogleGeminiArgs,
} from './google-gemini/api.js'
import type {
  AxAIGoogleGeminiEmbedModel,
  AxAIGoogleGeminiModel,
} from './google-gemini/types.js'
import type {
  AxAIModelList,
  AxAIPromptConfig,
  AxAIService,
  AxAIServiceActionOptions,
  AxAIServiceMetrics,
  AxAIServiceOptions,
  AxChatRequest,
  AxChatResponse,
  AxEmbedRequest,
  AxEmbedResponse,
  AxLoggerFunction,
} from './types.js'

export type AxAIArgs =
  | AxAIGoogleGeminiArgs
  | AxAIDeepSeekArgs

export type AxAIModels =
  | AxAIGoogleGeminiModel
  | AxAIDeepSeekModel

export type AxAIEmbedModels =
  | AxAIGoogleGeminiEmbedModel

export class AxAI implements AxAIService {
  private ai: AxAIService

  constructor(options: Readonly<AxAIArgs>) {
    switch (options.name) {
      case 'google-gemini':
        this.ai = new AxAIGoogleGemini(options)
        break
      case 'deepseek':
        this.ai = new AxAIDeepSeek(options)
        break
      default:
        throw new Error(`Unknown AI`)
    }
  }

  getName(): string {
    return this.ai.getName()
  }

  getId(): string {
    return this.ai.getId()
  }

  getFeatures(model?: string): { functions: boolean; streaming: boolean } {
    return this.ai.getFeatures(model)
  }

  getModelList() {
    return this.ai.getModelList() as AxAIModelList | undefined
  }

  getLastUsedChatModel() {
    return this.ai.getLastUsedChatModel()
  }

  getLastUsedEmbedModel() {
    return this.ai.getLastUsedEmbedModel()
  }

  getLastUsedModelConfig() {
    return this.ai.getLastUsedModelConfig()
  }

  getMetrics(): AxAIServiceMetrics {
    return this.ai.getMetrics()
  }

  async chat(
    req: Readonly<AxChatRequest>,
    options?: Readonly<
      AxAIPromptConfig & AxAIServiceActionOptions & { stream?: boolean }
    >
  ): Promise<AxChatResponse | ReadableStream<AxChatResponse>> {
    return await this.ai.chat(req, options)
  }

  async prepareChatRequest(
    req: Readonly<AxChatRequest>,
    options?: Readonly<
      AxAIPromptConfig & AxAIServiceActionOptions & { stream?: boolean }
    >
  ): Promise<unknown> {
    return await this.ai.prepareChatRequest(req, options)
  }

  async embed(
    req: Readonly<AxEmbedRequest>,
    options?: Readonly<AxAIServiceActionOptions & AxAIServiceActionOptions>
  ): Promise<AxEmbedResponse> {
    return await this.ai.embed(req, options)
  }

  setOptions(options: Readonly<AxAIServiceOptions>): void {
    this.ai.setOptions(options)
  }

  getOptions(): Readonly<AxAIServiceOptions> {
    return this.ai.getOptions()
  }

  getLogger(): AxLoggerFunction {
    return this.ai.getLogger()
  }
}