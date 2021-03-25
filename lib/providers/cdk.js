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
const settings_1 = require("aws-cdk/lib/settings");
const cloudformation_deployments_1 = require("aws-cdk/lib/api/cloudformation-deployments");
const cloud_executable_1 = require("aws-cdk/lib/api/cxapp/cloud-executable");
const cxapi = __importStar(require("@aws-cdk/cx-api/lib/cloud-assembly"));
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
        const { createRequireFromPath } = require('module');
        if (this.config.constructPath) {
            construct = await Promise.resolve().then(() => __importStar(require(process.cwd() + '/' + this.config.constructPath)));
        }
        else if (this.config.constructPackage) {
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
        const config = this.config;
        class CdkStack extends cdk.Stack {
            constructor(scope, id, props) {
                super(scope, id, props);
                new construct[constructName](this, constructName, componentProps);
            }
        }
        const configuration = new settings_1.Configuration();
        await configuration.load();
        const app = new cdk.App({ context: Object.assign({}, configuration.context.all), outdir: 'cdk.frankenstack.out' });
        const s = new CdkStack(app, `${env}-${componentName}`, {
            env: {
                account: this.config.account,
                region: this.config.region
            }
        });
        app.synth();
        const sdkProvider = await aws_auth_1.SdkProvider.withAwsCliCompatibleDefaults({});
        const cloudExecutable = new cloud_executable_1.CloudExecutable({
            configuration,
            sdkProvider,
            synthesizer: async (aws, config) => {
                let stackAssembly = app.synth({ force: true });
                return new cxapi.CloudAssembly(stackAssembly.directory);
            }
        });
        const assembly = await cloudExecutable.synthesize();
        const cloudformation = new cloudformation_deployments_1.CloudFormationDeployments({ sdkProvider: sdkProvider });
        const stack = assembly.assembly.stacks[0];
        let result;
        try {
            result = await cloudformation.deployStack({
                stack,
                deployName: stack.stackName,
                force: true
            });
        }
        catch (err) {
            return {
                result: false,
                exception: err,
                outputs: []
            };
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
