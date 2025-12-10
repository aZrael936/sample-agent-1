"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const apigw = require("aws-cdk-lib/aws-apigateway");
const wafv2 = require("aws-cdk-lib/aws-wafv2");
const logs = require("aws-cdk-lib/aws-logs");
const path_1 = require("path");
/**
 * Simplified Backend Stack for RAG Application
 *
 * This stack assumes you already have:
 * - A Bedrock Knowledge Base created
 * - S3 bucket with documents
 * - Data already synced/ingested
 *
 * To deploy:
 * 1. Set KNOWLEDGE_BASE_ID in cdk.json context
 * 2. Set allowedip for WAF IP whitelist
 * 3. Run: cdk deploy
 */
class BackendStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Get Knowledge Base ID from context
        const knowledgeBaseId = this.node.tryGetContext("knowledgeBaseId");
        if (!knowledgeBaseId) {
            throw new Error("Knowledge Base ID is required. Set it in cdk.json context: " +
                'cdk deploy -c knowledgeBaseId="your-kb-id-here"');
        }
        /** Lambda for handling retrieval and answer generation */
        const lambdaQuery = new aws_lambda_nodejs_1.NodejsFunction(this, "Query", {
            runtime: aws_lambda_1.Runtime.NODEJS_20_X,
            entry: (0, path_1.join)(__dirname, "../lambda/query/index.js"),
            functionName: `query-bedrock-llm`,
            // Query lambda timeout set to match API Gateway max timeout
            timeout: aws_cdk_lib_1.Duration.seconds(29),
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
        lambdaQuery.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "bedrock:RetrieveAndGenerate",
                "bedrock:Retrieve",
                "bedrock:InvokeModel",
            ],
            resources: ["*"],
        }));
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
        const whitelistedIps = [aws_cdk_lib_1.Stack.of(this).node.tryGetContext("allowedip")];
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
                // Logging disabled - requires CloudWatch Logs role setup
                // loggingLevel: apigw.MethodLoggingLevel.INFO,
                // dataTraceEnabled: true,
            },
        });
        // POST /docs - Query endpoint
        apiGateway.root
            .addResource("docs")
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
        // Create IP Set for allowed IPs
        const allowedIpSet = new wafv2.CfnIPSet(this, "DevIpSet", {
            addresses: whitelistedIps,
            ipAddressVersion: "IPV4",
            scope: "REGIONAL",
            description: "List of allowed IP addresses",
        });
        // Create Web ACL
        const webACL = new wafv2.CfnWebACL(this, "WebACL", {
            defaultAction: {
                block: {}, // Block all traffic by default
            },
            scope: "REGIONAL",
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: "webACL",
                sampledRequestsEnabled: true,
            },
            rules: [
                {
                    name: "IPAllowList",
                    priority: 1,
                    statement: {
                        ipSetReferenceStatement: {
                            arn: allowedIpSet.attrArn,
                        },
                    },
                    action: {
                        allow: {}, // Allow traffic from whitelisted IPs
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: "IPAllowList",
                    },
                },
            ],
        });
        // WAF Logging
        const webAclLogGroup = new logs.LogGroup(this, "awsWafLogs", {
            logGroupName: `aws-waf-logs-bedrock-rag`,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_WEEK,
        });
        new wafv2.CfnLoggingConfiguration(this, "WAFLoggingConfiguration", {
            resourceArn: webACL.attrArn,
            logDestinationConfigs: [
                aws_cdk_lib_1.Stack.of(this).formatArn({
                    arnFormat: aws_cdk_lib_1.ArnFormat.COLON_RESOURCE_NAME,
                    service: "logs",
                    resource: "log-group",
                    resourceName: webAclLogGroup.logGroupName,
                }),
            ],
        });
        // Associate WAF with API Gateway
        const webACLAssociation = new wafv2.CfnWebACLAssociation(this, "WebACLAssociation", {
            webAclArn: webACL.attrArn,
            resourceArn: `arn:aws:apigateway:${aws_cdk_lib_1.Stack.of(this).region}::/restapis/${apiGateway.restApiId}/stages/${apiGateway.deploymentStage.stageName}`,
        });
        // Ensure API Gateway is deployed before WAF association
        webACLAssociation.node.addDependency(apiGateway);
        /** Outputs */
        new aws_cdk_lib_1.CfnOutput(this, "APIGatewayUrl", {
            value: apiGateway.url,
            description: "API Gateway endpoint URL",
            exportName: "BedrockRAGApiUrl",
        });
        new aws_cdk_lib_1.CfnOutput(this, "KnowledgeBaseId", {
            value: knowledgeBaseId,
            description: "Bedrock Knowledge Base ID being used",
        });
        new aws_cdk_lib_1.CfnOutput(this, "QueryEndpoint", {
            value: `${apiGateway.url}docs`,
            description: "Full query endpoint URL (POST to this URL)",
        });
    }
}
exports.BackendStack = BackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2VuZC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJhY2tlbmQtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBT3FCO0FBRXJCLHFFQUErRDtBQUMvRCx1REFBaUQ7QUFDakQsMkNBQTJDO0FBQzNDLG9EQUFvRDtBQUNwRCwrQ0FBK0M7QUFDL0MsNkNBQTZDO0FBQzdDLCtCQUE0QjtBQUU1Qjs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxNQUFhLFlBQWEsU0FBUSxtQkFBSztJQUNyQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWtCO1FBQzFELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHFDQUFxQztRQUNyQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRW5FLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUNiLDZEQUE2RDtnQkFDN0QsaURBQWlELENBQ2xELENBQUM7UUFDSixDQUFDO1FBRUQsMERBQTBEO1FBQzFELE1BQU0sV0FBVyxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQ3BELE9BQU8sRUFBRSxvQkFBTyxDQUFDLFdBQVc7WUFDNUIsS0FBSyxFQUFFLElBQUEsV0FBSSxFQUFDLFNBQVMsRUFBRSwwQkFBMEIsQ0FBQztZQUNsRCxZQUFZLEVBQUUsbUJBQW1CO1lBQ2pDLDREQUE0RDtZQUM1RCxPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLFdBQVcsRUFBRTtnQkFDWCxpQkFBaUIsRUFBRSxlQUFlO2FBQ25DO1lBQ0QsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVMsRUFBRSxLQUFLO2dCQUNoQixlQUFlLEVBQUU7b0JBQ2YsU0FBUyxF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QyxTQUNiLFdBQVcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUU7U0FDbEQsQ0FDRixDQUFDO1FBRUYsd0RBQXdEO1FBQ3hELGlCQUFpQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFakQsY0FBYztRQUNkLElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxVQUFVLENBQUMsR0FBRztZQUNyQixXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxrQkFBa0I7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNyQyxLQUFLLEVBQUUsZUFBZTtZQUN0QixXQUFXLEVBQUUsc0NBQXNDO1NBQ3BELENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25DLEtBQUssRUFBRSxHQUFHLFVBQVUsQ0FBQyxHQUFHLE1BQU07WUFDOUIsV0FBVyxFQUFFLDRDQUE0QztTQUMxRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuTUQsb0NBbU1DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgU3RhY2ssXG4gIFN0YWNrUHJvcHMsXG4gIER1cmF0aW9uLFxuICBDZm5PdXRwdXQsXG4gIFJlbW92YWxQb2xpY3ksXG4gIEFybkZvcm1hdCxcbn0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanNcIjtcbmltcG9ydCB7IFJ1bnRpbWUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBhcGlndyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXlcIjtcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtd2FmdjJcIjtcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sb2dzXCI7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcInBhdGhcIjtcblxuLyoqXG4gKiBTaW1wbGlmaWVkIEJhY2tlbmQgU3RhY2sgZm9yIFJBRyBBcHBsaWNhdGlvblxuICpcbiAqIFRoaXMgc3RhY2sgYXNzdW1lcyB5b3UgYWxyZWFkeSBoYXZlOlxuICogLSBBIEJlZHJvY2sgS25vd2xlZGdlIEJhc2UgY3JlYXRlZFxuICogLSBTMyBidWNrZXQgd2l0aCBkb2N1bWVudHNcbiAqIC0gRGF0YSBhbHJlYWR5IHN5bmNlZC9pbmdlc3RlZFxuICpcbiAqIFRvIGRlcGxveTpcbiAqIDEuIFNldCBLTk9XTEVER0VfQkFTRV9JRCBpbiBjZGsuanNvbiBjb250ZXh0XG4gKiAyLiBTZXQgYWxsb3dlZGlwIGZvciBXQUYgSVAgd2hpdGVsaXN0XG4gKiAzLiBSdW46IGNkayBkZXBsb3lcbiAqL1xuZXhwb3J0IGNsYXNzIEJhY2tlbmRTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBHZXQgS25vd2xlZGdlIEJhc2UgSUQgZnJvbSBjb250ZXh0XG4gICAgY29uc3Qga25vd2xlZGdlQmFzZUlkID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoXCJrbm93bGVkZ2VCYXNlSWRcIik7XG5cbiAgICBpZiAoIWtub3dsZWRnZUJhc2VJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBcIktub3dsZWRnZSBCYXNlIElEIGlzIHJlcXVpcmVkLiBTZXQgaXQgaW4gY2RrLmpzb24gY29udGV4dDogXCIgK1xuICAgICAgICAnY2RrIGRlcGxveSAtYyBrbm93bGVkZ2VCYXNlSWQ9XCJ5b3VyLWtiLWlkLWhlcmVcIidcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqIExhbWJkYSBmb3IgaGFuZGxpbmcgcmV0cmlldmFsIGFuZCBhbnN3ZXIgZ2VuZXJhdGlvbiAqL1xuICAgIGNvbnN0IGxhbWJkYVF1ZXJ5ID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiUXVlcnlcIiwge1xuICAgICAgcnVudGltZTogUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudHJ5OiBqb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGEvcXVlcnkvaW5kZXguanNcIiksXG4gICAgICBmdW5jdGlvbk5hbWU6IGBxdWVyeS1iZWRyb2NrLWxsbWAsXG4gICAgICAvLyBRdWVyeSBsYW1iZGEgdGltZW91dCBzZXQgdG8gbWF0Y2ggQVBJIEdhdGV3YXkgbWF4IHRpbWVvdXRcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMjkpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgS05PV0xFREdFX0JBU0VfSUQ6IGtub3dsZWRnZUJhc2VJZCxcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogZmFsc2UsXG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogW1xuICAgICAgICAgIFwiYXdzLXNka1wiLCAvLyBBV1MgU0RLIGlzIGF2YWlsYWJsZSBpbiBMYW1iZGEgcnVudGltZVxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBCZWRyb2NrIEtub3dsZWRnZSBCYXNlIGFjY2Vzc1xuICAgIGxhbWJkYVF1ZXJ5LmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpSZXRyaWV2ZUFuZEdlbmVyYXRlXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOlJldHJpZXZlXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOkludm9rZU1vZGVsXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIE9wdGlvbmFsOiBSZXN0cmljdCB0byBzcGVjaWZpYyBLbm93bGVkZ2UgQmFzZSAobW9yZSBzZWN1cmUpXG4gICAgLy8gbGFtYmRhUXVlcnkuYWRkVG9Sb2xlUG9saWN5KFxuICAgIC8vICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgIC8vICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrOlJldHJpZXZlQW5kR2VuZXJhdGVcIiwgXCJiZWRyb2NrOlJldHJpZXZlXCJdLFxuICAgIC8vICAgICByZXNvdXJjZXM6IFtcbiAgICAvLyAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTprbm93bGVkZ2UtYmFzZS8ke2tub3dsZWRnZUJhc2VJZH1gLFxuICAgIC8vICAgICBdLFxuICAgIC8vICAgfSlcbiAgICAvLyApO1xuXG4gICAgLyoqIEFQSSBHYXRld2F5ICovXG4gICAgY29uc3Qgd2hpdGVsaXN0ZWRJcHMgPSBbU3RhY2sub2YodGhpcykubm9kZS50cnlHZXRDb250ZXh0KFwiYWxsb3dlZGlwXCIpXTtcblxuICAgIGNvbnN0IGFwaUdhdGV3YXkgPSBuZXcgYXBpZ3cuUmVzdEFwaSh0aGlzLCBcInJhZ1wiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJBUEkgZm9yIFJBRyBLbm93bGVkZ2UgQmFzZSBRdWVyaWVzXCIsXG4gICAgICByZXN0QXBpTmFtZTogXCJyYWctYXBpXCIsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlndy5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWd3LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCIsXG4gICAgICAgICAgXCJYLUFtei1EYXRlXCIsXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCIsXG4gICAgICAgICAgXCJYLUFwaS1LZXlcIixcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogXCJwcm9kXCIsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IDEwMCxcbiAgICAgICAgdGhyb3R0bGluZ0J1cnN0TGltaXQ6IDIwMCxcbiAgICAgICAgLy8gTG9nZ2luZyBkaXNhYmxlZCAtIHJlcXVpcmVzIENsb3VkV2F0Y2ggTG9ncyByb2xlIHNldHVwXG4gICAgICAgIC8vIGxvZ2dpbmdMZXZlbDogYXBpZ3cuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgIC8vIGRhdGFUcmFjZUVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUE9TVCAvZG9jcyAtIFF1ZXJ5IGVuZHBvaW50XG4gICAgYXBpR2F0ZXdheS5yb290XG4gICAgICAuYWRkUmVzb3VyY2UoXCJkb2NzXCIpXG4gICAgICAuYWRkTWV0aG9kKFwiUE9TVFwiLCBuZXcgYXBpZ3cuTGFtYmRhSW50ZWdyYXRpb24obGFtYmRhUXVlcnkpKTtcblxuICAgIC8vIFVzYWdlIHBsYW4gZm9yIHJhdGUgbGltaXRpbmdcbiAgICBhcGlHYXRld2F5LmFkZFVzYWdlUGxhbihcInVzYWdlLXBsYW5cIiwge1xuICAgICAgbmFtZTogXCJiZWRyb2NrLXJhZy1wbGFuXCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJVc2FnZSBwbGFuIGZvciBSQUcgQVBJXCIsXG4gICAgICBhcGlTdGFnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFwaTogYXBpR2F0ZXdheSxcbiAgICAgICAgICBzdGFnZTogYXBpR2F0ZXdheS5kZXBsb3ltZW50U3RhZ2UsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGhyb3R0bGU6IHtcbiAgICAgICAgcmF0ZUxpbWl0OiAxMDAsXG4gICAgICAgIGJ1cnN0TGltaXQ6IDIwMCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvKiogV0FGIC0gV2ViIEFwcGxpY2F0aW9uIEZpcmV3YWxsIGZvciBJUCBXaGl0ZWxpc3RpbmcgKi9cblxuICAgIC8vIENyZWF0ZSBJUCBTZXQgZm9yIGFsbG93ZWQgSVBzXG4gICAgY29uc3QgYWxsb3dlZElwU2V0ID0gbmV3IHdhZnYyLkNmbklQU2V0KHRoaXMsIFwiRGV2SXBTZXRcIiwge1xuICAgICAgYWRkcmVzc2VzOiB3aGl0ZWxpc3RlZElwcyxcbiAgICAgIGlwQWRkcmVzc1ZlcnNpb246IFwiSVBWNFwiLFxuICAgICAgc2NvcGU6IFwiUkVHSU9OQUxcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkxpc3Qgb2YgYWxsb3dlZCBJUCBhZGRyZXNzZXNcIixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXZWIgQUNMXG4gICAgY29uc3Qgd2ViQUNMID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCBcIldlYkFDTFwiLCB7XG4gICAgICBkZWZhdWx0QWN0aW9uOiB7XG4gICAgICAgIGJsb2NrOiB7fSwgLy8gQmxvY2sgYWxsIHRyYWZmaWMgYnkgZGVmYXVsdFxuICAgICAgfSxcbiAgICAgIHNjb3BlOiBcIlJFR0lPTkFMXCIsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogXCJ3ZWJBQ0xcIixcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogXCJJUEFsbG93TGlzdFwiLFxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgaXBTZXRSZWZlcmVuY2VTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYXJuOiBhbGxvd2VkSXBTZXQuYXR0ckFybixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHtcbiAgICAgICAgICAgIGFsbG93OiB7fSwgLy8gQWxsb3cgdHJhZmZpYyBmcm9tIHdoaXRlbGlzdGVkIElQc1xuICAgICAgICAgIH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IFwiSVBBbGxvd0xpc3RcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFdBRiBMb2dnaW5nXG4gICAgY29uc3Qgd2ViQWNsTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCBcImF3c1dhZkxvZ3NcIiwge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgYXdzLXdhZi1sb2dzLWJlZHJvY2stcmFnYCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgIH0pO1xuXG4gICAgbmV3IHdhZnYyLkNmbkxvZ2dpbmdDb25maWd1cmF0aW9uKHRoaXMsIFwiV0FGTG9nZ2luZ0NvbmZpZ3VyYXRpb25cIiwge1xuICAgICAgcmVzb3VyY2VBcm46IHdlYkFDTC5hdHRyQXJuLFxuICAgICAgbG9nRGVzdGluYXRpb25Db25maWdzOiBbXG4gICAgICAgIFN0YWNrLm9mKHRoaXMpLmZvcm1hdEFybih7XG4gICAgICAgICAgYXJuRm9ybWF0OiBBcm5Gb3JtYXQuQ09MT05fUkVTT1VSQ0VfTkFNRSxcbiAgICAgICAgICBzZXJ2aWNlOiBcImxvZ3NcIixcbiAgICAgICAgICByZXNvdXJjZTogXCJsb2ctZ3JvdXBcIixcbiAgICAgICAgICByZXNvdXJjZU5hbWU6IHdlYkFjbExvZ0dyb3VwLmxvZ0dyb3VwTmFtZSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5XG4gICAgY29uc3Qgd2ViQUNMQXNzb2NpYXRpb24gPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24oXG4gICAgICB0aGlzLFxuICAgICAgXCJXZWJBQ0xBc3NvY2lhdGlvblwiLFxuICAgICAge1xuICAgICAgICB3ZWJBY2xBcm46IHdlYkFDTC5hdHRyQXJuLFxuICAgICAgICByZXNvdXJjZUFybjogYGFybjphd3M6YXBpZ2F0ZXdheToke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06Oi9yZXN0YXBpcy8ke1xuICAgICAgICAgIGFwaUdhdGV3YXkucmVzdEFwaUlkXG4gICAgICAgIH0vc3RhZ2VzLyR7YXBpR2F0ZXdheS5kZXBsb3ltZW50U3RhZ2Uuc3RhZ2VOYW1lfWAsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEVuc3VyZSBBUEkgR2F0ZXdheSBpcyBkZXBsb3llZCBiZWZvcmUgV0FGIGFzc29jaWF0aW9uXG4gICAgd2ViQUNMQXNzb2NpYXRpb24ubm9kZS5hZGREZXBlbmRlbmN5KGFwaUdhdGV3YXkpO1xuXG4gICAgLyoqIE91dHB1dHMgKi9cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQVBJR2F0ZXdheVVybFwiLCB7XG4gICAgICB2YWx1ZTogYXBpR2F0ZXdheS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogXCJBUEkgR2F0ZXdheSBlbmRwb2ludCBVUkxcIixcbiAgICAgIGV4cG9ydE5hbWU6IFwiQmVkcm9ja1JBR0FwaVVybFwiLFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIktub3dsZWRnZUJhc2VJZFwiLCB7XG4gICAgICB2YWx1ZToga25vd2xlZGdlQmFzZUlkLFxuICAgICAgZGVzY3JpcHRpb246IFwiQmVkcm9jayBLbm93bGVkZ2UgQmFzZSBJRCBiZWluZyB1c2VkXCIsXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUXVlcnlFbmRwb2ludFwiLCB7XG4gICAgICB2YWx1ZTogYCR7YXBpR2F0ZXdheS51cmx9ZG9jc2AsXG4gICAgICBkZXNjcmlwdGlvbjogXCJGdWxsIHF1ZXJ5IGVuZHBvaW50IFVSTCAoUE9TVCB0byB0aGlzIFVSTClcIixcbiAgICB9KTtcbiAgfVxufVxuIl19