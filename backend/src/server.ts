import express, { Application } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import dotenv from 'dotenv';
import { BedrockApiClient } from './apiClient';
import { createQueryRouter } from './routes/query';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

if (!API_GATEWAY_URL) {
  console.error('ERROR: API_GATEWAY_URL environment variable is required');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize API client
const apiClient = new BedrockApiClient(API_GATEWAY_URL);

// Load OpenAPI spec for Swagger UI
const openApiPath = path.join(__dirname, '../../infra/openapi.yaml');
let swaggerDocument: any;

try {
  swaggerDocument = YAML.load(openApiPath);
  console.log('OpenAPI spec loaded successfully');
} catch (error) {
  console.warn('Warning: Could not load OpenAPI spec from infra/openapi.yaml');
  console.warn('Swagger UI will not be available');
}

// Swagger UI setup
if (swaggerDocument) {
  const swaggerOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Customer Service Email Draft API',
  };

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, swaggerOptions)
  );
  console.log('Swagger UI available at /api-docs');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'bedrock-rag-backend',
  });
});

// API routes
app.use('/', createQueryRouter(apiClient));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Bedrock RAG Backend Server                               ║
╟───────────────────────────────────────────────────────────╢
║  Status: Running                                          ║
║  Port: ${PORT}                                            ║
║  API Gateway: ${API_GATEWAY_URL.substring(0, 40)}...      ║
╟───────────────────────────────────────────────────────────╢
║  Endpoints:                                               ║
║    POST   /ai-draft      - Generate email draft          ║
║    GET    /health        - Health check                  ║
║    GET    /api-docs      - Swagger documentation         ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
