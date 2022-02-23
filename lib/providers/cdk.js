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
const fs = require("fs");
const cdk = require("@aws-cdk/core");
const aws_auth_1 = require("aws-cdk/lib/api/aws-auth");
const settings_1 = require("aws-cdk/lib/settings");
const cloudformation_deployments_1 = require("aws-cdk/lib/api/cloudformation-deployments");
const cloud_executable_1 = require("aws-cdk/lib/api/cxapp/cloud-executable");
const cxapi = __importStar(require("@aws-cdk/cx-api/lib/cloud-assembly"));
const logging_1 = require("aws-cdk/lib/logging");
const aws_sdk_1 = require("aws-sdk");
class CDK {
    constructor(name, env, config, props, account) {
        this.name = name;
        this.env = env;
        this.config = config;
        this.props = props;
        this.awsAccount = account;
    }
    async deploy() {
        var _a;
        console.log('awsAccount', this.awsAccount);
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
        if (!fs.existsSync('cdk.context.json')) {
            fs.writeFileSync('cdk.context.json', JSON.stringify({}));
        }
        const configuration = new settings_1.Configuration();
        await configuration.load();
        logging_1.increaseVerbosity();
        function refreshApp(account, region) {
            console.log('refresh app');
            const app = new cdk.App({ context: Object.assign({}, configuration.context.all), outdir: 'cdk.frankenstack.out',
                analyticsReporting: false });
            console.log('refresh app', app);
            const s = new CdkStack(app, `${env}-${componentName}`, {
                env: {
                    account: account,
                    region: region
                }
            });
            console.log('refresh stack node meta', s.node.metadata);
            // app.synth({force: true});
            console.log('refresh app synth', app);
            return app;
        }
        let accountId;
        let awsCredentials;
        if (this.awsAccount) {
            accountId = this.awsAccount.accountId;
            awsCredentials = this.awsAccount.credentials;
        }
        else {
            accountId = this.config.account;
        }
        console.log('accountId', accountId);
        console.log('credentials', awsCredentials);
        let app = refreshApp(accountId, this.config.region);
        const sdkProvider = await this.getSdkProvider(awsCredentials);
        console.log('sdkProvider', sdkProvider);
        const cloudExecutable = new cloud_executable_1.CloudExecutable({
            configuration,
            sdkProvider,
            synthesizer: async (aws, config) => {
                console.log('synth called');
                await config.load();
                console.log('config', config);
                app = refreshApp(accountId, this.config.region);
                console.log('app', app);
                let stackAssembly = app.synth({ force: true });
                console.log('stackAssembly', stackAssembly);
                return new cxapi.CloudAssembly(stackAssembly.directory);
            }
        });
        const assembly = await cloudExecutable.synthesize();
        console.log('assembly', assembly);
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
            try {
                console.log(JSON.stringify(result, null, 2));
                console.log(`Successfully deployed ${result.stackArtifact.stackName}!`);
            }
            catch (err) {
                console.error(err);
            }
        }
        return {
            result: true,
            outputs: result.outputs ? (_a = Object.entries(result.outputs)) === null || _a === void 0 ? void 0 : _a.map(output => { return { Key: output[0], Value: output[1] }; }) : []
        };
    }
    async getSdkProvider(paramaterName) {
        console.log('getSdkProvider parameterName', paramaterName);
        if (paramaterName) {
            const ssm = new aws_sdk_1.SSM();
            const param = await ssm.getParameter({
                Name: paramaterName.replace('ssm:', ''),
                WithDecryption: true
            }).promise();
            if (param.Parameter && param.Parameter.Value) {
                console.log('getSdkProvider paramValue', param.Parameter.Value);
                const credentials = JSON.parse(param.Parameter.Value);
                const credentialProviders = [
                    () => {
                        return new aws_sdk_1.Credentials({
                            accessKeyId: credentials.AWS_ACCESS_KEY_ID,
                            secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY
                        });
                    }
                ];
                const chain = new aws_sdk_1.CredentialProviderChain(credentialProviders);
                return new aws_auth_1.SdkProvider(chain, this.config.region, {});
            }
        }
        return aws_auth_1.SdkProvider.withAwsCliCompatibleDefaults({});
    }
}
exports.CDK = CDK;
