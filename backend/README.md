# Bedrock RAG Backend Server

Express.js backend server that provides a REST API for generating customer service email drafts using Amazon Bedrock Knowledge Base via API Gateway.

## Features

- RESTful API endpoint for AI-powered email draft generation
- API Gateway integration for Bedrock Knowledge Base queries
- Swagger UI for API testing and documentation
- TypeScript for type safety
- CORS enabled for frontend integration
- Comprehensive error handling and validation

## Prerequisites

- Node.js 18+ and npm
- Deployed API Gateway endpoint (configured from the `/infra` directory)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Configure your `.env` file:
```env
API_GATEWAY_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
PORT=3000
NODE_ENV=development
```

## Development

Run the server in development mode with TypeScript hot reload:

```bash
npm run dev
```

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Production

Run the compiled server:

```bash
npm start
```

## API Endpoints

### POST /ai-draft

Generate a customer service email draft using RAG.

**Request Body:**
```json
{
  "question": "How do I place an order for silver bars?",
  "requestSessionId": "session-123-abc",
  "modelId": "anthropic.claude-3-haiku-20240307-v1:0",
  "conversationHistory": [
    {
      "role": "customer",
      "content": "I placed an order last week"
    },
    {
      "role": "agent",
      "content": "Thanks for contacting us!"
    }
  ]
}
```

**Response:**
```json
{
  "response": "Hi {{CUSTOMER_NAME}},\n\nYou can place an order...",
  "citation": "s3://bucket/docs/guide.pdf",
  "sessionId": "session-123-abc"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-11T10:00:00.000Z",
  "service": "bedrock-rag-backend"
}
```

### GET /api-docs

Interactive Swagger UI for API testing and documentation.

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3000/api-docs

The Swagger documentation is automatically generated from the OpenAPI spec located at `/infra/openapi.yaml`.

## Project Structure

```
backend/
├── src/
│   ├── server.ts           # Main Express server
│   ├── apiClient.ts        # API Gateway HTTP client
│   └── routes/
│       └── query.ts        # API route handlers
├── dist/                   # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (validation errors)
- `500` - Internal Server Error
- `503` - Service Unavailable (Bedrock/Lambda issues)

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `API_GATEWAY_URL` | API Gateway endpoint URL (without trailing slash) | Yes | - |
| `PORT` | Server port | No | `3000` |
| `NODE_ENV` | Environment mode | No | `development` |

## How It Works

The backend server acts as a proxy/wrapper around your API Gateway endpoint:
1. Receives requests from your frontend or other clients
2. Validates the request body
3. Forwards the request to your API Gateway endpoint (which invokes the Lambda)
4. Returns the response to the client

This architecture allows you to:
- Add additional middleware or business logic
- Implement rate limiting or caching
- Provide a consistent API interface
- Test the API through Swagger UI

## Testing with Swagger UI

1. Start the server: `npm run dev`
2. Open http://localhost:3000/api-docs in your browser
3. Click on "POST /ai-draft" to expand the endpoint
4. Click "Try it out"
5. Enter your request body
6. Click "Execute" to test the API

## License

MIT
