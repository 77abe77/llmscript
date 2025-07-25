/* eslint-disable @typescript-eslint/naming-convention */

import { parseLLMFriendlyDate, parseLLMFriendlyDateTime } from './datetime.js'
import type { AxField, AxSignature } from './sig.js'
import { matchesContent, parseMarkdownList } from './util.js'
import { ValidationError } from './validate.js'

export const extractValues = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  content: string
) => {
  const xstate = { extractedFields: [], streamedIndex: {}, s: -1 }
  streamingExtractValues(sig, values, xstate, content)
  extractFinalValue(sig, values, xstate, content)
}

export interface extractionState {
  prevFields?: { field: AxField; s: number; e: number }[]
  currField?: AxField
  currFieldIndex?: number
  extractedFields: AxField[]
  streamedIndex: Record<string, number>
  s: number
  inBlock?: boolean
}

// Helper function to check for missing required fields up to a certain index
const checkMissingRequiredFields = (
  xstate: Readonly<extractionState>,
  values: Record<string, unknown>,
  currentIndex: number
) => {
  const missingFields: AxField[] = []

  // Check all fields up to the current index
  for (let i = 0; i < currentIndex; i++) {
    const field = xstate.extractedFields[i]
    if (field && !field.isOptional && values[field.name] === undefined) {
      missingFields.push(field)
    }
  }

  if (missingFields.length > 0) {
    throw new ValidationError({
      message: `Required ${missingFields.length === 1 ? 'field' : 'fields'} not found`,
      fields: missingFields,
    })
  }
}

// Helper function to check for all missing required fields
const checkAllRequiredFields = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>
) => {
  const missingFields = sig
    .getOutputFields()
    .filter((field) => !field.isOptional && values[field.name] === undefined)

  if (missingFields.length > 0) {
    throw new ValidationError({
      message: `Required ${missingFields.length === 1 ? 'field' : 'fields'} not found in final output`,
      fields: missingFields,
    })
  }
}

export const streamingExtractValues = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  content: string,
  streamingValidation: boolean = false
) => {
  // If the content looks like it's a JSON stream, do nothing and wait for more content.
  // The final parsing will be handled by extractFinalValue.
  if (content.trim().startsWith('{')) {
    return true
  }

  // Fallback to text/XML-based parsing if the stream does not look like JSON.
  const fields = sig.getOutputFields()

  for (const [index, field] of fields.entries()) {
    if (field.name in values) {
      continue
    }

    const isFirst = xstate.extractedFields.length === 0
    // Use the XML tag as the prefix, not the old "FieldName:" format
    const prefix = (isFirst ? '' : '\n') + `<${field.name}>`
    let e = matchesContent(content, prefix, xstate.s)

    switch (e) {
      case -1:
        if (streamingValidation && values.length == 0 && !field.isOptional) {
          throw new ValidationError({
            message: 'Required field not found',
            fields: [field],
          })
        }
        continue // Field is not found, continue to the next field
      case -2:
        return true // Partial match at end, skip and gather more content
      case -3:
        return true // String is only whitespace, skip and gather more content
      case -4:
        xstate.inBlock = true
        return true // String is only backticks, skip and gather more content
    }
    // We found the next field!!!

    let prefixLen = prefix.length

    // Lets wrap up the last field which is still the current field
    if (xstate.currField) {
      const endTag = `</${xstate.currField.name}>`
      const val = content
        .substring(xstate.s, e)
        .replace(new RegExp(`${endTag}$`), '')
        .trim()
      const parsedValue = validateAndParseFieldValue(xstate.currField, val)
      if (parsedValue !== undefined) {
        values[xstate.currField.name] = parsedValue
      }
      if (xstate.prevFields) {
        xstate.prevFields?.push({ field: xstate.currField, s: xstate.s, e })
      } else {
        xstate.prevFields = [{ field: xstate.currField, s: xstate.s, e }]
      }
    }

    checkMissingRequiredFields(xstate, values, index)

    // Lets update the state for the new current field

    xstate.s = e + prefixLen
    xstate.currField = field
    xstate.currFieldIndex = index

    if (!xstate.extractedFields.includes(field)) {
      xstate.extractedFields.push(field)
    }

    if (xstate.streamedIndex[field.name] === undefined) {
      xstate.streamedIndex[field.name] = 0
    }
  }
}

export const extractFinalValue = (
  sig: Readonly<AxSignature>,
  values: Record<string, unknown>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState,
  content: string
) => {
  // Try to parse the entire content as a single JSON object first.
  // This is the primary path for Gemini's JSON mode.
  try {
    const trimmedContent = content.trim()
    // A simple check to see if it looks like a JSON object
    if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
      const parsed = JSON.parse(trimmedContent)
      // Overwrite existing (partially streamed) values with the final, complete ones.
      Object.assign(values, parsed)
      // Ensure all required fields are present in the final JSON.
      checkAllRequiredFields(sig, values)
      return
    }
  } catch (e) {
    // It's not a valid JSON object, so fall through to the text-based extraction below.
  }

  // Fallback for text-based streaming (e.g., XML format)
  if (xstate.currField) {
    const endTag = `</${xstate.currField.name}>`
    let val = content
      .substring(xstate.s)
      .replace(new RegExp(`${endTag}$`), '')
      .trim()

    const parsedValue = validateAndParseFieldValue(xstate.currField, val)
    if (parsedValue !== undefined) {
      values[xstate.currField.name] = parsedValue
    }
  }

  // Perform a final check of all required fields for the text-based path.
  checkAllRequiredFields(sig, values)
}

const convertValueToType = (
  field: Readonly<AxField>,
  val: string,
  required: boolean = false
) => {
  switch (field.type) {
    case 'code':
      return extractBlock(val)

    case 'string':
      return val

    case 'number': {
      const v = Number(val)
      if (Number.isNaN(v)) {
        if (field.isOptional && !required) {
          return
        }
        throw new Error('Invalid number')
      }
      return v
    }

    case 'boolean': {
      if (typeof val === 'boolean') {
        return val
      }
      const v = val.toLowerCase()
      if (v === 'true') {
        return true
      } else if (v === 'false') {
        return false
      } else {
        if (field.isOptional && !required) {
          return
        }
        throw new Error('Invalid boolean')
      }
    }
    case 'date':
      return parseLLMFriendlyDate(field, val, required)

    case 'datetime':
      return parseLLMFriendlyDateTime(field, val, required)

    case 'enum':
      const className = val
      if (
        'enumValueSet' in field &&
        field.enumValueSet.type === 'literal' &&
        !field.enumValueSet.values.includes(className)
      ) {
        if (field.isOptional) {
          return
        }
        throw new Error(
          `Invalid class '${val}', expected one of the following: ${field.enumValueSet.values.join(
            ', '
          )}`
        )
      }
      return className as string

    default:
      return val as string // Unknown type
  }
}

export function* yieldDelta<OUT>(
  content: string,
  field: Readonly<AxField>,
  s: number,
  e: number,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState
) {
  const { name: fieldName, isInternal } = field
  const { isArray: fieldIsArray, type: fieldTypeName } = field

  if (
    isInternal ||
    fieldIsArray ||
    (fieldTypeName && fieldTypeName !== 'string' && fieldTypeName !== 'code')
  ) {
    return
  }

  const pos = xstate.streamedIndex[fieldName] ?? 0
  const isFirstChunk = pos === 0

  const d1 = content.substring(s + pos, e)
  if (d1.length === 0) {
    return
  }

  // Remove trailing whitespace, tabs, and newlines
  let d2 = d1.replace(/\s+$/, '')

  // If this field is a "code" type, remove trailing backticks
  if (xstate.currField?.type === 'code') {
    d2 = d2.replace(/\s*```\s*$/, '')
  }

  // Only trim start for the first chunk
  let d3 = isFirstChunk ? d2.trimStart() : d2

  if (xstate.currField?.type === 'code') {
    // Remove any leading triple-backtick fences (with optional language specifier)
    d3 = d3.replace(/^[ ]*```[a-zA-Z0-9]*\n\s*/, '')
  }

  if (d3.length > 0) {
    yield { [fieldName]: d3 } as Partial<OUT>
    xstate.streamedIndex[fieldName] = pos + d2.length
  }
}

export function* streamValues<OUT>(
  sig: Readonly<AxSignature>,
  content: string,
  values: Readonly<Record<string, OUT>>,
  // eslint-disable-next-line functional/prefer-immutable-types
  xstate: extractionState
) {
  // If the content looks like JSON, we expect the `values` object to be populated
  // at the end. We can then yield a single large delta.
  const trimmedContent = content.trim()
  if (trimmedContent.startsWith('{')) {
    if (Object.keys(values).length > 0) {
      // Check if this is the first time we're yielding this JSON object.
      if (!xstate.streamedIndex['__json_yielded']) {
        yield values as Partial<OUT>
        xstate.streamedIndex['__json_yielded'] = 1
      }
    }
    return
  }

  // Fallback to text/XML based delta streaming
  for (const prevField of xstate.prevFields ?? []) {
    const { field, s, e } = prevField
    yield* yieldDelta<OUT>(content, field, s, e, xstate)
  }
  xstate.prevFields = undefined

  if (!xstate.currField || xstate.currField.isInternal) {
    return
  }

  yield* yieldDelta<OUT>(
    content,
    xstate.currField,
    xstate.s,
    content.length,
    xstate
  )

  const outputFields = sig.getOutputFields()

  for (const key of Object.keys(values)) {
    const field = outputFields.find((f) => f.name === key)
    if (!field || field.isInternal) {
      continue
    }

    const value = values[key]

    if (Array.isArray(value)) {
      const s = xstate.streamedIndex?.[key] ?? 0
      const v = value.slice(s)
      if (v && v.length > 0) {
        yield { [key]: v } as Partial<OUT>
        xstate.streamedIndex[key] = s + v.length
      }
      continue
    }

    if (!xstate.streamedIndex[key]) {
      yield { [key]: value } as Partial<OUT>
      xstate.streamedIndex[key] = 1
    }
  }
}

function validateAndParseFieldValue(
  field: Readonly<AxField>,
  fieldValue: string | undefined
): unknown {
  if (
    !fieldValue ||
    fieldValue === '' ||
    /^(null|undefined)\s*$/i.test(fieldValue)
  ) {
    if (field.isOptional) {
      return
    }
    throw new ValidationError({
      message: 'Required field is missing',
      fields: [field],
      value: fieldValue,
    })
  }

  let value: unknown | undefined

  if (field.type === 'json') {
    try {
      const text = extractBlock(fieldValue)
      value = JSON.parse(text)
      return value
    } catch (e) {
      throw new ValidationError({
        message: 'Invalid JSON: ' + (e as Error).message,
        fields: [field],
        value: fieldValue,
      })
    }
  }

  if (field.isArray) {
    try {
      try {
        value = JSON.parse(fieldValue)
      } catch {
        // If JSON parsing fails, try markdown parsing
        value = parseMarkdownList(fieldValue)
      }
      if (!Array.isArray(value)) {
        throw new Error('Expected an array')
      }
    } catch (e) {
      throw new ValidationError({
        message: 'Invalid Array: ' + (e as Error).message,
        fields: [field],
        value: fieldValue,
      })
    }
  }

  try {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (item !== undefined) {
          const v = typeof item === 'string' ? item.trim() : item
          value[index] = convertValueToType(field, v, true)
        }
      }
    } else {
      value = convertValueToType(field, fieldValue)
    }
  } catch (e) {
    throw new ValidationError({
      message: (e as Error).message,
      fields: [field],
      value: fieldValue,
    })
  }

  if (typeof value === 'string' && value === '') {
    return undefined
  }

  return value
}

export const extractBlock = (input: string): string => {
  const markdownBlockPattern = /```([A-Za-z]*)\n([\s\S]*?)\n```/g
  const match = markdownBlockPattern.exec(input)
  if (!match) {
    return input
  }
  if (match.length === 3) {
    return match[2] as string
  }
  if (match.length === 2) {
    return match[1] as string
  }
  return input
}