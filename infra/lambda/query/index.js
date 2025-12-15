const {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} = require("@aws-sdk/client-bedrock-agent-runtime");

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const agentClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
});

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
});

import middy from "@middy/core";
import httpJsonBodyParser from "@middy/http-json-body-parser";
import httpHeaderNormalizer from "@middy/http-header-normalizer";

// SYSTEM PROMPT - Enforces CS reply drafting behavior
const SYSTEM_PROMPT = `You are an AI assistant helping customer service representatives draft professional email replies to customers at Silver Bullion.

<critical_rules>
- Write as if you ARE the CS rep speaking directly to the customer
- Use "I" or "we" when referring to the company/team
- Address the customer as "you"
- NEVER write numbered step-by-step instructions like "1. Do this, 2. Do that"
- NEVER use tutorial language like "To create X, follow these steps..."
- Instead, explain things conversationally: "You can do X by going to Y" or "Here's how it works..."
- Keep it friendly, helpful, and conversational
- Keep the reply concise (2-4 short paragraphs max)
- Use proper line breaks between paragraphs for readability
</critical_rules>

<anti_hallucination_rules>
CRITICAL - READ THIS CAREFULLY:
- You MUST ONLY answer questions using information from the company knowledge provided
- If the company knowledge is empty, does not contain relevant information, or the question is unrelated to company products/services, respond with:
  "Thanks for reaching out! I don't have specific information about that in our system right now. Let me look into this for you and get back to you with accurate details, or I can connect you with someone who can help right away. Would that work for you?"
- NEVER make up information, prices, policies, exchange rates, or facts
- NEVER use your general knowledge to answer questions
- If you're unsure whether the knowledge base covers the question, default to saying you don't know
- It's BETTER to say "I don't know" than to provide incorrect information
</anti_hallucination_rules>

<tone_guidelines>
- Friendly and approachable (like texting a colleague, but professional)
- Empathetic - acknowledge their question/concern
- Helpful - give them what they need to know
- Conversational - not robotic or overly formal
- Brief - respect their time
</tone_guidelines>

Continue the email reply that has been started for you. The greeting "Hi {{CUSTOMER_NAME}}," has already been provided.

You must end your response with:

Thanks,
{{CS_REP_NAME}}

Make sure to include blank lines between paragraphs for readability.`;

exports.handler = middy()
  .use(httpJsonBodyParser())
  .use(httpHeaderNormalizer())
  .handler(async (event, context) => {
    const { question, requestSessionId, modelId, conversationHistory } = event.body;
    try {
      console.log("model", modelId);
      const selectedModelId =
        modelId || "anthropic.claude-3-haiku-20240307-v1:0";

      // Step 1: Retrieve relevant documents from Knowledge Base
      console.log("Retrieving from Knowledge Base...");
      const retrieveInput = {
        knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
        retrievalQuery: {
          text: question,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5, // Retrieve top 5 relevant chunks
          },
        },
      };

      const retrieveCommand = new RetrieveCommand(retrieveInput);
      const retrieveResponse = await agentClient.send(retrieveCommand);

      console.log(
        `Retrieved ${retrieveResponse.retrievalResults?.length || 0} results`
      );

      // Step 2: Format retrieved context and extract citations
      let context = "";
      let citationUrl = null;

      if (
        retrieveResponse.retrievalResults &&
        retrieveResponse.retrievalResults.length > 0
      ) {
        // Build context from retrieved chunks
        context = retrieveResponse.retrievalResults
          .map((result, idx) => {
            const text = result.content?.text || "";
            return `[Source ${idx + 1}]: ${text}`;
          })
          .join("\n\n");

        // Extract citation from first result
        const firstResult = retrieveResponse.retrievalResults[0];
        const location = firstResult.location;
        if (location?.type === "S3") {
          citationUrl = location.s3Location?.uri;
        } else if (location?.type === "WEB") {
          citationUrl = location.webLocation?.url;
        }
      }

      // Step 3: Build user prompt with context and conversation history
      let conversationHistorySection = '';
      if (conversationHistory && conversationHistory.length > 0) {
        const historyText = conversationHistory
          .map((msg) => {
            const role = msg.role === 'customer' ? 'Customer' : 'CS Rep';
            return `[${role}]: ${msg.content}`;
          })
          .join('\n\n');

        conversationHistorySection = `<conversation_history>
${historyText}
</conversation_history>

`;
      }

      const userPrompt = context
        ? `${conversationHistorySection}<company_knowledge>
${context}
</company_knowledge>

<customer_inquiry>
${question}
</customer_inquiry>

Draft an email reply to answer the customer's inquiry using the company knowledge provided above.${conversationHistory && conversationHistory.length > 0 ? ' Consider the conversation history to maintain context and continuity.' : ''}`
        : `${conversationHistorySection}<customer_inquiry>
${question}
</customer_inquiry>

The company knowledge base does not contain information relevant to this inquiry. Draft an appropriate email reply.${conversationHistory && conversationHistory.length > 0 ? ' Consider the conversation history to maintain context.' : ''}`;

      // Step 4: Call InvokeModel with response prefilling to enforce format
      console.log("Invoking model with prefilled response...");
      const invokeInput = {
        modelId: selectedModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          temperature: 0.7,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
            {
              role: "assistant",
              content: "Hi {{CUSTOMER_NAME}},", // PREFILL - Forces email format!
            },
          ],
        }),
      };

      const invokeCommand = new InvokeModelCommand(invokeInput);
      const invokeResponse = await bedrockClient.send(invokeCommand);

      // Step 5: Parse response
      const responseBody = JSON.parse(
        new TextDecoder().decode(invokeResponse.body)
      );
      const generatedText = responseBody.content[0].text;

      // Construct full email (prefilled part + generated continuation)
      // The model continues from "Hi {{CUSTOMER_NAME}}," so we add line breaks and the continuation
      const fullEmail = `Hi {{CUSTOMER_NAME}},\n\n${generatedText}`;

      console.log("Generated email:", fullEmail);

      // Return response with citation
      return makeResults(200, fullEmail, citationUrl, requestSessionId);
    } catch (err) {
      console.error("Error:", err);
      return makeResults(500, `Server side error: ${err.message}`, null, null);
    }
  });

function makeResults(
  statusCode,
  responseText,
  citationText,
  responseSessionId
) {
  return {
    statusCode: statusCode,
    body: JSON.stringify({
      response: responseText,
      citation: citationText,
      sessionId: responseSessionId,
    }),
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  };
}
