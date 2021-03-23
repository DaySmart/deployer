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
const exec_1 = require("aws-cdk/lib/api/cxapp/exec");
const cloudformation_deployments_1 = require("aws-cdk/lib/api/cloudformation-deployments");
const cloud_executable_1 = require("aws-cdk/lib/api/cxapp/cloud-executable");
const logging_1 = require("aws-cdk/lib/logging");
const contextproviders = __importStar(require("aws-cdk/lib/context-providers"));
const cloud_assembly_1 = require("aws-cdk/lib/api/cxapp/cloud-assembly");
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
        const configuration = new settings_1.Configuration();
        await configuration.load();
        const app = new cdk.App({ context: configuration.context });
        const s = new CdkStack(app, `${env}-${componentName}`, {
            env: {
                account: this.config.account,
                region: this.config.region
            }
        });
        console.log(s.environment);
        logging_1.increaseVerbosity();
        const sdkProvider = await aws_auth_1.SdkProvider.withAwsCliCompatibleDefaults({});
        const cloudExecutable = new cloud_executable_1.CloudExecutable({
            configuration,
            sdkProvider,
            synthesizer: exec_1.execProgram
        });
        const cloudformation = new cloudformation_deployments_1.CloudFormationDeployments({ sdkProvider: sdkProvider });
        // function loadPlugins(...settings: Settings[]) {
        //     const loaded = new Set<string>();
        //     for (const source of settings) {
        //         const plugins: string[] = source.get(['plugin']) || [];
        //         for (const plugin of plugins) {
        //             const resolved = tryResolve(plugin);
        //             if (loaded.has(resolved)) { continue; }
        //             PluginHost.instance.load(plugin);
        //             loaded.add(resolved);
        //         }
        //     }
        //     function tryResolve(plugin: string): string {
        //         try {
        //             return require.resolve(plugin);
        //         } catch (e) {
        //             throw new Error(`Unable to resolve plug-in: ${plugin}`);
        //         }
        //     }
        // }
        // loadPlugins(configuration.settings);
        let assembly = app.synth();
        let cloudAssembly;
        let i = 0;
        while ((assembly.manifest.missing && assembly.manifest.missing.length > 0) || i < 3) {
            if (assembly.manifest.missing && assembly.manifest.missing.length > 0) {
                console.log(assembly.manifest.missing);
                await contextproviders.provideContextValues(assembly.manifest.missing, configuration.context, sdkProvider);
                await configuration.saveContext();
                assembly = app.synth({ force: true });
                console.log(assembly.stacks[0].template);
            }
            i++;
        }
        cloudAssembly = new cloud_assembly_1.CloudAssembly(assembly);
        // const contextFile = require('cdk.context.json');
        // console.log(JSON.stringify(contextFile, null, 2));
        const stack = cloudAssembly.assembly.stacks[0];
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
