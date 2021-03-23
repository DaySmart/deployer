'use strict'
import cdk = require('@aws-cdk/core');
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { Settings, Configuration } from 'aws-cdk/lib/settings';
import { execProgram } from 'aws-cdk/lib/api/cxapp/exec';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { increaseVerbosity } from 'aws-cdk/lib/logging'
import { PluginHost } from 'aws-cdk/lib/plugin'
import * as contextproviders from 'aws-cdk/lib/context-providers'
import { DeployStackResult } from 'aws-cdk/lib/api/deploy-stack';

export interface CDKProviderProps {
    account: string;
    region: string;
    constructPath?: string;
    constructPackage?: string;
    constructName: string;
}

export class CDK {
    readonly name: string;
    readonly env: string;
    readonly config: CDKProviderProps;
    readonly props: any;

    constructor(name: string, env: string, config: CDKProviderProps, props: any) {
        this.name = name;
        this.env = env;
        this.config = config;
        this.props = props;
    }

    async deploy() {
        let construct: any;
        if(this.config.constructPath) {
            construct = await import(process.cwd() + '/' + this.config.constructPath);
        } else if(this.config.constructPackage) {
            const { createRequireFromPath } = require('module')
            const requireUtil = createRequireFromPath(process.cwd() + '/node_modules')
            construct = requireUtil(this.config.constructPackage);
        } else {
            throw "Need to define constructPath or constructPackage!";
        }
        
        const constructName = this.config.constructName ? this.config.constructName : Object.keys(construct)[0];
        const componentName = this.name;
        const env = this.env;
        const componentProps = this.props;
        console.log(componentProps);
        const config = this.config;
        class CdkStack extends cdk.Stack {
            constructor(scope: cdk.Construct, id: string, props: any) {
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

        const configuration = new Configuration();
        configuration.settings.get
        await configuration.load();

        increaseVerbosity();

        const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({});

        const cloudExecutable = new CloudExecutable({
            configuration,
            sdkProvider,
            synthesizer: execProgram
        });

        const cloudformation = new CloudFormationDeployments({sdkProvider: sdkProvider});

        function loadPlugins(...settings: Settings[]) {
            const loaded = new Set<string>();
            for (const source of settings) {
                const plugins: string[] = source.get(['plugin']) || [];
                for (const plugin of plugins) {
                    const resolved = tryResolve(plugin);
                    if (loaded.has(resolved)) { continue; }
                    PluginHost.instance.load(plugin);
                    loaded.add(resolved);
                }
            }
        
            function tryResolve(plugin: string): string {
                try {
                    return require.resolve(plugin);
                } catch (e) {
                    throw new Error(`Unable to resolve plug-in: ${plugin}`);
                }
            }
        }
    
        loadPlugins(configuration.settings);

        const assembly = app.synth();

        if(assembly.manifest.missing && assembly.manifest.missing.length > 0) {
            console.log(assembly.manifest.missing);
            await contextproviders.provideContextValues(
                assembly.manifest.missing,
                configuration.context,
                sdkProvider
            );
        }

        const stack = assembly.stacks[0];
        let result: DeployStackResult;
        try {
             result = await cloudformation.deployStack({
                stack,
                deployName: stack.stackName,
                force: true
            });
        } catch(err) {
            return {
                result: false,
                exception: err,
                outputs: []
            }
        }
        
        if(result.noOp) {
            console.log(`Successfully deployed ${result.stackArtifact.stackName}!`)
        }
    
        return {
            result: true,
            outputs: Object.entries(result.outputs)?.map(output => {return {Key: output[0], Value: output[1]}})
        }
    }
}
