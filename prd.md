# Goals and Rules
- Catering to google's gemini 2.5 Pro capabilities (disregard currents frameworks model agnostic structure)
    - multi modal parts api
    - structured output capabilities
    - function calling capabilities
- More descriptive LLM program's data contract (input output field definitions)
    - old framework lacked description for fixed structured json AxFields 
    - old framework lacked for dismicrimate data types and their collections
- An extension of AxProgram that allows for a new concept of user defined scope that can be dynamically defined/updated and referenced by the user via their input values. The updating and setting of scope happens outside of the Signature definition and prior to calling AxGen.forward
- A more robust and power referencing system based on xml
    - all inputs and outputs of the signature and dynamically added user inputs can be referenced
    Rules:
        - The program's signature description can reference any signature's input
        - The program's signature cant reference any user added input (scope) that gets inserted by the end user via the Program object
        - The program's outputs (via their AxField.description) can reference any of the signature's input
        - Any program signatures input that has `canRenferenceScope = true` is allowed to reference any user added scope inserted by the user via the Program object plus any inputs of the signature

    All inputs, outputs & dynamically user added inputs (scope) will be referenced via xml's xpath language: <xpath>//xpath/language/path</xpath>
    All inputs, outputs & dynamically user added inputs (scope) data type structure definitions will be described to the llm program prior to it seeing the values of the inputs or outputs
        the definition will be distinguished from the value by adding a schema attribute and setting it to true
            example:
                ```typescript
                let inputField: AxField = {
                  name: 'organization',
                  type: 'json',
                  schema: [
                    {
                        name: 'description',
                        description: 'gives an overview of the organization'
                        type: 'string'
                    },
                    {
                        name: 'marketingFunnels',
                        type: 'json',
                        isArray: true,
                        schema: [
                            {
                                name: 'description',
                                description: "description of the marketing funnel's goal",
                                type: 'string',
                            }
                        ]
                    }
                  ]
                }
                ```
            definition will become:
            <organization definition=true>
                <description type="string" fieldDescription="gives an overview of the organization"/>
                <marketingFunnels isArray=true>
                    <description type="string" fieldDescription="description of the marketing funnel's goal" />
                </marketingFunnels>
            </organization>
            and its value will become:
            <organization>
                {
                    description: "just a descriptions",
                    marketingFunnels: [
                        {
                            description: "d1 for the first"
                        },
                        {
                            description: "d2 for the second"
                        },
                    ]
                }
            </organization>

                
        the programs signature's inputs and outputs definitions will be described in the system instruction of the llm
        the user defined scope definition and values will be specified in a designated slot of the llms api structure:
            if the llm program's `demos` and `examples` are not part of the system instruction, then they will occupy the first array slot of the api's content field, which means the users scope definitions and values will occupy the second slot of the api's content array.
            if `demos` and `examples` ARE part of the system instruction, then the user's scope definition and values will be specified in the first array slot of the api's content field

## Data Type Revisions
```typescript
// Supported Image MIME Types
export type AxImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

// Supported Audio MIME Types
export type AxAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/aiff'
  | 'audio/aac'
  | 'audio/ogg'
  | 'audio/flac'

// Supported Video MIME Types
export type AxVideoMimeType =
  | 'video/mp4'
  | 'video/mpeg'
  | 'video/mov'
  | 'video/avi'
  | 'video/x-flv'
  | 'video/mpg'
  | 'video/webm'
  | 'video/wmv'
  | 'video/3gpp'

// Supported PDF MIME Type
export type AxPdfMimeType = 'application/pdf'

export type AxMediaMimeType =
  | AxImageMimeType
  | AxAudioMimeType
  | AxVideoMimeType
  | AxPdfMimeType

export type AxFileData = {
  mimeType: AxMediaMimeType
  fileUri: string
}

// base64-encoded
export type AxInlineData = {
  mimeType: AxMediaMimeType
  data: string
}

export type AxFieldValue =
  | string
  | number
  | boolean
  | object
  | null
  | AxFileData
  | AxInlineData
  | AxFieldValue[]    
```


```typescript
export type PRIMITIVES =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'image'
  | 'audio'
  | 'date'
  | 'datetime'
  | 'enum' // Renamed from 'class'
  | 'code'
  | 'video' // Added

// Describes the set of allowed values for an 'enum' type field.
export type ENUM_SET =
  | {
    type: 'literal'
    values: string[]
  }
  | {
    type: 'algebraic'
    values: PRIMITIVES[]
  }

// Base properties common to all AxField variants
interface AxFieldBase<T extends PRIMITIVES> {
  type: T
  name: string // This key is the de facto reference name
  fieldDescription?: string // Optional but highly recommended
  isArray?: boolean
  isOptional?: boolean
  isInternal?: boolean
}

export type AxField<T extends PRIMITIVES> = AxFieldBase<T> & 
    (T extends 'string') ? { canReferenceScope?: boolean } : {} & // Crucial for validating references and scope within user input. this can only be used for input data fields, should be completly ignored for output fields
    (T extends 'enum') ? { enumValueSet: ENUM_SET } : {} & // Crucial extension of the old `class` to enable the ability to group a discrimitive set of types into an array. the order of the array does matter.
    (T extends 'json') ? { schema?: AxField[] : {} // Crucial for providing the LLM program with a far more descriptive description of fixed structure input/output. Not all json types will be fixed structured so thats why schema is optional. however when you dont have schema defined its highly recommended to define the axfield's top level `description` field. when schema is defined, it is highly unnessary to define the top-level `description`. the order of the schema array doesnt matter much as its defining the fields/keys of the structure

```



## AxPromptTemplate Details (ax/dsp/prompt.ts)

Here is the expectabed changes and order of the AxPromptTemplate

### system instructions (prompt.ts calls this the this.task { type: string, text: string }):
    [keep i/o directive (i/o intents)]
        `You will be provided with the following fields: ${inArgs}. Your task is to generate new fields: ${outArgs}.`     
        if inputs or user scope exists:
            [add a detailed guide on inputs and outputs should be referenced using xpath (see more in goals & rules section above)]

    if inputs:
        insert new input field definitions xml format as referenced in #Goals & Rules section

    [keep the signature description (Task description)]

    if output:
        insert new output field definitions xml format as referenced in #Goals & Rules section

    if functions:
        with a functions directive
        available functions

    if scope exists when creating the program:
        we insert the scope directive that informs the llm that the first content slot (scope slot) is reserved for the scope


    [remove formattingRules]
        dont need (output field expectations for strucutred output llms)


### reserved slots for new user input scope
 (follow rules in Goals & Rules section)

 In this slot first list all the definitions then immediatly follow it with the values



## AxProgramWithSignature Details (ax/dsp/program.ts)
    [new]
    function updateScope(field: AxField, value?: AxFieldValue)
        - value == null means remove
        - checks unique key (field.name)

    [modify]
    function forward
        validates string inputs that `canReferenceScope` that all references resolve to current programs scope


## Ax Usage Transformation

The first example below is what a signature and program looked liked before this change:

```typescript
// File: backend/src/llm_programs/scriptCreatorProgram.ts
import { AxSignature, AxGen } from '@ax-llm/ax';

// Define JSON structure descriptions for LLM
const llmGestureJsonStructure = `{"id": "string (Argil gesture slug, e.g., 'gesture-1')", "description": "string (User's textual description of the gesture - for LLM context only)"}`;
const llmVideoStyleJsonStructure = `{"id": "string (Argil Avatar ID)", "description": "string (User's description of the camera video style/avatar scene - for LLM context only)", "gestures": [${llmGestureJsonStructure}]}`;
const llmCreatorAgentJsonStructure = `{"name": "string", "role": "string", "tone": "string", "personality": "string", "voice": {"id": "string (ElevenLabs voice ID)"}, "videoStyles": [${llmVideoStyleJsonStructure}]}`;
const llmMarketingFunnelJsonStructure = `{"description": "string (Description of the marketing funnel's goal)"}`;

const llmOrganizationContextJsonStructure = `{
    "description": "string (Optional: Organization's overall description)",
    "marketingFunnels": [${llmMarketingFunnelJsonStructure}],
    "creatorAgents": [${llmCreatorAgentJsonStructure}]
}`;

const llmScriptJsonStructure = `{
    "author": "string (Name of the CreatorAgent)",
    "title": "string",
    "description": "string (Optional: Video platform description)",
    "marketingGoals": [{"marketingFunnelDescription": "string", "reasoning": "string (Optional)"}],
    "moments": [{
        "transcript": "string",
        "notes": "string (Optional: LLM notes for editor)",
        "agentVideo": {
            "videoStyleId": "string (Argil Avatar ID from organizationContext)",
            "gestureSlug": "string (Argil gesture slug from chosen videoStyle)",
            "sizeStyle": "string (Enum: FULL, HALF, PILL, Optional)",
            "position": "string (Enum: CENTER, BOTTOM_LEFT, etc., Optional)"
        } (Optional)
    }]
}`;


const scriptCreatorSignature = new AxSignature();
scriptCreatorSignature.setDescription(
  "Based on the organizationContext and the user's instruction, generate an appropriate amount of short-form video content scripts. " +
  "Ensure that each script serves at least one of the marketing funnel goals defined in the organization's context. " +
  "You may generate as many scripts as you want, but ensure each script provides unique value to the organization's marketing goals. " +
  "You have different variables to play with, such as who is the speaker (author) of the content, choosing which agent creator's voice and personality best fits the content. " +
  "You must generate at least 1 script. " +
  "The transcript you provide for each moment will be fed into text-to-speech models, so generate the transcripts as you would phonetically pronounce the words. " +
  "For each moment's agentVideo, you MUST select a videoStyleId (which is an Argil Avatar ID) from the provided organization_context.creatorAgents.videoStyles.id. " +
  "Similarly, for each moment's agentVideo, you MUST select a gestureSlug (which is an Argil gesture slug) from the chosen videoStyle's gestures.id. " +
  `The agentVideo.sizeStyle can be ${Object.values(LLMAgentVideoSizeStyle).join(', ')}. The agentVideo.position can be ${Object.values(LLMAgentVideoPosition).join(', ')}. ` +
  "Interpret the image_references as visual cues or content inspiration for the scripts. " +
  `The output must be an array of JSON objects, where each object strictly follows this structure: ${llmScriptJsonStructure}`
);

scriptCreatorSignature.addInputField({
  name: 'organizationContext',
  description: `JSON object containing details about the organization, its marketing funnels, and creator agents with their video styles and gestures. It must follow this structure: ${llmOrganizationContextJsonStructure}`,
  type: {
    name: 'json',
    isArray: false,
  }
});

scriptCreatorSignature.addInputField({
  name: 'userInstruction',
  description: 'Text instruction from the user about the desired content.',
  type: { name: 'string', isArray: false }
});

scriptCreatorSignature.addOutputField({
    name: 'generatedScripts',
    description: `An array of generated video scripts. Each script in the array must be a JSON object strictly adhering to the following structure: ${llmScriptJsonStructure}`,
    type: {
        name: 'json',
        isArray: true,
    }
});

export const scriptCreatorProgram = new AxChainOfThought(scriptCreatorSignature);

```

The next example shows the more robust usage implementation. another perk of this is that now the UI can richly display asset linkage to the user, which is often ambigious and the user hopes the llm actually understands what its referencing

```typescript
// File: backend/src/llm_programs/scriptCreatorProgram.ts
import { AxSignature, AxGen } from '@ax-llm/ax';

const scriptCreatorSignature = new AxSignature();

scriptCreatorSignature.addInputField({
  name: 'organization',
  type: 'json',
  schema: [
    {
        name: 'description',
        fieldDescription: 'gives an overview of organization'
        type: 'string'
    },
    {
        name: 'marketingFunnels',
        type: 'json',
        isArray: true,
        schema: [
            {
                name: 'description',
                fieldDescription: "Description of the marketing funnel's goal",
                type: 'string',
            }
        ]
    },
    {
        name: 'creatorAgents',
        type: 'json',
        isArray: true,
        schema: [
            {
                name: "name",
                fieldDescription: "full name of the agent",
                type: "string"
            },
            {
                name: "role",
                fieldDescription: "the agents role at the organization",
                type: "string"
            },
            {
                name: "tone",
                fieldDescription: "a description of the agents voice tone",
                type: "string"
            },
            {
                name: "personality",
                fieldDescription: "a description of the agents personality",
                type: "string"
            },
            {
                name: "voice",
                type: "json",
                schema: [
                    {
                        name: "id",
                        fieldDescription: "Elevenlab's voice ID",
                        type: "string"
                    }
                ]
            },
            {
                name: "videoStyles",
                type: "json",
                isArray: true,
                schema: [
                    {
                        name: "id",
                        fieldDescription: "Argil Avatar ID",
                        type: 'string'
                    },
                    {
                        name: "description",
                        fieldDescription: "description of the camera video style/avatar scene - for LLM context only",
                        type: 'string'
                    },
                    {
                        name: "gestures",
                        type: 'json',
                        isArray: true,
                        schema: [
                            {
                                name: "id",
                                fieldDescription: "Argil gesture slug, e.g., 'gesture-1",
                                type: "string"
                            },
                            {
                                name: "description",
                                fieldDescription: "textual description of the gesture - for LLM context only",
                                type: "string"
                            },
                        ]
                    },
                ]
            }
        ]

    },

  ]

});

scriptCreatorSignature.addInputField({
  name: 'userInstruction',
  description: 'Text instruction from the user about the desired content.',
  type: 'string',
  canReferenceScope: true
});

scriptCreatorSignature.setDescription(
  "Based on the <xpath>/organization</xpath> and the <xpath>userInstruction</xpath> generate an appropriate amount of short-form video content scripts. " +
  "Ensure that each script serves at least one of the <xpath>/organization/marketingFunnels</xpath>" +
  "You may generate as many scripts as you want, but ensure each script provides unique value" +
  "You have different variables to play with, such as who is the speaker (author) of the content, choosing which agent creator's voice and personality best fits the content. " +
  "You must generate at least 1 script. "
);


scriptCreatorSignature.addOutputField({
    name: 'generatedScripts',
    type: 'json',
    isArray: true,
    schema: [
        {
            name: "author",
            fieldDescription: "Full name of the CreatorAgent",
            type: "string"
        },
        {
            name: "title",
            fieldDescription: "script title",
            type: "string"
        },
        {
            name: "description",
            fieldDescription: "description for the video platform",
            type: "string"
        },
        {
            name: "marketingGoals",
            type: "json",
            isArray: true,
            schema: [
                {
                    name: "marketingFunnelDescription",
                    type: "string"
                },
                {
                    name: "reasoning",
                    fieldDescription: "the LLMs reasoning for why this script serves the choosen marketing funnel",
                    type: "string"
                }
            ]
        },
        {
            name: "moments",
            type: "json",
            isArray: true,
            schema: [
                {
                    name: "transcript",
                    fieldDescription: "the moments spoken text",
                    type: "string",
                },
                {
                    name: "notes",
                    fieldDescription: "notes that the LLM has regarding how a person should edit this moment such as suggested broll prompts, animations or transitions",
                    type: "string",
                    isOptional: true
                },
                {
                    name: "agentVideo",
                    type: "json",
                    schema: [
                        {
                            name: "videoStyleId",
                            fieldDescription: "the Argil Avatar ID selected from one of <xpath>/organization/creatorAgents/videoStyles/id</xpath>",
                            type: "string"
                        },
                        {
                            name: "gestureSlug",
                            fieldDescription: "the Argil gesture-slug belonging to the chosen <xpath>/organization/creatorAgents/videoStyles/id</xpath> selected from one of <xpath>/organization/creatorAgents/videoStyles/gestures/id</xpath> ",
                            type: "string"
                        },
                        {
                            name: "sizeStyle",
                            fieldDescription: "the suggested size of the generated avatar video when exported to the video editor",
                            type: "enum",
                            enumValueSet: {
                                type: "literal",
                                values: ["FULL, HALF, PILL"]
                            },
                            isOptional: true
                        },
                        {
                            name: "position",
                            description: "the suggested position of the generated avatar video when exported to the video editor",
                            type: "enum",
                            enumValueSet: {
                                type: "literal",
                                values: ["CENTER", "BOTTOM_LEFT", "BOTTOM_RIGHT", "TOP_LEFT", "TOP_RIGHT"]
                            },
                            isOptional: true
                        },
                    ]
                },
            ]
        }
    ]
});

export const scriptCreatorProgram = new AxGen(scriptCreatorSignature);
```

## Gemini API Details

### Config & Tools
if program has output(s) defined & no functions:
    simply enabled structured output with output data definitions

if program has output(s) defined & functions:
    enable structured output but structure it where the llm knows that its either gonna output a function to call, and update the chat history accordinly or it will output the programs defined output and the program will terminate

if no ouput & no function:
    noop (this cant or shouldnt happen)

if program has no ouput(s) defined and functions:
    disable the structured output on the api and just use the llms native funciton calling feature

### Core Payload
In this change we shall focus on the gemini 2.5 pro module. There shall be no concerns over the models capabilities and we shall not worry about whether other llm backends end up breaking with this change

Google gemini pro model allows for multimodal inputs to be interleaved via the parts array

```json
{
  "contents": [                    // array, one turn per speaker
    {
      "role": "user",              // "user" | "model" (optional for 1-shot)
      "parts": [                   // ordered sequence → interleave freely
        { "text": "Image A – overcast bay:" },

        {                          // image by reference
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://my-bucket/bay.jpg"
          }
        },

        { "text": "Image B – afternoon skyline:" },

        {                          // same idea with inline base64
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "BASE64_STRING"
          }
        },

        { "text": "Compare the cloud patterns and lighting." }
      ]
      /* Optional per-part metadata (only when the part is a video):
      "metadata": {
        "videoMetadata": {
          "startOffset": { "seconds": 60 },
          "endOffset":   { "seconds": 70 }
        }
      } */
    }
  ],

  /* Optional */
  "generationConfig": { "temperature": 0.4, "maxOutputTokens": 1024 },
  "safetySettings":   [ ... ],
  "tools":            [ ... ]
}
```

In this change we need the backend's raw gemini chat request to enclose any input and added scope (only the values not the type) with xml tags. the name of the xml tags do come from the AxField inputFields in the signature

As an example the following:
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Image1: A landscape"
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://bucket/landscape.jpg"
          }
        },
        {
          "text": "Image2: A cityscape"
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://bucket/cityscape.jpg"
          }
        },
        {
          "text": "Compare Image1 and Image2."
        }
      ]
    }
  ]
}
```

will be converted to:
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "<Image1>"
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://bucket/landscape.jpg"
          }
        },
        {
          "text": "</Image1>"
        },
        {
          "text": "<Image2>"
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://bucket/cityscape.jpg"
          }
        },
        {
          "text": "</Image2>"
        },
        ... (later on)
        {
          "text": "Compare <Image1> and <Image2>."
        }
      ]
    }
  ]
}
```

Everything thing else can remain as little changed as to not break any streaming or parsing logic, but if this requirement does break anything you MUST come up with a solution that keeps the same quality of features before this change.

IMPORTANT: please only generate full files to only modified files you make. I do not want any diff files. thank you.

