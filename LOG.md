Running program. The raw request payload will be logged below...
--- Mock Fetch Intercepted Request ---
URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-preview-0514:streamGenerateContent?alt=sse&key=dummy-api-key-for-testing
Headers: {
  "Content-Type": "application/json",
  "X-Request-ID": "b832007e-2d37-4896-bd55-42ea361ea50c",
  "X-Retry-Count": "0"
}
Request Body (Payload):
{
  "systemInstruction": {
    "role": "user",
    "parts": [
      {
        "text": "## Core Instruction\nYou will be provided with the following inputs: `<organization>`, `<userInstruction>`, `<tweet>`. Your core task is to fulfill the #main-task-description using the resources available and generate the following outputs: `<generatedScripts>`.\n\n## Input Definitions\n<organization type=\"json\" description=\"JSON object containing details about the organization, its marketing funnels, and creator agents with their video styles and gestures\">\n    <description type=\"string\" description=\"gives an overview of organization\" />\n    <marketingFunnels type=\"json\" isArray=\"true\">\n    <description type=\"string\" description=\"Description of the marketing funnel's goal\" />\n</marketingFunnels>\n    <creatorAgents type=\"json\" isArray=\"true\">\n    <name type=\"string\" description=\"full name of the agent\" />\n    <role type=\"string\" description=\"the agents role at the organization\" />\n    <tone type=\"string\" description=\"a description of the agents voice tone\" />\n    <personality type=\"string\" description=\"a description of the agents personality\" />\n    <voice type=\"json\">\n    <id type=\"string\" description=\"Elevenlab's voice ID\" />\n</voice>\n    <videoStyles type=\"json\" isArray=\"true\">\n    <id type=\"string\" description=\"Argil Avatar ID\" />\n    <description type=\"string\" description=\"description of the camera video style/avatar scene - for LLM context only\" />\n    <gestures type=\"json\" isArray=\"true\">\n    <id type=\"string\" description=\"Argil gesture slug, e.g., 'gesture-1\" />\n    <description type=\"string\" description=\"textual description of the gesture - for LLM context only\" />\n</gestures>\n</videoStyles>\n</creatorAgents>\n</organization>\n<userInstruction type=\"string\" description=\"Text instruction from the user about the desired content.\" />\n<tweet type=\"enum\" isArray=\"true\" enumType=\"algebraic\" enumValues=\"image,video,string\" />\n\n## Input Referencing Guide\nAll inputs and their nested properties can be referenced anywhere in this program using XML's XPath language. The inline format looks like <xpath path=\"//path/to/variable\" />.\n\n## Main Task Description\nBased on the <xpath>//organization</xpath> and the <xpath>//userInstruction</xpath> generate an appropriate amount of short-form video content scripts. Ensure that each script serves at least one of the <xpath>//organization/marketingFunnels</xpath>. You may generate as many scripts as you want, but ensure each script provides unique value. You have different variables to play with, such as who is the speaker (author) of the content, choosing which agent creator's voice and personality best fits the content. You must generate at least 1 script."
      }
    ]
  },
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "## Inputs\n<organization>{\n  \"description\": \"A test organization for creating content.\",\n  \"marketingFunnels\": [\n    {\n      \"description\": \"Awareness\"\n    }\n  ],\n  \"creatorAgents\": [\n    {\n      \"name\": \"Test Agent\",\n      \"role\": \"Content Creator\",\n      \"tone\": \"Informative\",\n      \"personality\": \"Engaging\",\n      \"voice\": {\n        \"id\": \"voice-123\"\n      },\n      \"videoStyles\": [\n        {\n          \"id\": \"avatar-abc\",\n          \"description\": \"A cool video style\",\n          \"gestures\": [\n            {\n              \"id\": \"gesture-xyz\",\n              \"description\": \"A wave\"\n            }\n          ]\n        }\n      ]\n    }\n  ]\n}</organization><userInstruction>make a video script about this <xpath>//tweet</xpath></userInstruction><tweet>"
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://bucket/landscape.jpg"
          }
        },
        {
          "text": "</tweet>"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0,
    "topP": 0.9,
    "topK": 40,
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "generatedScripts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "author": {
                "description": "Full name of the CreatorAgent",
                "type": "string"
              },
              "title": {
                "description": "script title",
                "type": "string"
              },
              "description": {
                "description": "description for the video platform",
                "type": "string"
              },
              "marketingGoals": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "marketingFunnelDescription": {
                      "type": "string"
                    },
                    "reasoning": {
                      "description": "the LLMs reasoning for why this script serves the choosen marketing funnel",
                      "type": "string"
                    }
                  },
                  "required": [
                    "marketingFunnelDescription",
                    "reasoning"
                  ]
                }
              },
              "moments": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "transcript": {
                      "description": "the moment's spoken text",
                      "type": "string"
                    },
                    "notes": {
                      "description": "notes that the LLM has regarding how a person should edit this moment such as suggested broll prompts, animations or transitions",
                      "type": "string"
                    },
                    "agentVideo": {
                      "type": "object",
                      "properties": {
                        "videoStyleId": {
                          "description": "the Argil Avatar ID selected from one of <xpath>//organization/creatorAgents/videoStyles/id</xpath>",
                          "type": "string"
                        },
                        "gestureSlug": {
                          "description": "the Argil gesture-slug belonging to the chosen <xpath>//videoStyleId</xpath> selected from one of <xpath>//organization/creatorAgents/videoStyles/gestures/id</xpath>",
                          "type": "string"
                        },
                        "sizeStyle": {
                          "description": "the suggested size of the generated avatar video when exported to the video editor",
                          "type": "string",
                          "enum": [
                            "FULL",
                            "HALF",
                            "PILL"
                          ]
                        },
                        "position": {
                          "description": "the suggested position of the generated avatar video when exported to the video editor",
                          "type": "string",
                          "enum": [
                            "CENTER",
                            "BOTTOM_LEFT",
                            "BOTTOM_RIGHT",
                            "TOP_LEFT",
                            "TOP_RIGHT"
                          ]
                        }
                      },
                      "required": [
                        "videoStyleId",
                        "gestureSlug"
                      ]
                    }
                  },
                  "required": [
                    "transcript",
                    "agentVideo"
                  ]
                }
              }
            },
            "required": [
              "author",
              "title",
              "description",
              "marketingGoals",
              "moments"
            ]
          }
        }
      },
      "required": [
        "generatedScripts"
      ],
      "description": "Based on the <xpath>//organization</xpath> and the <xpath>//userInstruction</xpath> generate an appropriate amount of short-form video content scripts. Ensure that each script serves at least one of the <xpath>//organization/marketingFunnels</xpath>. You may generate as many scripts as you want, but ensure each script provides unique value. You have different variables to play with, such as who is the speaker (author) of the content, choosing which agent creator's voice and personality best fits the content. You must generate at least 1 script."
    }
  }
}
------------------------------------

Program finished. Mock result received: {}
