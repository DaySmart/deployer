'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDK = void 0;
const cdk = require("@aws-cdk/core");
const aws_auth_1 = require("aws-cdk/lib/api/aws-auth");
const cloudformation_deployments_1 = require("aws-cdk/lib/api/cloudformation-deployments");
class CDK {
    constructor(name, env, config, props) {
        this.name = name;
        this.env = env;
        this.config = config;
        this.props = props;
    }
    async deploy() {
        var _a;
        let construct;
        if (this.config.constructPath) {
            construct = await Promise.resolve().then(() => __importStar(require(process.cwd() + '/' + this.config.constructPath)));
        }
        else if (this.config.constructPackage) {
            const { createRequireFromPath } = require('module');
            const requireUtil = createRequireFromPath(process.cwd() + '/node_modules');
            construct = requireUtil(this.config.constructPackage);
        }
        else {
            throw "Need to define constructPath or constructPackage!";
        }
        const constructName = this.config.constructName ? this.config.constructName : Object.keys(construct)[0];
        const componentName = this.name;
        const env = this.env;
        const componentProps = this.props;
        console.log(componentProps);
        const config = this.config;
        class CdkStack extends cdk.Stack {
            constructor(scope, id, props) {
                super(scope, id, props);
                new construct[constructName](this, constructName, componentProps);
            }
        }
        const app = new cdk.App();
        const s = new CdkStack(app, `${env}-${componentName}`, {
            env: {
                account: this.config.account,
                region: this.config.region
            }
        });
        console.log(s.environment);
        const assembly = app.synth();
        const sdkProvider = await aws_auth_1.SdkProvider.withAwsCliCompatibleDefaults({});
        const cloudformation = new cloudformation_deployments_1.CloudFormationDeployments({ sdkProvider: sdkProvider });
        const stack = assembly.stacks[0];
        let result;
        try {
            result = await cloudformation.deployStack({
                stack,
                deployName: stack.stackName,
                force: true
            });
        }
        catch (err) {
            throw err;
        }
        if (result.noOp) {
            console.log(`Successfully deployed ${result.stackArtifact.stackName}!`);
        }
        return {
            result: true,
            outputs: (_a = Object.entries(result.outputs)) === null || _a === void 0 ? void 0 : _a.map(output => { return { Key: output[0], Value: output[1] }; })
        };
    }
}
exports.CDK = CDK;
