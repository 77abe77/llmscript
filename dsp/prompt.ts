import type {
  AxAIGoogleGeminiChatRequest,
  AxAIGoogleGeminiContent,
  AxAIGoogleGeminiContentPart,
} from '../ai/google-gemini/types.js'
import type { AxFunction } from '../ai/types.js'

import { formatDateWithTimezone } from './datetime.js'
import { type AxField, type AxSignature } from './sig.js'
import type {
  AxFileData,
  AxFieldValue,
  AxGenIn,
  AxGenOut,
  AxInlineData,
  AxMessage,
} from './types.js'
import { validateValue } from './util.js'

// Define options type for AxPromptTemplate constructor
export interface AxPromptTemplateOptions {
  functions?: Readonly<AxFunction[]>
  thoughtFieldName?: string
}

const functionCallInstructions = `
## Function Call Instructions
- Complete the task, using the functions defined earlier in this prompt. 
- Call functions step-by-step, using the output of one function as input to the next.
- Use the function results to generate the output fields.`

function xmlEscape(str: string): string {
  if (typeof str !== 'string') {
    return ''
  }
  // Do not escape '<' and '>' for xpath tags, but escape other special XML characters.
  return str
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
}

function fieldToXMLDef(field: AxField<any>): string {
  const attrs = [
    `type="${field.type}"`,
    field.isArray ? 'isArray="true"' : '',
    field.fieldDescription
      ? `description="${xmlEscape(field.fieldDescription)}"`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (field.type === 'json' && 'schema' in field && field.schema) {
    const children = field.schema.map(fieldToXMLDef).join('\n    ')
    return `<${field.name} ${attrs}>\n    ${children}\n</${field.name}>`
  }
  if (field.type === 'enum' && 'enumValueSet' in field && field.enumValueSet) {
    const values = field.enumValueSet.values.join(',')
    return `<${field.name} ${attrs} enumType="${field.enumValueSet.type}" enumValues="${xmlEscape(values)}" />`
  }
  return `<${field.name} ${attrs} />`
}

export class AxPromptTemplate {
  private sig: Readonly<AxSignature>
  private readonly functions?: Readonly<AxFunction[]>

  constructor(
    sig: Readonly<AxSignature>,
    options?: Readonly<AxPromptTemplateOptions>
  ) {
    this.sig = sig
    this.functions = options?.functions
  }

  public render = <T extends AxGenIn>(
    values: T | ReadonlyArray<AxMessage>,
    {
      examples,
      demos,
      scope,
    }: Readonly<{
      examples?: Record<string, AxFieldValue>[]
      demos?: Record<string, AxFieldValue>[]
      scope?: Readonly<
        Map<string, { field: AxField<any>; value: AxFieldValue }>
      >
    }>
  ): AxAIGoogleGeminiChatRequest => {
    // System Prompt Construction
    const systemTask = []
    const ins = this.sig.getInputFields()
    const scopeIns = scope ? Array.from(scope.values()).map((v) => v.field) : []
    const allIns = [...scopeIns, ...ins]

    const outArgs = renderDescFields(this.sig.getOutputFields())
    const desc = this.sig.getDescription()

    systemTask.push(
      `## Core Instruction
${allIns.length > 0 ? `You will be provided with the following inputs: ${renderDescFields(allIns)}. ` : ''}Your core task is to ${desc ? `fulfill the #main-task-description using the resources available${outArgs.length > 0 ? ' and' : '.'}` : ''}${this.sig.getOutputFields().length > 0 ? ` generate the following outputs: ${outArgs}.` : ''}`
    )

    if (allIns.length > 0) {
      const inputDefs = allIns.map(fieldToXMLDef).join('\n')
      systemTask.push(`## Input Definitions\n${inputDefs}`)
    }

    if (allIns.length > 0) {
      systemTask.push(
        `## Input Referencing Guide
All inputs and their nested properties can be referenced anywhere in this program using XML's XPath language. The inline format looks like <ref xpath="//path/to/variable" />.`
      )
    }

    if (desc) {
      const text = formatDescription(desc)
      systemTask.push(`## Main Task Description\n${text}`)
    }

    if (this.functions && this.functions.length > 0) {
      const funcList = this.functions
        .map((fn) => `- \`${fn.name}\`: ${formatDescription(fn.description)}`)
        .join('\n')
      systemTask.push(`## Available Functions\n${funcList}`)
      systemTask.push(functionCallInstructions.trim())
    }

    const systemInstruction: AxAIGoogleGeminiContent = {
      role: 'user' as const, // Gemini uses 'user' role for system instructions
      parts: [{ text: systemTask.join('\n\n') }],
    }

    // Contents Construction
    const contents: AxAIGoogleGeminiContent[] = []

    // Demos & Examples
    contents.push(...this.renderDemosAndExamples(demos, examples))

    if (Array.isArray(values)) {
      // Handle AxMessage array history
      for (const message of values) {
        if (message.role === 'user') {
          contents.push({
            role: 'user',
            parts: this.renderInputValues(message.values),
          })
        } else if (message.role === 'assistant') {
          const assistantParts = this.renderOutputValues(message.values)
          contents.push({ role: 'model', parts: assistantParts as any }) // Gemini expects 'model' role
        }
      }
    } else {
      // This is a single, final input from the user
      const userParts: AxAIGoogleGeminiContentPart[] = []

      const introPart = { text: '## Inputs\n' }

      // Signature Input Values
      const inputParts = this.renderInputValues(values)

      // Scope (supplementary) Input Values
      const scopeParts: AxAIGoogleGeminiContentPart[] = []
      if (scope && scope.size > 0) {
        for (const { field, value } of scope.values()) {
          scopeParts.push(...this.valueToParts(field, value))
        }
      }

      const allUserParts = [introPart, ...scopeParts, ...inputParts]

      userParts.push(...this.mergeConsecutiveTextParts(allUserParts))

      contents.push({ role: 'user', parts: userParts })
    }

    return {
      systemInstruction,
      contents,
    }
  }

  private renderDemosAndExamples(
    demos?: Record<string, AxFieldValue>[],
    examples?: Record<string, AxFieldValue>[]
  ): AxAIGoogleGeminiContent[] {
    const turns: AxAIGoogleGeminiContent[] = []
    const allExamples = [...(demos ?? []), ...(examples ?? [])]

    if (allExamples.length > 0) {
      // Acknowledge examples
      turns.push({
        role: 'user',
        parts: [{ text: 'Here are some examples to follow.' }],
      })
      turns.push({
        role: 'model',
        parts: [
          { text: 'Okay, I will use these examples as a guide for my responses.' },
        ],
      })
    }

    for (const item of allExamples) {
      const userContent = this.renderInputValues(item as AxGenIn)
      const assistantContent = this.renderOutputValues(item as AxGenOut)

      turns.push({ role: 'user', parts: userContent })
      turns.push({ role: 'model', parts: assistantContent as any })
    }
    return turns
  }

  private renderInputValues = (
    values: AxGenIn
  ): AxAIGoogleGeminiContentPart[] => {
    const allParts = this.sig
      .getInputFields()
      .flatMap((field) => this.valueToParts(field, values[field.name]))
    return this.mergeConsecutiveTextParts(allParts)
  }

  private renderOutputValues = (
    values: AxGenOut
  ): AxAIGoogleGeminiContentPart[] => {
    const allParts = this.sig
      .getOutputFields()
      .flatMap((field) => this.valueToParts(field, values[field.name]))
    return this.mergeConsecutiveTextParts(allParts)
  }

  private valueToParts = (
    field: Readonly<AxField>,
    value: AxFieldValue
  ): AxAIGoogleGeminiContentPart[] => {
    if (isEmptyValue(field, value)) {
      return []
    }
    validateValue(field, value)

    const parts: AxAIGoogleGeminiContentPart[] = []
    parts.push({ text: `<${field.name}>` })

    // This new function will handle rendering the value without adding more XML tags,
    // but it will extract media parts.
    const renderFieldValue = (val: AxFieldValue): AxAIGoogleGeminiContentPart[] => {
      // It's a media part
      if (
        val &&
        typeof val === 'object' &&
        'mimeType' in val &&
        ('data' in val || 'fileUri' in val)
      ) {
        const media = val as AxInlineData | AxFileData
        return 'data' in media
          ? [{ inlineData: { mimeType: media.mimeType, data: media.data } }]
          : [{ fileData: { mimeType: media.mimeType, fileUri: media.fileUri } }]
      }

      // It's an array of media parts (or other things)
      if (Array.isArray(val)) {
        return val.flatMap(renderFieldValue)
      }

      // For complex objects that might contain media, we need to stringify
      // them while extracting the media.
      if (typeof val === 'object' && val !== null) {
        let tempId = 0
        const placeholders: Record<string, AxAIGoogleGeminiContentPart[]> = {}

        // Custom replacer for JSON.stringify that replaces media with placeholders
        const replacer = (key: string, v: any) => {
          if (
            v &&
            typeof v === 'object' &&
            'mimeType' in v &&
            ('data' in v || 'fileUri' in v)
          ) {
            const placeholder = `__MEDIA_PLACEHOLDER_${tempId++}__`
            placeholders[placeholder] = renderFieldValue(v)
            return placeholder
          }
          return v
        }

        const jsonString = JSON.stringify(value, replacer, 2)

        // Split the stringified JSON by placeholders and interleave media
        const regex = /"__MEDIA_PLACEHOLDER_\d+__"/g
        const textSegments = jsonString.split(regex)
        const placeholderMatches = [...jsonString.matchAll(regex)]
        const resultParts: AxAIGoogleGeminiContentPart[] = []

        if (textSegments[0]) {
          resultParts.push({ text: textSegments[0] })
        }

        for (let i = 0; i < placeholderMatches.length; i++) {
          const placeholderWithQuotes = placeholderMatches[i]?.[0]
          if (placeholderWithQuotes) {
            const placeholderKey = placeholderWithQuotes.slice(1, -1) // remove quotes
            const mediaPart = placeholders[placeholderKey]
            if (mediaPart) {
              resultParts.push(...mediaPart)
            }
          }

          const nextTextSegment = textSegments[i + 1]
          if (nextTextSegment) {
            resultParts.push({ text: nextTextSegment })
          }
        }
        return resultParts
      }

      // For primitives
      const processedValue = processValue(field, val)
      return [{ text: xmlEscape(processedValue as string) }]
    }

    parts.push(...renderFieldValue(value))
    parts.push({ text: `</${field.name}>` })

    return parts
  }

  private mergeConsecutiveTextParts = (
    parts: AxAIGoogleGeminiContentPart[]
  ): AxAIGoogleGeminiContentPart[] => {
    if (parts.length < 2) {
      return parts
    }
    const merged: AxAIGoogleGeminiContentPart[] = []
    let lastPart = parts[0]
    if (lastPart) {
      merged.push(structuredClone(lastPart))
    }

    for (let i = 1; i < parts.length; i++) {
      const currentPart = parts[i]
      const lastMergedPart = merged[merged.length - 1]

      if (
        lastMergedPart &&
        currentPart &&
        'text' in lastMergedPart &&
        'text' in currentPart
      ) {
        lastMergedPart.text += currentPart.text
      } else if (currentPart) {
        merged.push(structuredClone(currentPart))
      }
    }
    return merged
  }
}

const renderDescFields = (list: readonly AxField[]) =>
  list.map((v) => `\`<${v.name}>\``).join(', ')

const processValue = (
  field: Readonly<AxField>,
  value: Readonly<AxFieldValue>
): AxFieldValue => {
  if (field.type === 'date' && value instanceof Date) {
    const v = value.toISOString()
    return v.slice(0, v.indexOf('T'))
  }
  if (field.type === 'datetime' && value instanceof Date) {
    return formatDateWithTimezone(value)
  }
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  return JSON.stringify(value, null, 2)
}

const isEmptyValue = (
  field: Readonly<AxField>,
  value?: Readonly<AxFieldValue>
) => {
  if (typeof value === 'boolean') {
    return false
  }

  if (
    value === null ||
    value === undefined ||
    ((Array.isArray(value) || typeof value === 'string') && value.length === 0)
  ) {
    if (field.isOptional || field.isInternal) {
      return true
    }
    throw new Error(`Value for required field '${field.name}' is missing.`)
  }
  return false
}

function formatDescription(str?: string) {
  if (!str) return ''
  const value = str.trim()
  return value.length > 0
    ? `${value.charAt(0).toUpperCase()}${value.slice(1)}${value.endsWith('.') ? '' : '.'}`
    : ''
}

export const toFieldType = (field: Readonly<AxField>): string => {
  const baseType = (() => {
    switch (field.type) {
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'date':
        return 'date ("YYYY-MM-DD" format)'
      case 'datetime':
        return 'date time ("YYYY-MM-DD HH:mm Timezone" format)'
      case 'json':
        return 'JSON object'
      case 'enum':
        if ('enumValueSet' in field && field.enumValueSet.type === 'literal') {
          return `classification class (allowed classes: ${field.enumValueSet.values.join(
            ', '
          )})`
        }
        return 'enum'
      case 'code':
        return 'code'
      case 'video':
        return 'video'
      case 'audio':
        return 'audio'
      case 'image':
        return 'image'
      default:
        return 'string'
    }
  })()

  return field.isArray ? `array of ${baseType} items` : baseType
}