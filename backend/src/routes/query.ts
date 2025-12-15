import { Router, Request, Response } from 'express';
import { BedrockApiClient, QueryRequest } from '../apiClient';

export function createQueryRouter(apiClient: BedrockApiClient): Router {
  const router = Router();

  /**
   * POST /ai-draft
   * Generate customer service email draft using RAG
   */
  router.post('/ai-draft', async (req: Request, res: Response) => {
    try {
      const { question, requestSessionId, modelId, conversationHistory } = req.body;

      // Validate required fields
      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Missing required parameter: question',
        });
      }

      // Validate modelId if provided
      const validModels = [
        'anthropic.claude-3-haiku-20240307-v1:0',
        'anthropic.claude-3-sonnet-20240229-v1:0',
        'anthropic.claude-3-opus-20240229-v1:0',
      ];

      if (modelId && !validModels.includes(modelId)) {
        return res.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: `Invalid modelId. Must be one of: ${validModels.join(', ')}`,
        });
      }

      // Validate conversationHistory if provided
      if (conversationHistory) {
        if (!Array.isArray(conversationHistory)) {
          return res.status(400).json({
            statusCode: 400,
            error: 'Bad Request',
            message: 'conversationHistory must be an array',
          });
        }

        for (const msg of conversationHistory) {
          if (!msg.role || !msg.content) {
            return res.status(400).json({
              statusCode: 400,
              error: 'Bad Request',
              message: 'Each conversation message must have role and content',
            });
          }
          if (!['customer', 'agent'].includes(msg.role)) {
            return res.status(400).json({
              statusCode: 400,
              error: 'Bad Request',
              message: 'Message role must be either "customer" or "agent"',
            });
          }
        }
      }

      // Build request
      const queryRequest: QueryRequest = {
        question: question.trim(),
        requestSessionId,
        modelId,
        conversationHistory,
      };

      // Call API Gateway
      const result = await apiClient.invokeQuery(queryRequest);

      // Return successful response
      return res.status(200).json({
        response: result.response,
        citation: result.citation,
        sessionId: result.sessionId,
      });
    } catch (error) {
      console.error('Error in /ai-draft endpoint:', error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('API Gateway')) {
          return res.status(503).json({
            statusCode: 503,
            error: 'Service Unavailable',
            message: 'Bedrock Knowledge Base temporarily unavailable',
          });
        }
      }

      // Generic server error
      return res.status(500).json({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Error invoking Bedrock model',
      });
    }
  });

  return router;
}
