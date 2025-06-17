#!/usr/bin/env bun

/**
 * This script is designed to test the programmatic creation of signatures
 * with `AxProgramWithSignature` and demonstrates how to handle streaming
 * responses from the Google Gemini API.
 *
 * It uses a real API key from environment variables to send a request
 * and processes the streaming output delta by delta.
 */

import {
    AxAIGoogleGemini,
    AxGen,
    AxSignature,
    mergeDeltas,
    type AxField,
    type AxGenOut,
} from '@ax-llm/ax'

// Helper function to reconstruct the final object from streaming deltas.
// It's imported from the library, but shown here for clarity.
/*
function mergeDeltas<OUT extends AxGenOut>(
  base: Partial<AxGenOut>,
  delta: Partial<AxGenOut>
): OUT {
  for (const key of Object.keys(delta)) {
    const baseValue = base[key];
    const deltaValue = delta[key];

    if (baseValue === undefined && Array.isArray(deltaValue)) {
      base[key] = [...deltaValue];
    } else if (Array.isArray(baseValue) && Array.isArray(deltaValue)) {
      base[key] = [...(baseValue ?? []), ...deltaValue];
    } else if (
      (baseValue === undefined || typeof baseValue === 'string') &&
      typeof deltaValue === 'string'
    ) {
      base[key] = (baseValue ?? '') + deltaValue;
    } else {
      base[key] = deltaValue;
    }
  }
  return base as OUT;
}
*/

async function main() {
    // 1. Setup the AI Service with a real API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBFlsTmUDPA-fXDVYHbZIgJnvgYxekQa3I'
    if (!apiKey) {
        throw new Error(
            'GEMINI_API_KEY environment variable not set. Please provide your API key.'
        )
    }

    const ai = new AxAIGoogleGemini({
        apiKey: apiKey,
    })

    // 2. Define a signature programmatically using the new AxSignature class
    const scriptCreatorSignature = new AxSignature()

    scriptCreatorSignature.addInputField({
        name: 'organization',
        // CHANGE: 'description' is now 'fieldDescription' for AxField
        fieldDescription: `JSON object containing details about the organization, its marketing funnels, and creator agents with their video styles and gestures`,
        type: 'json',
        schema: [
            {
                name: 'description',
                fieldDescription: 'gives an overview of organization',
                type: 'string',
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
                    },
                ],
            },
            {
                name: 'creatorAgents',
                type: 'json',
                isArray: true,
                schema: [
                    {
                        name: 'name',
                        fieldDescription: 'full name of the agent',
                        type: 'string',
                    },
                    {
                        name: 'role',
                        fieldDescription: 'the agents role at the organization',
                        type: 'string',
                    },
                    {
                        name: 'tone',
                        fieldDescription: 'a description of the agents voice tone',
                        type: 'string',
                    },
                    {
                        name: 'personality',
                        fieldDescription: 'a description of the agents personality',
                        type: 'string',
                    },
                    {
                        name: 'voice',
                        type: 'json',
                        schema: [
                            {
                                name: 'id',
                                fieldDescription: "Elevenlab's voice ID",
                                type: 'string',
                            },
                        ],
                    },
                    {
                        name: 'videoStyles',
                        type: 'json',
                        isArray: true,
                        schema: [
                            {
                                name: 'id',
                                fieldDescription: 'Argil Avatar ID',
                                type: 'string',
                            },
                            {
                                name: 'description',
                                fieldDescription:
                                    'description of the camera video style/avatar scene - for LLM context only',
                                type: 'string',
                            },
                            {
                                name: 'gestures',
                                type: 'json',
                                isArray: true,
                                schema: [
                                    {
                                        name: 'id',
                                        fieldDescription: "Argil gesture slug, e.g., 'gesture-1",
                                        type: 'string',
                                    },
                                    {
                                        name: 'description',
                                        fieldDescription:
                                            'textual description of the gesture - for LLM context only',
                                        type: 'string',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    })

    scriptCreatorSignature.addInputField({
        name: 'userInstruction',
        fieldDescription: 'Text instruction from the user about the desired content.',
        type: 'string',
        canReferenceScope: true,
    })

    // CHANGE: References now use the <xpath> tag format.
    scriptCreatorSignature.setDescription(
        'Based on the <xpath>//organization</xpath> and the <xpath>//userInstruction</xpath> generate an appropriate amount of short-form video content scripts. ' +
        'Ensure that each script serves at least one of the <xpath>//organization/marketingFunnels</xpath>. ' +
        'You may generate as many scripts as you want, but ensure each script provides unique value. ' +
        "You have different variables to play with, such as who is the speaker (author) of the content, choosing which agent creator's voice and personality best fits the content. " +
        'You must generate at least 1 script.'
    )

    scriptCreatorSignature.addOutputField({
        name: 'generatedScripts',
        type: 'json',
        isArray: true,
        schema: [
            {
                name: 'author',
                fieldDescription: 'Full name of the CreatorAgent',
                type: 'string',
            },
            {
                name: 'title',
                fieldDescription: 'script title',
                type: 'string',
            },
            {
                name: 'description',
                fieldDescription: 'description for the video platform',
                type: 'string',
            },
            {
                name: 'marketingGoals',
                type: 'json',
                isArray: true,
                schema: [
                    {
                        name: 'marketingFunnelDescription',
                        type: 'string',
                    },
                    {
                        name: 'reasoning',
                        fieldDescription:
                            'the LLMs reasoning for why this script serves the choosen marketing funnel',
                        type: 'string',
                    },
                ],
            },
            {
                name: 'moments',
                type: 'json',
                isArray: true,
                schema: [
                    {
                        name: 'transcript',
                        fieldDescription: "the moment's spoken text",
                        type: 'string',
                    },
                    {
                        name: 'notes',
                        fieldDescription:
                            'notes that the LLM has regarding how a person should edit this moment such as suggested broll prompts, animations or transitions',
                        type: 'string',
                        isOptional: true,
                    },
                    {
                        name: 'agentVideo',
                        type: 'json',
                        schema: [
                            {
                                name: 'videoStyleId',
                                // CHANGE: Corrected XPath reference syntax
                                fieldDescription:
                                    'the Argil Avatar ID selected from one of <xpath>//organization/creatorAgents/videoStyles/id</xpath>',
                                type: 'string',
                            },
                            {
                                name: 'gestureSlug',
                                fieldDescription:
                                    'the Argil gesture-slug belonging to the chosen <xpath>//videoStyleId</xpath> selected from one of <xpath>//organization/creatorAgents/videoStyles/gestures/id</xpath>',
                                type: 'string',
                            },
                            {
                                name: 'sizeStyle',
                                fieldDescription:
                                    'the suggested size of the generated avatar video when exported to the video editor',
                                type: 'enum',
                                // CHANGE: 'enumSet' is now 'enumValueSet'
                                enumValueSet: {
                                    type: 'literal',
                                    values: ['FULL', 'HALF', 'PILL'],
                                },
                                isOptional: true,
                            },
                            {
                                name: 'position',
                                fieldDescription:
                                    'the suggested position of the generated avatar video when exported to the video editor',
                                type: 'enum',
                                enumValueSet: {
                                    type: 'literal',
                                    values: [
                                        'CENTER',
                                        'BOTTOM_LEFT',
                                        'BOTTOM_RIGHT',
                                        'TOP_LEFT',
                                        'TOP_RIGHT',
                                    ],
                                },
                                isOptional: true,
                            },
                        ],
                    },
                ],
            },
        ],
    })

    // 3. Define input values for the program
    const input = {
        organization: {
            description: 'A test organization for creating content.',
            marketingFunnels: [{ description: 'Awareness' }],
            creatorAgents: [
                {
                    name: 'Test Agent',
                    role: 'Content Creator',
                    tone: 'Informative',
                    personality: 'Engaging',
                    voice: {
                        id: 'voice-123',
                    },
                    videoStyles: [
                        {
                            id: 'avatar-abc',
                            description: 'A cool video style',
                            gestures: [{ id: 'gesture-xyz', description: 'A wave' }],
                        },
                    ],
                },
            ],
        },
        // CHANGE: Updated userInstruction to reference the dynamic scope variable 'tweet'
        userInstruction: 'make a video script about this <xpath>//tweet</xpath>',
    }

    // 4. Instantiate the program and update its dynamic scope
    console.log(
        'Running program. The raw request payload will be logged below...'
    )

    const scriptCreatorProgram = new AxGen(scriptCreatorSignature)

    // CHANGE: The updateScope API now takes the field and value as separate arguments.
    const scopeField: AxField<'enum'> = {
        name: 'tweet',
        type: 'enum',
        isArray: true,
        enumValueSet: {
            type: 'algebraic',
            values: ['image', 'video', 'string'],
        },
    }

    // const scopeValue: AxFieldValue = [
    //     {
    //         mimeType: 'image/jpeg',
    //         fileUri: 'gs://bucket/landscape.jpg',
    //     },
    //     // You can add more items here, e.g., a video or text
    //     // { mimeType: 'video/mp4', fileUri: 'gs://bucket/another.mp4' },
    //     // "This is a text part of the tweet"
    // ]

    // scriptCreatorProgram.updateScope(scopeField, scopeValue)

    // 5. Run the program with streaming and handle the output.
    console.log('\nRunning program with streaming. Deltas will be logged below...');

    const stream = scriptCreatorProgram.streamingForward(ai, input);

    // Use a buffer to reconstruct the final object from the deltas
    let resultBuffer: Partial<AxGenOut> = {};
    let currentVersion = -1;

    for await (const { version, delta } of stream) {
        if (version !== currentVersion) {
            // A retry has occurred, reset the buffer
            if (currentVersion !== -1) {
                console.log(`\n--- Retry detected (version ${currentVersion} -> ${version}). Resetting buffer. ---\n`);
            }
            resultBuffer = {};
            currentVersion = version;
        }

        // Gemini JSON mode streams the full object at the end. For other models or
        // non-JSON-mode responses, you would see multiple smaller deltas.
        // This code handles both cases correctly.
        console.log('📦'); // Print a box for each delta received
        console.log(delta); // Print a box for each delta received

        // Merge the delta into our result buffer
        resultBuffer = mergeDeltas(resultBuffer, delta);
    }

    console.log('\n\n--- Stream Finished ---');
    console.log('\nFinal reconstructed result:');
    console.log(JSON.stringify(resultBuffer, null, 2));
}

main().catch(console.error)