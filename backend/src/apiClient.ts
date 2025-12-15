export interface QueryRequest {
  question: string;
  requestSessionId?: string;
  modelId?: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'customer' | 'agent';
  content: string;
}

export interface QueryResponse {
  response: string;
  citation: string | null;
  sessionId: string | null;
}

export class BedrockApiClient {
  private apiGatewayUrl: string;

  constructor(apiGatewayUrl: string) {
    this.apiGatewayUrl = apiGatewayUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async invokeQuery(request: QueryRequest): Promise<QueryResponse> {
    try {
      const response = await fetch(`${this.apiGatewayUrl}/ai-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API Gateway returned status ${response.status}: ${errorText}`
        );
      }

      const data = await response.json() as QueryResponse;
      return {
        response: data.response,
        citation: data.citation || null,
        sessionId: data.sessionId || null,
      };
    } catch (error) {
      console.error('Error calling API Gateway:', error);
      throw error;
    }
  }
}
