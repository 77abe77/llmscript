import { type AxProgramForwardOptions } from '../dsp/program.js'
import { AxStringUtil } from '../dsp/strutil.js'
import {
  type AxAIService,
  AxGen,
  type AxGenOptions,
  AxSignature,
} from '../index.js'

import { AxChainOfThought } from './cot.js'

export class AxRAG extends AxChainOfThought<
  { context: string[]; question: string },
  { answer: string }
> {
  private genQuery: AxGen<
    { context: string[]; question: string },
    { query: string }
  >
  private queryFn: (query: string) => Promise<string>
  private maxHops: number

  constructor(
    queryFn: (query: string) => Promise<string>,
    options: Readonly<AxGenOptions & { maxHops?: number }>
  ) {
    const sig = new AxSignature()
    sig.setDescription('Answer questions with short factoid answers.')
    sig.addInputField({
      name: 'context',
      type: 'string',
      isArray: true,
      fieldDescription: 'may contain relevant facts',
    })
    sig.addInputField({ name: 'question', type: 'string' })
    sig.addOutputField({ name: 'answer', type: 'string' })

    super(sig, options)

    this.maxHops = options?.maxHops ?? 3

    const qsig = new AxSignature()
    qsig.setDescription(
      'Write a simple search query that will help answer a complex question.'
    )
    qsig.addInputField({
      name: 'context',
      type: 'string',
      isArray: true,
      isOptional: true,
      fieldDescription: 'may contain relevant facts',
    })
    qsig.addInputField({ name: 'question', type: 'string' })
    qsig.addOutputField({
      name: 'query',
      type: 'string',
      fieldDescription: 'question to further our understanding',
    })

    this.genQuery = new AxGen<
      { context: string[]; question: string },
      { query: string }
    >(qsig)
    this.queryFn = queryFn
    this.register(this.genQuery)
  }

  public override async forward(
    ai: Readonly<AxAIService>,
    { question }: Readonly<{ question: string }>,
    options?: Readonly<AxProgramForwardOptions>
  ): Promise<{ answer: string }> {
    let context: string[] = []

    for (let i = 0; i < this.maxHops; i++) {
      const { query } = await this.genQuery.forward(
        ai,
        {
          context,
          question,
        },
        options
      )
      const val = await this.queryFn(query)
      context = AxStringUtil.dedup([...context, val])
    }

    return super.forward(ai, { context, question }, options)
  }
}