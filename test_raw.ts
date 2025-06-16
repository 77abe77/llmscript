#!/usr/bin/env bun

/**
 * This script is designed to test the programmatic creation of signatures
 * with `AxProgramWithSignature` and inspect the raw request payload using
 * the `program.raw()` method before it would be sent to the Google Gemini API.
 *
 * It demonstrates how to get the request payload for token & cost estimation
 * without making any actual API calls. It also uses the `@ax-llm/ax` path alias.
 */

import {
    AxAIGoogleGemini,
    AxGen,
    AxSignature,
    type AxField,
    type AxFieldValue,
} from '@ax-llm/ax'

async function main() {
    // 1. Setup the AI Service. No real API key is needed as no call will be made.
    const ai = new AxAIGoogleGemini({
        apiKey: 'dummy-api-key-for-testing',
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

    const scopeValue: AxFieldValue = [
        {
            mimeType: 'image/jpeg',
            fileUri: 'gs://bucket/landscape.jpg',
        },
        // You can add more items here, e.g., a video or text
        // { mimeType: 'video/mp4', fileUri: 'gs://bucket/another.mp4' },
        // "This is a text part of the tweet"
    ]

    scriptCreatorProgram.updateScope(scopeField, scopeValue)

    // 5. Get the raw payload without sending the request using program.raw()
    console.log(
        'Getting the raw request payload using program.raw()...'
    )
    const payload = await scriptCreatorProgram.raw(ai, input)

    console.log('\n--- Generated Raw Request Payload ---')
    console.log(JSON.stringify(payload, null, 2))
    console.log('------------------------------------')
}

main().catch(console.error)