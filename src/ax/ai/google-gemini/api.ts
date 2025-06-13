import { getModelInfo } from '../../dsp/modelinfo.js'
import type { AxField, AxSignature, PRIMITIVES } from '../../dsp/sig.js'
import type { AxAPI } from '../../util/apicall.js'
import {
  AxBaseAI,
  axBaseAIDefaultConfig,
  axBaseAIDefaultCreativeConfig,
} from '../base.js'
import { GoogleVertexAuth } from '../google-vertex/auth.js'
import type {
  AxAIPromptConfig,
  AxAIServiceImpl,
  AxAIServiceOptions,
  AxAIInputModelList,
  AxChatResponse,
  AxChatResponseResult,
  AxEmbedResponse,
  AxFunction,
  AxFunctionJSONSchema,
  AxInternalChatRequest,
  AxInternalEmbedRequest,
  AxModelConfig,
  AxModelInfo,
  AxTokenUsage,
} from '../types.js'

import { axModelInfoGoogleGemini } from './info.js'
import {
  type AxAIGoogleGeminiBatchEmbedRequest,
  type AxAIGoogleGeminiBatchEmbedResponse,
  type AxAIGoogleGeminiChatRequest,
  type AxAIGoogleGeminiChatResponse,
  type AxAIGoogleGeminiChatResponseDelta,
  type AxAIGoogleGeminiConfig,
  AxAIGoogleGeminiEmbedModel,
  type AxAIGoogleGeminiGenerationConfig,
  AxAIGoogleGeminiModel,
  AxAIGoogleGeminiSafetyCategory,
  type AxAIGoogleGeminiSafetySettings,
  AxAIGoogleGeminiSafetyThreshold,
  type AxAIGoogleVertexBatchEmbedRequest,
  type AxAIGoogleVertexBatchEmbedResponse,
} from './types.js'

const safetySettings: AxAIGoogleGeminiSafetySettings = [
  {
    category: AxAIGoogleGeminiSafetyCategory.HarmCategoryHarassment,
    threshold: AxAIGoogleGeminiSafetyThreshold.BlockNone,
  },
  {
    category: AxAIGoogleGeminiSafetyCategory.HarmCategoryHateSpeech,
    threshold: AxAIGoogleGeminiSafetyThreshold.BlockNone,
  },
  {
    category: AxAIGoogleGeminiSafetyCategory.HarmCategorySexuallyExplicit,
    threshold: AxAIGoogleGeminiSafetyThreshold.BlockNone,
  },
  {
    category: AxAIGoogleGeminiSafetyCategory.HarmCategoryDangerousContent,
    threshold: AxAIGoogleGeminiSafetyThreshold.BlockNone,
  },
]

/**
 * AxAIGoogleGemini: Default Model options for text generation
 */
export const axAIGoogleGeminiDefaultConfig = (): AxAIGoogleGeminiConfig =>
  structuredClone<AxAIGoogleGeminiConfig>({
    model: AxAIGoogleGeminiModel.Gemini15Flash,
    embedModel: AxAIGoogleGeminiEmbedModel.TextEmbedding004,
    safetySettings,
    ...axBaseAIDefaultConfig(),
  })

export const axAIGoogleGeminiDefaultCreativeConfig =
  (): AxAIGoogleGeminiConfig =>
    structuredClone<AxAIGoogleGeminiConfig>({
      model: AxAIGoogleGeminiModel.Gemini15Flash,
      embedModel: AxAIGoogleGeminiEmbedModel.TextEmbedding004,
      safetySettings,
      ...axBaseAIDefaultCreativeConfig(),
    })

export interface AxAIGoogleGeminiOptionsTools {
  codeExecution?: boolean
  googleSearchRetrieval?: {
    mode?: 'MODE_DYNAMIC'
    dynamicThreshold?: number
  }
  googleSearch?: boolean
  urlContext?: boolean
}

export interface AxAIGoogleGeminiArgs {
  name: 'google-gemini'
  apiKey?: string
  projectId?: string
  region?: string
  endpointId?: string
  config?: Readonly<Partial<AxAIGoogleGeminiConfig>>
  options?: Readonly<AxAIServiceOptions & AxAIGoogleGeminiOptionsTools>
  models?: AxAIInputModelList<AxAIGoogleGeminiModel, AxAIGoogleGeminiEmbedModel>
  modelInfo?: AxModelInfo[]
}

const toJSONSchemaType = (type: PRIMITIVES) => {
  switch (type) {
    case 'string':
    case 'code':
    case 'date':
    case 'datetime':
    case 'enum':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'json':
      return 'object'
    case 'image':
    case 'audio':
    case 'video':
      // Media types aren't directly representable in JSON schema value types,
      // often handled as strings (URIs/base64) or complex objects.
      // We'll treat them as string for schema purposes here.
      return 'string'
    default:
      return 'string'
  }
}
const toJSONSchema = (
  fields: readonly AxField[],
  sig?: Readonly<AxSignature>
): AxFunctionJSONSchema => {
  const properties: Record<string, AxFunctionJSONSchema> = {}
  const required: Array<string> = []

  for (const f of fields) {
    if (f.isInternal) {
      continue
    }

    const fieldSchema: AxFunctionJSONSchema = {
      description: f.fieldDescription,
    }

    if (f.isArray) {
      fieldSchema.type = 'array'
      let items: AxFunctionJSONSchema | undefined
      if (f.type === 'json' && 'schema' in f && f.schema) {
        items = toJSONSchema(f.schema)
      } else if (f.type === 'enum' && 'enumValueSet' in f) {
        if (f.enumValueSet.type === 'literal') {
          items = { type: 'string', enum: f.enumValueSet.values }
        } else {
          // Algebraic enum
          items = {
            oneOf: f.enumValueSet.values.map((v) => ({
              type: toJSONSchemaType(v),
            })),
          }
        }
      } else {
        items = { type: toJSONSchemaType(f.type) }
        if (f.type === 'datetime') {
          items.format = 'date-time'
        }
      }
      fieldSchema.items = items
    } else if (f.type === 'json' && 'schema' in f && f.schema) {
      const nestedSchema = toJSONSchema(f.schema)
      fieldSchema.type = 'object'
      fieldSchema.properties = nestedSchema.properties
      fieldSchema.required = nestedSchema.required
    } else if (f.type === 'enum' && 'enumValueSet' in f) {
      if (f.enumValueSet.type === 'literal') {
        fieldSchema.type = 'string'
        fieldSchema.enum = f.enumValueSet.values
      } else {
        // Algebraic enum: use oneOf
        const { description } = fieldSchema
        const oneOfSchema: AxFunctionJSONSchema = {
          description,
          oneOf: f.enumValueSet.values.map((v) => ({
            type: toJSONSchemaType(v),
            description: `Value of type ${v}`,
          })),
        }
        Object.assign(fieldSchema, oneOfSchema)
      }
    } else {
      fieldSchema.type = toJSONSchemaType(f.type)
      if (f.type === 'datetime') {
        fieldSchema.format = 'date-time'
      }
    }

    properties[f.name] = fieldSchema

    if (!f.isOptional) {
      required.push(f.name)
    }
  }

  const schema: AxFunctionJSONSchema = {
    type: 'object',
    properties: properties,
    required: required,
    description: sig?.getDescription(),
  }

  return schema
}

class AxAIGoogleGeminiImpl
  implements
  AxAIServiceImpl<
    AxAIGoogleGeminiModel,
    AxAIGoogleGeminiEmbedModel,
    AxAIGoogleGeminiChatRequest,
    AxAIGoogleGeminiBatchEmbedRequest | AxAIGoogleVertexBatchEmbedRequest,
    AxAIGoogleGeminiChatResponse,
    AxAIGoogleGeminiChatResponseDelta,
    AxAIGoogleGeminiBatchEmbedResponse | AxAIGoogleVertexBatchEmbedResponse
  > {
  private tokensUsed: AxTokenUsage | undefined
  private signature?: AxSignature

  constructor(
    private config: AxAIGoogleGeminiConfig,
    private isVertex: boolean,
    private endpointId?: string,
    private apiKey?: string,
    private options?: AxAIGoogleGeminiArgs['options']
  ) {
    if (!this.isVertex && this.config.autoTruncate) {
      throw new Error('Auto truncate is not supported for GoogleGemini')
    }
  }

  getTokenUsage(): AxTokenUsage | undefined {
    return this.tokensUsed
  }

  getModelConfig(): AxModelConfig {
    const { config } = this
    return {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      presencePenalty: config.presencePenalty,
      frequencyPenalty: config.frequencyPenalty,
      stopSequences: config.stopSequences,
      endSequences: config.endSequences,
      stream: config.stream,
      n: config.n,
    } as AxModelConfig
  }

  createChatReq = (
    req: Readonly<AxInternalChatRequest<AxAIGoogleGeminiModel>>,
    config: Readonly<AxAIPromptConfig>
  ): [AxAPI, AxAIGoogleGeminiChatRequest] => {
    const model = req.model
    const stream = req.modelConfig?.stream ?? this.config.stream
    this.signature = req.signature

    const reqValue = (
      Array.isArray(req.chatPrompt) && req.chatPrompt.length === 1
        ? req.chatPrompt[0]
        : req.chatPrompt
    ) as AxAIGoogleGeminiChatRequest

    if (
      !reqValue ||
      !('contents' in reqValue) ||
      reqValue.contents.length === 0
    ) {
      throw new Error('Chat prompt is empty or invalid')
    }

    let apiConfig
    if (this.endpointId) {
      apiConfig = {
        name: stream
          ? `/${this.endpointId}:streamGenerateContent?alt=sse`
          : `/${this.endpointId}:generateContent`,
      }
    } else {
      apiConfig = {
        name: stream
          ? `/models/${model}:streamGenerateContent?alt=sse`
          : `/models/${model}:generateContent`,
      }
    }

    if (!this.isVertex) {
      const pf = stream ? '&' : '?'
      apiConfig.name += `${pf}key=${this.apiKey}`
    }

    // We still need to merge the dynamic/runtime config with the base config
    const generationConfig: AxAIGoogleGeminiGenerationConfig = {
      ...(reqValue.generationConfig ?? {}),
      maxOutputTokens: req.modelConfig?.maxTokens ?? this.config.maxTokens,
      temperature: req.modelConfig?.temperature ?? this.config.temperature,
      topP: req.modelConfig?.topP ?? this.config.topP,
      topK: req.modelConfig?.topK ?? this.config.topK,
      frequencyPenalty:
        req.modelConfig?.frequencyPenalty ?? this.config.frequencyPenalty,
      stopSequences:
        req.modelConfig?.stopSequences ?? this.config.stopSequences,
    }

    // Set response schema for structured output if applicable
    const outputFields = this.signature?.getOutputFields() ?? []
    const hasVisibleOutput = outputFields.some((f) => !f.isInternal)

    if (hasVisibleOutput) {
      generationConfig.responseMimeType = 'application/json'
      generationConfig.responseSchema = toJSONSchema(
        outputFields,
        this.signature
      )
    }

    // Handle thinking budget overrides
    const thinkingConfig: AxAIGoogleGeminiGenerationConfig['thinkingConfig'] = {
      ...(generationConfig.thinkingConfig ?? {}),
    }

    if (config.thinkingTokenBudget) {
      switch (config.thinkingTokenBudget) {
        case 'none':
          thinkingConfig.thinkingBudget = 0
          break
        case 'minimal':
          thinkingConfig.thinkingBudget = 200
          break
        case 'low':
          thinkingConfig.thinkingBudget = 800
          break
        case 'medium':
          thinkingConfig.thinkingBudget = 5000
          break
        case 'high':
          thinkingConfig.thinkingBudget = 10000
          break
        case 'highest':
          thinkingConfig.thinkingBudget = 24500
          break
      }
    }

    if (config.showThoughts !== undefined) {
      thinkingConfig.includeThoughts = config.showThoughts
    }

    if (Object.keys(thinkingConfig).length > 0) {
      generationConfig.thinkingConfig = thinkingConfig
    }

    // Final request to be sent
    const finalReqValue: AxAIGoogleGeminiChatRequest = {
      ...reqValue,
      generationConfig,
    }

    return [apiConfig, finalReqValue]
  }

  createEmbedReq = (
    req: Readonly<AxInternalEmbedRequest<AxAIGoogleGeminiEmbedModel>>
  ): [
      AxAPI,
      AxAIGoogleGeminiBatchEmbedRequest | AxAIGoogleVertexBatchEmbedRequest,
    ] => {
    const model = req.embedModel

    if (!model) {
      throw new Error('Embed model not set')
    }

    if (!req.texts || req.texts.length === 0) {
      throw new Error('Embed texts is empty')
    }

    let apiConfig
    let reqValue:
      | AxAIGoogleGeminiBatchEmbedRequest
      | AxAIGoogleVertexBatchEmbedRequest

    if (this.isVertex) {
      if (this.endpointId) {
        apiConfig = {
          name: `/${this.endpointId}:predict`,
        }
      } else {
        apiConfig = {
          name: `/models/${model}:predict`,
        }
      }

      reqValue = {
        instances: req.texts.map((text) => ({
          content: text,
          ...(this.config.embedType && { taskType: this.config.embedType }),
        })),
        parameters: {
          autoTruncate: this.config.autoTruncate,
          outputDimensionality: this.config.dimensions,
        },
      }
    } else {
      apiConfig = {
        name: `/models/${model}:batchEmbedContents?key=${this.apiKey}`,
      }

      reqValue = {
        requests: req.texts.map((text) => ({
          model: 'models/' + model,
          content: { parts: [{ text }] },
          outputDimensionality: this.config.dimensions,
          ...(this.config.embedType && { taskType: this.config.embedType }),
        })),
      }
    }

    return [apiConfig, reqValue]
  }

  createChatResp = (
    resp: Readonly<AxAIGoogleGeminiChatResponse>
  ): AxChatResponse => {
    const results: AxChatResponseResult[] =
      resp.candidates?.map((candidate) => {
        const result: AxChatResponseResult = {}

        switch (candidate.finishReason) {
          case 'MAX_TOKENS':
            result.finishReason = 'length'
            break
          case 'STOP':
            result.finishReason = 'stop'
            break
          case 'SAFETY':
            throw new Error('Finish reason: SAFETY')
          case 'RECITATION':
            throw new Error('Finish reason: RECITATION')
          case 'MALFORMED_FUNCTION_CALL':
            throw new Error('Finish reason: MALFORMED_FUNCTION_CALL')
        }

        if (!candidate.content || !candidate.content.parts) {
          return result
        }

        for (const part of candidate.content.parts) {
          if ('text' in part) {
            // Check if this is a structured JSON response
            const outputFields = this.signature?.getOutputFields() ?? []
            if (
              outputFields.length > 0 &&
              resp.candidates[0]?.content.parts[0]?.text
            ) {
              try {
                // If the text is valid JSON, we assume it's the structured output
                JSON.parse(resp.candidates[0].content.parts[0].text)
                // Since it's a structured response, the whole text is the content.
                // It will be parsed later by `extractValues`.
                result.content = resp.candidates[0].content.parts[0].text
                break // exit the loop
              } catch (e) {
                // Not a JSON response, proceed as normal text
              }
            }

            if ('thought' in part && part.thought) {
              result.thought = part.text
            } else {
              result.content = part.text
            }
            continue
          }
          if ('functionCall' in part) {
            // Handle the `final_answer` tool case
            if (part.functionCall.name === 'final_answer') {
              result.content = JSON.stringify(part.functionCall.args)
            } else {
              result.functionCalls = [
                {
                  id: part.functionCall.name,
                  type: 'function',
                  function: {
                    name: part.functionCall.name,
                    params: part.functionCall.args,
                  },
                },
              ]
            }
          }
        }
        return result
      }) ?? []

    if (resp.usageMetadata) {
      this.tokensUsed = {
        totalTokens: resp.usageMetadata.totalTokenCount,
        promptTokens: resp.usageMetadata.promptTokenCount,
        completionTokens: resp.usageMetadata.candidatesTokenCount,
        thoughtsTokens: resp.usageMetadata.thoughtsTokenCount,
      }
    }
    return { results }
  }

  createChatStreamResp = (
    resp: Readonly<AxAIGoogleGeminiChatResponseDelta>
  ): AxChatResponse => {
    return this.createChatResp(resp)
  }

  createEmbedResp = (
    resp: Readonly<
      AxAIGoogleGeminiBatchEmbedResponse | AxAIGoogleVertexBatchEmbedResponse
    >
  ): AxEmbedResponse => {
    let embeddings: number[][]
    if (this.isVertex) {
      embeddings = (
        resp as AxAIGoogleVertexBatchEmbedResponse
      ).predictions.map((prediction) => prediction.embeddings.values)
    } else {
      embeddings = (
        resp as AxAIGoogleGeminiBatchEmbedResponse
      ).embeddings.map((embedding) => embedding.values)
    }

    return {
      embeddings,
    }
  }
}

/**
 * AxAIGoogleGemini: AI Service
 */
export class AxAIGoogleGemini extends AxBaseAI<
  AxAIGoogleGeminiModel,
  AxAIGoogleGeminiEmbedModel,
  AxAIGoogleGeminiChatRequest,
  AxAIGoogleGeminiBatchEmbedRequest | AxAIGoogleVertexBatchEmbedRequest,
  AxAIGoogleGeminiChatResponse,
  AxAIGoogleGeminiChatResponseDelta,
  AxAIGoogleGeminiBatchEmbedResponse | AxAIGoogleVertexBatchEmbedResponse
> {
  constructor({
    apiKey,
    projectId,
    region,
    endpointId,
    config,
    options,
    models,
    modelInfo,
  }: Readonly<Omit<AxAIGoogleGeminiArgs, 'name'>>) {
    const isVertex = projectId !== undefined && region !== undefined

    let apiURL
    let headers

    if (isVertex) {
      let path
      if (endpointId) {
        path = 'endpoints'
      } else {
        path = 'publishers/google'
      }

      apiURL = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/${path}`
      if (apiKey) {
        headers = async () => ({ Authorization: `Bearer ${apiKey}` })
      } else {
        const vertexAuth = new GoogleVertexAuth()
        headers = async () => ({
          Authorization: `Bearer ${await vertexAuth.getAccessToken()}`,
        })
      }
    } else {
      if (!apiKey) {
        throw new Error('GoogleGemini AI API key not set')
      }
      apiURL = 'https://generativelanguage.googleapis.com/v1beta'
      headers = async () => ({})
    }

    const _config = {
      ...axAIGoogleGeminiDefaultConfig(),
      ...config,
    }

    const aiImpl = new AxAIGoogleGeminiImpl(
      _config,
      isVertex,
      endpointId,
      apiKey,
      options
    )

    const resolvedModelInfo = [
      ...axModelInfoGoogleGemini,
      ...(modelInfo ?? []),
    ]

    const supportFor = (model: AxAIGoogleGeminiModel) => {
      const mi = getModelInfo<
        AxAIGoogleGeminiModel,
        AxAIGoogleGeminiEmbedModel
      >({
        model,
        modelInfo: resolvedModelInfo,
        models,
      })
      return {
        functions: true,
        streaming: true,
        json: true,
        hasThinkingBudget: mi?.hasThinkingBudget ?? false,
        hasShowThoughts: mi?.hasShowThoughts ?? false,
        functionCot: false,
      }
    }

    super(aiImpl, {
      name: 'GoogleGeminiAI',
      apiURL,
      headers,
      modelInfo: resolvedModelInfo,
      defaults: {
        model: _config.model as AxAIGoogleGeminiModel,
        embedModel: _config.embedModel as AxAIGoogleGeminiEmbedModel,
      },
      options,
      supportFor,
      models,
    })
  }
}