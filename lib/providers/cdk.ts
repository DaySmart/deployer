'use strict'
import cdk = require('@aws-cdk/core');
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { Settings, Configuration, Command } from 'aws-cdk/lib/settings';
import { execProgram } from 'aws-cdk/lib/api/cxapp/exec';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { increaseVerbosity } from 'aws-cdk/lib/logging'
import { PluginHost } from 'aws-cdk/lib/plugin'
import * as contextproviders from 'aws-cdk/lib/context-providers'
import { DeployStackResult } from 'aws-cdk/lib/api/deploy-stack';
import * as cxapi from '@aws-cdk/cx-api/lib/cloud-assembly';
import { CloudAssembly } from 'aws-cdk/lib/api/cxapp/cloud-assembly'
import { synthesize } from '@aws-cdk/core/lib/private/synthesis';
import { DefaultStackSynthesizer } from '@aws-cdk/core';

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
        const { createRequireFromPath } = require('module')
        if(this.config.constructPath) {
            construct = await import(process.cwd() + '/' + this.config.constructPath);
        } else if(this.config.constructPackage) {
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

        const configuration = new Configuration();
        await configuration.load();

        const app = new cdk.App({context: { 
                ...configuration.context.all
            },
            outdir: 'cdk.frankenstack.out'
        });
        const s = new CdkStack(app, `${env}-${componentName}`, {
            env: {
                account: this.config.account,
                region: this.config.region
            },
            synthesizer: new DefaultStackSynthesizer()
        });
        // console.log(s.environment);

        increaseVerbosity();
        app.synth();
        const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({});

        const cloudExecutable = new CloudExecutable({
            configuration,
            sdkProvider,
            synthesizer: async (aws: SdkProvider, config: Configuration): Promise<cxapi.CloudAssembly> => {
                let stackAssembly = app.synth({force: true});
                return new cxapi.CloudAssembly(stackAssembly.directory);
            }
        });

        const assembly = await cloudExecutable.synthesize();

        const cloudformation = new CloudFormationDeployments({sdkProvider: sdkProvider});

        const stack = assembly.assembly.stacks[0];
        
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
