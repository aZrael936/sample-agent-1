import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
  ArnFormat,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as logs from "aws-cdk-lib/aws-logs";
import { join } from "path";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../.env") });

/**
 * Simplified Backend Stack for RAG Application
 *
 * This stack assumes you already have:
 * - A Bedrock Knowledge Base created
 * - S3 bucket with documents
 * - Data already synced/ingested
 *
 * To deploy:
 * 1. Set KNOWLEDGE_BASE_ID in backend/.env
 * 2. Run: cdk deploy
 */
export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Get Knowledge Base ID from environment variables
    const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;

    if (!knowledgeBaseId) {
      throw new Error(
        "Knowledge Base ID is required. Set KNOWLEDGE_BASE_ID in backend/.env file"
      );
    }

    /** Lambda for handling retrieval and answer generation */
    const lambdaQuery = new NodejsFunction(this, "Query", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/query/index.js"),
      functionName: `query-bedrock-llm`,
      // Query lambda timeout set to match API Gateway max timeout
      timeout: Duration.seconds(29),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBaseId,
      },
      bundling: {
        minify: true,
        sourceMap: false,
        externalModules: [
          "aws-sdk", // AWS SDK is available in Lambda runtime
        ],
      },
    });

    // Grant permissions for Bedrock Knowledge Base access
    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:RetrieveAndGenerate",
          "bedrock:Retrieve",
          "bedrock:InvokeModel",
        ],
        resources: ["*"],
      })
    );

    // Grant AWS Marketplace permissions for Bedrock model access
    // Required for first-time model enablement
    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe",
        ],
        resources: ["*"],
      })
    );

    // Create CloudWatch Logs role for API Gateway
    // Note: This is an account-level setting. Only one can exist per region.
    const apiGatewayCloudWatchRole = new iam.Role(
      this,
      "ApiGatewayCloudWatchRole",
      {
        assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
          ),
        ],
      }
    );

    // Set the CloudWatch role for API Gateway account settings
    // This updates the account-level configuration
    const apiGatewayAccount = new apigw.CfnAccount(this, "ApiGatewayAccount", {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn,
    });

    // Optional: Restrict to specific Knowledge Base (more secure)
    // lambdaQuery.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: ["bedrock:RetrieveAndGenerate", "bedrock:Retrieve"],
    //     resources: [
    //       `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${knowledgeBaseId}`,
    //     ],
    //   })
    // );

    /** API Gateway */
    const apiGateway = new apigw.RestApi(this, "rag", {
      description: "API for RAG Knowledge Base Queries",
      restApiName: "rag-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    // Ensure API Gateway account configuration is set before deployment
    apiGateway.node.addDependency(apiGatewayAccount);

    // POST /docs - Query endpoint
    apiGateway.root
      .addResource("ai-draft")
      .addMethod("POST", new apigw.LambdaIntegration(lambdaQuery));

    // Usage plan for rate limiting
    apiGateway.addUsagePlan("usage-plan", {
      name: "bedrock-rag-plan",
      description: "Usage plan for RAG API",
      apiStages: [
        {
          api: apiGateway,
          stage: apiGateway.deploymentStage,
        },
      ],
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    /** WAF - Web Application Firewall for IP Whitelisting */
    // Note: WAF configuration is currently disabled
    // To enable WAF with IP whitelisting:
    // 1. Add ALLOWED_IP to backend/.env
    // 2. Uncomment the code below and update whitelistedIps
    // 3. Uncomment the WebACLAssociation section further down

    // // Create IP Set for allowed IPs
    // const whitelistedIps = [process.env.ALLOWED_IP || "0.0.0.0/32"];
    // const allowedIpSet = new wafv2.CfnIPSet(this, "DevIpSet", {
    //   addresses: whitelistedIps,
    //   ipAddressVersion: "IPV4",
    //   scope: "REGIONAL",
    //   description: "List of allowed IP addresses",
    // });

    // // Create Web ACL
    // const webACL = new wafv2.CfnWebACL(this, "WebACL", {
    //   defaultAction: {
    //     block: {}, // Block all traffic by default
    //   },
    //   scope: "REGIONAL",
    //   visibilityConfig: {
    //     cloudWatchMetricsEnabled: true,
    //     metricName: "webACL",
    //     sampledRequestsEnabled: true,
    //   },
    //   rules: [
    //     {
    //       name: "IPAllowList",
    //       priority: 1,
    //       statement: {
    //         ipSetReferenceStatement: {
    //           arn: allowedIpSet.attrArn,
    //         },
    //       },
    //       action: {
    //         allow: {}, // Allow traffic from whitelisted IPs
    //       },
    //       visibilityConfig: {
    //         sampledRequestsEnabled: true,
    //         cloudWatchMetricsEnabled: true,
    //         metricName: "IPAllowList",
    //       },
    //     },
    //   ],
    // });

    // // WAF Logging
    // const webAclLogGroup = new logs.LogGroup(this, "awsWafLogs", {
    //   logGroupName: `aws-waf-logs-bedrock-rag`,
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   retention: logs.RetentionDays.ONE_WEEK,
    // });

    // new wafv2.CfnLoggingConfiguration(this, "WAFLoggingConfiguration", {
    //   resourceArn: webACL.attrArn,
    //   logDestinationConfigs: [
    //     Stack.of(this).formatArn({
    //       arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    //       service: "logs",
    //       resource: "log-group",
    //       resourceName: webAclLogGroup.logGroupName,
    //     }),
    //   ],
    // });

    // // Associate WAF with API Gateway
    // const webACLAssociation = new wafv2.CfnWebACLAssociation(
    //   this,
    //   "WebACLAssociation",
    //   {
    //     webAclArn: webACL.attrArn,
    //     resourceArn: `arn:aws:apigateway:${Stack.of(this).region}::/restapis/${
    //       apiGateway.restApiId
    //     }/stages/${apiGateway.deploymentStage.stageName}`,
    //   }
    // );

    // // Ensure API Gateway is deployed before WAF association
    // webACLAssociation.node.addDependency(apiGateway);

    /** Outputs */
    new CfnOutput(this, "APIGatewayUrl", {
      value: apiGateway.url,
      description: "API Gateway endpoint URL",
      exportName: "BedrockRAGApiUrl",
    });

    new CfnOutput(this, "KnowledgeBaseId", {
      value: knowledgeBaseId,
      description: "Bedrock Knowledge Base ID being used",
    });

    new CfnOutput(this, "QueryEndpoint", {
      value: `${apiGateway.url}docs`,
      description: "Full query endpoint URL (POST to this URL)",
    });
  }
}
