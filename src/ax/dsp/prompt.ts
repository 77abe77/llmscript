import type { AxAIGoogleGeminiContentPart } from '../ai/google-gemini/types.js'
import type { AxChatRequest } from '../ai/types.js'

import { formatDateWithTimezone } from './datetime.js'
import type { AxInputFunctionType } from './functions.js'
import { type AxField, type AxIField, type AxSignature } from './sig.js'
import type {
  AxFileData,
  AxFieldValue,
  AxGenIn,
  AxGenOut,
  AxInlineData,
  AxMessage,
} from './types.js'
import { validateValue } from './util.js'

type Writeable<T> = { -readonly [P in keyof T]: T[P] }

// Define options type for AxPromptTemplate constructor
export interface AxPromptTemplateOptions {
  functions?: Readonly<AxInputFunctionType>
  thoughtFieldName?: string
}
type AxChatRequestChatPrompt = Writeable<AxChatRequest['chatPrompt'][0]>

type ChatRequestUserMessage = AxAIGoogleGeminiContentPart[]

const functionCallInstructions = `
## Function Call Instructions
- Complete the task, using the functions defined earlier in this prompt. 
- Call functions step-by-step, using the output of one function as input to the next.
- Use the function results to generate the output fields.`

export type AxFieldTemplateFn = (
  field: Readonly<AxField>,
  value: Readonly<AxFieldValue>
) => ChatRequestUserMessage

function xmlEscape(str: string): string {
  if (typeof str !== 'string') {
    return ''
  }
  return str.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '<'
      case '>':
        return '>'
      case '&':
        return '&'
      case '"':
        return '"'
      case "'":
        return "'"
      default:
        return c
    }
  })
}

function fieldToXMLDef(field: AxField<any>): string {
  const attrs = [
    `type="${field.type}"`,
    field.isArray ? 'isArray="true"' : '',
    field.fieldDescription
      ? `fieldDescription="${xmlEscape(field.fieldDescription)}"`
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
  private fieldTemplates?: Record<string, AxFieldTemplateFn>
  private readonly thoughtFieldName: string
  private readonly functions?: Readonly<AxInputFunctionType>

  constructor(
    sig: Readonly<AxSignature>,
    options?: Readonly<AxPromptTemplateOptions>,
    fieldTemplates?: Record<string, AxFieldTemplateFn>
  ) {
    this.sig = sig
    this.fieldTemplates = fieldTemplates
    this.thoughtFieldName = options?.thoughtFieldName ?? 'thought'
    this.functions = options?.functions
  }

  public renderExtraFields = (extraFields: readonly AxIField[]) => {
    const prompt: ChatRequestUserMessage = []

    if (!extraFields || extraFields.length === 0) {
      return prompt
    }

    const groupedFields = extraFields.reduce(
      (acc, field) => {
        const title = field.title
        if (!acc[title]) {
          acc[title] = []
        }
        acc[title].push(field)
        return acc
      },
      {} as Record<string, AxIField[]>
    )

    const formattedGroupedFields = Object.entries(groupedFields)
      .map(([title, fields]) => {
        if (fields.length === 1) {
          const field = fields[0]!
          return {
            ...field,
            description: field.fieldDescription,
          }
        } else if (fields.length > 1) {
          const valuesList = fields
            .map((field) => `- ${field.fieldDescription}`)
            .join('\n')
          return {
            ...fields[0]!,
            description: valuesList,
          }
        }
      })
      .filter(Boolean) as AxIField[]

    formattedGroupedFields.forEach((field) => {
      const value = field.description
      prompt.push(...this.valueToParts(field.name, value, field))
    })

    return prompt
  }

  public render = <T extends AxGenIn>(
    values: T | ReadonlyArray<AxMessage>,
    {
      examples,
      demos,
      scope,
    }: Readonly<{
      skipSystemPrompt?: boolean
      examples?: Record<string, AxFieldValue>[]
      demos?: Record<string, AxFieldValue>[]
      scope?: Readonly<
        Map<string, { field: AxField<any>; value: AxFieldValue }>
      >
    }>
  ): AxChatRequest['chatPrompt'] => {
    // System Prompt Construction
    const systemTask = []
    const ins = this.sig.getInputFields()
    const outs = this.sig.getOutputFields()
    const inArgs = renderDescFields(ins)
    const outArgs = renderDescFields(outs)
    const desc = this.sig.getDescription()
    systemTask.push(
      `## Core Instruction
${ins.length ? `You will be provided with the following inputs: ${inArgs}. ` : ''}Your core task is to ${desc ? `fullfill the #main-task-description using the resources available${outs.length ? ' and' : '.'}` : ''}${this.sig.getOutputFields().length ? `generate outputs: ${outArgs}.` : ''}`
    )

    if (scope && scope.size > 0) {
      systemTask.push(
        'The first user message part contains any supplementary input the user provides and extends this program with.'
      )
    }

    if (ins.length > 0) {
      const inputDefs = this.sig.getInputFields().map(fieldToXMLDef).join('\n')
      systemTask.push(
        `## Input Structure Definitions
${inputDefs}`
      )
    }

    if (ins.length > 0 || (scope && scope.size > 0)) {
      systemTask.push(
        `## Input Referencing Guide
All of the inputs and their nested properties can be referenced anywhere in this program using xml's xpath dsl. The inline format looks like <xpath ref="//xpath/path/here" />.
`
      )
    }

    if (desc) {
      const text = formatDescription(desc)
      systemTask.push(
        `## Main Task Description
${text}`)
    }

    // biome-ignore lint/complexity/useFlatMap: you cannot use flatMap here
    const funcs = this.functions
      ?.map((f) => ('toFunction' in f ? f.toFunction() : f))
      ?.flat()

    if (funcs && funcs.length > 0) {
      const funcList = funcs
        .map((fn) => `- \`${fn.name}\`: ${formatDescription(fn.description)}`)
        .join('\n')
      systemTask.push(`## Available Functions\n${funcList}`)
      systemTask.push(functionCallInstructions.trim())
    }



    const systemPrompt: AxChatRequestChatPrompt = {
      role: 'system' as const,
      content: systemTask.join('\n\n'),
    }

    // User/Assistant History Construction
    let history: AxChatRequestChatPrompt[] = []

    if (Array.isArray(values)) {
      // Handle AxMessage array history
      // This part needs to be implemented to render history correctly
    } else {
      const userParts: ChatRequestUserMessage = []

      // Demos & Examples
      const renderedDemos = demos ? this.renderDemos(demos) : []
      const renderedExamples = examples ? this.renderExamples(examples) : []

      userParts.push(...renderedDemos, ...renderedExamples)

      // User Extended Inputs
      if (scope && scope.size > 0) {
        const scopeDefs = []
        for (const { field } of scope.values()) {
          scopeDefs.push(fieldToXMLDef(field))
        }
        userParts.push({
          text:
            `## Supplementary User Input
### Definitions
${scopeDefs.join('\n')}
### Values
`})

        for (const { field, value } of scope.values()) {
          userParts.push(...this.valueToParts(field, value))
        }
      }

      // Input Values
      userParts.push({ text: '## Input Values' })
      userParts.push(...this.renderInputValues(values)) // TODO somehow we broke the intermidiate function calling history by assuming an AxGenIn here

      history.push({ role: 'user', content: userParts })
    }

    return [systemPrompt, ...history]
  }

  private valueToParts = (
    field: Readonly<AxField>,
    value: AxFieldValue,
  ): ChatRequestUserMessage => {
    const startTag = { text: `<${field.name}>` }
    const endTag = { text: `</${field.name}>` }

    switch (field.type) {
      case 'string':
      case 'boolean':
      case 'number':
      case 'date':
      case 'datetime':
      case 'code':
        // could be an array and it wont matter bc processValue will handle it
        return [{
          text:
            `<${field.name}>
${processValue(field, value)}
</${field.name}>`
        }]

      case 'json':
      // TODO You must go through the schema and deal with all the nested media parts seperately
      // essentially the final output will be { text: string } deliminated by { fileData: ... } or { inlineData: ... } but it all still be sandwiched by xml tags

      case 'video':
      case 'image':
      case 'audio':
        let mediaPart: AxAIGoogleGeminiContentPart
        let mediaValue = value as (AxFileData | AxInlineData)
        if ('data' in mediaPart) mediaPart = { inlineData: mediaValue as AxInlineData }
        else mediaPart = { fileData: mediaValue as AxFileData }
        return [startTag, mediaPart, endTag]

      case 'enum':
        const mediaTypes = new Set(['video', 'audio', 'image']);
        if ('enumValueSet' in field && field.enumValueSet.type === 'algebraic' && field.enumValueSet.values.some(v => mediaTypes.has(v))) {
          // TODO You must go through the schema and deal with all the nested media parts seperately
          // essentially the final output will be { text: string } deliminated by { fileData: ... } or { inlineData: ... } but it all still be sandwiched by xml tags
        }
        return [{
          text: `<${field.name}>
${processValue(field, value)}
</${field.name}`
        }]
    }
  }

  private renderDemos = (data: Readonly<Record<string, AxFieldValue>[]>) =>
    this.renderExamples(data, true)

  private renderExamples = (
    data: Readonly<Record<string, AxFieldValue>[]>,
    isDemo: boolean = false
  ) => {
    const chatHistory: ChatRequestUserMessage = []
    const context = { isExample: true }

    for (const item of data) {
      // Render user part
      const userParts: ChatRequestUserMessage = this.sig
        .getInputFields()
        .flatMap((field) =>
          this.renderInField(field, item, { ...context, isInputField: true })
        )

      // Render assistant part
      const assistantParts: ChatRequestUserMessage = this.sig
        .getOutputFields()
        .flatMap((field) =>
          this.renderInField(field, item, { ...context, isInputField: false })
        )
      // This is a simplification; demos should probably be rendered as full user/assistant turns
      chatHistory.push(...userParts, ...assistantParts)
    }
    return chatHistory
  }

  private renderInputValues = <T extends AxGenIn>(
    values: T
  ): ChatRequestUserMessage => {
    return this.sig
      .getInputFields()
      .flatMap((field) => this.renderInField(field, values, undefined))
  }

  private renderInField = (
    field: Readonly<AxField>,
    values: Readonly<Record<string, AxFieldValue>>,
    context?: {
      isExample?: boolean
      isInputField?: boolean
    }
  ): ChatRequestUserMessage => {
    const value = values[field.name]

    if (isEmptyValue(field, value, context)) {
      return []
    }

    if (field.type) {
      validateValue(field, value!)
    }

    return this.valueToParts(field.name, processedValue, field)
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
  return JSON.stringify(value, null, 2)
}

const isEmptyValue = (
  field: Readonly<AxField>,
  value?: Readonly<AxFieldValue>,
  context?: {
    isExample?: boolean
    isInputField?: boolean
  }
) => {
  if (typeof value === 'boolean') {
    return false
  }

  if (
    value === null ||
    value === undefined ||
    ((Array.isArray(value) || typeof value === 'string') && value.length === 0)
  ) {
    if (context?.isExample) {
      return true
    }

    if (field.isOptional || field.isInternal) {
      return true
    }

    const fieldType = context?.isInputField !== false ? 'input' : 'output'
    throw new Error(`Value for ${fieldType} field '${field.name}' is required.`)
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