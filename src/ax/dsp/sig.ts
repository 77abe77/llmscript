import { createHash } from 'crypto'

import type { AxFunctionJSONSchema } from '../ai/types.js'

export type PRIMITIVES =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'image'
  | 'audio'
  | 'video'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'code'

export type ENUM_SET =
  | {
    type: 'literal'
    values: string[]
  }
  | {
    type: 'algebraic'
    values: PRIMITIVES[]
  }

interface AxFieldBase<T extends PRIMITIVES> {
  type: T
  name: string
  fieldDescription?: string
  isArray?: boolean
  isOptional?: boolean
  isInternal?: boolean
}

export type AxField<T extends PRIMITIVES = PRIMITIVES> = AxFieldBase<T> &
  (T extends 'string' ? { canReferenceScope?: boolean } : object) &
  (T extends 'enum' ? { enumValueSet: ENUM_SET } : object) &
  (T extends 'json' ? { schema?: AxField<any>[] } : object)


export class AxSignature {
  private description?: string
  private inputFields: AxField[]
  private outputFields: AxField[]

  private sigHash: string
  private sigString: string

  constructor(signature?: Readonly<AxSignature>) {
    if (!signature) {
      this.inputFields = []
      this.outputFields = []
      this.sigHash = ''
      this.sigString = ''
      return
    }

    if (signature instanceof AxSignature) {
      this.description = signature.getDescription()
      this.inputFields = structuredClone(
        signature.getInputFields()
      ) as AxField[]
      this.outputFields = structuredClone(
        signature.getOutputFields()
      ) as AxField[]
      this.sigHash = signature.hash()
      this.sigString = signature.toString()
    } else {
      throw new Error('invalid signature argument: ' + signature)
    }
  }

  public setDescription = (desc: string) => {
    this.description = desc
    this.updateHash()
  }

  public addInputField = (field: Readonly<AxField<any>>) => {
    this.inputFields.push(field)
    this.updateHash()
  }

  public addOutputField = (field: Readonly<AxField<any>>) => {
    this.outputFields.push(field)
    this.updateHash()
  }

  public setInputFields = (fields: AxField<any>[]) => {
    this.inputFields = fields
    this.updateHash()
  }

  public setOutputFields = (fields: AxField<any>[]) => {
    this.outputFields = fields
    this.updateHash()
  }

  public getInputFields = (): Readonly<AxField[]> => this.inputFields
  public getOutputFields = (): Readonly<AxField[]> => this.outputFields
  public getDescription = () => this.description

  public toJSONSchema = (): AxFunctionJSONSchema => {
    const properties: Record<string, unknown> = {}
    const required: Array<string> = []

    for (const f of this.inputFields) {
      const type = f.type ? f.type : 'string'
      if (f.isArray) {
        properties[f.name] = {
          description: f.fieldDescription,
          type: 'array' as const,
          items:
            type === 'json' && 'schema' in f && f.schema
              ? this.nestedToJSONSchema(f.schema)
              : {
                type: type,
                description: f.fieldDescription,
              },
        }
      } else if (type === 'json' && 'schema' in f && f.schema) {
        properties[f.name] = this.nestedToJSONSchema(f.schema)
        properties[f.name].description = f.fieldDescription
      } else {
        properties[f.name] = {
          description: f.fieldDescription,
          type: type,
        }
      }

      if (!f.isOptional) {
        required.push(f.name)
      }
    }

    const schema = {
      type: 'object',
      properties: properties,
      required: required,
    }

    return schema as AxFunctionJSONSchema
  }

  private nestedToJSONSchema(fields: readonly AxField<any>[]) {
    const properties: Record<string, unknown> = {}
    const required: Array<string> = []

    for (const f of fields) {
      const type = f.type ? f.type : 'string'
      if (f.isArray) {
        properties[f.name] = {
          description: f.fieldDescription,
          type: 'array' as const,
          items:
            type === 'json' && 'schema' in f && f.schema
              ? this.nestedToJSONSchema(f.schema)
              : { type },
        }
      } else if (type === 'json' && 'schema' in f && f.schema) {
        properties[f.name] = this.nestedToJSONSchema(f.schema)
      } else {
        properties[f.name] = {
          description: f.fieldDescription,
          type,
        }
      }

      if (!f.isOptional) {
        required.push(f.name)
      }
    }

    return { type: 'object', properties, required }
  }

  private updateHash = (): [string, string] => {
    this.getInputFields().forEach((field) => {
      validateField(field)
    })
    this.getOutputFields().forEach((field) => {
      validateField(field)
      if (field.type === 'image') {
        throw new Error('Image type is not supported in output fields.')
      }
    })

    this.sigHash = createHash('sha256')
      .update(this.description ?? '')
      .update(JSON.stringify(this.inputFields))
      .update(JSON.stringify(this.outputFields))
      .digest('hex')

    this.sigString = renderSignature(
      this.description,
      this.inputFields,
      this.outputFields
    )

    return [this.sigHash, this.sigString]
  }

  public hash = () => this.sigHash

  public toString = () => this.sigString

  public toJSON = () => {
    return {
      id: this.hash(),
      description: this.description,
      inputFields: this.inputFields,
      outputFields: this.outputFields,
    }
  }
}

function renderField(field: Readonly<AxField>): string {
  let result = field.name
  if (field.isOptional) {
    result += '?'
  }
  if (field.type) {
    result += ':' + field.type
    if (field.isArray) {
      result += '[]'
    }
  }
  // Check if description exists and append it.
  if (field.fieldDescription) {
    result += ` "${field.fieldDescription}"`
  }
  return result
}

function renderSignature(
  description: string | undefined,
  inputFields: readonly AxField[],
  outputFields: readonly AxField[]
): string {
  // Prepare the description part of the signature.
  const descriptionPart = description ? `"${description}"` : ''

  // Render each input field into a comma-separated list.
  const inputFieldsRendered = inputFields.map(renderField).join(', ')

  // Render each output field into a comma-separated list.
  const outputFieldsRendered = outputFields.map(renderField).join(', ')

  // Combine all parts into the final signature.
  return `${descriptionPart} ${inputFieldsRendered} -> ${outputFieldsRendered}`
}

function isValidCase(inputString: string): boolean {
  const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/
  const snakeCaseRegex = /^[a-z]+(_[a-z0-9]+)*$/

  return camelCaseRegex.test(inputString) || snakeCaseRegex.test(inputString)
}

function validateField(field: Readonly<AxField>): void {
  if (!field.name || field.name.length === 0) {
    throw new Error('Field name cannot be blank')
  }

  if (!isValidCase(field.name)) {
    throw new Error(
      `Invalid field name '${field.name}', it must be camel case or snake case: `
    )
  }

  if (
    [
      'text',
      'object',
      'image',
      'string',
      'number',
      'boolean',
      'json',
      'array',
      'datetime',
      'date',
      'time',
      'type',
      'class',
      'video',
      'audio',
      'enum',
      'code',
    ].includes(field.name)
  ) {
    throw new Error(
      `Invalid field name '${field.name}', please make it more descriptive (eg. companyDescription)`
    )
  }
}