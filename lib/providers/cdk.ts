'use strict'
import cdk = require('@aws-cdk/core');
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { DeployStackResult } from 'aws-cdk/lib/api/deploy-stack';

export interface CDKProviderProps {
    account: string;
    region: string;
    constructPath: string;
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
        const construct = await import(process.cwd() + '/' + this.config.constructPath);
        const constructName = this.config.constructName ? this.config.constructName : Object.keys(construct)[0];
        const componentName = this.name;
        const env = this.env;
        const componentProps = this.props;
        const config = this.config;
        class CdkStack extends cdk.Stack {
            constructor(scope: cdk.Construct, id: string, props: any) {
                super(scope, id, props);

                new construct[constructName](this, constructName, componentProps);
            }
        }

        const app = new cdk.App();
        new CdkStack(app, `${env}-${componentName}`, {
            env: {
                account: this.config.account,
                region: this.config.region
            }
        });
        const assembly = app.synth();

        const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({});
        const cloudformation = new CloudFormationDeployments({sdkProvider: sdkProvider});

        const stack = assembly.stacks[0];
        let result: DeployStackResult;
        try {
             result = await cloudformation.deployStack({
                stack,
                deployName: stack.stackName
            });
        } catch(err) {
            throw err;
        }
        
        if(result.noOp) {
            console.log(`Successfully deployed ${result.stackArtifact.stackName}!`)
        }
    
        return {
            outputs: Object.entries(result.outputs)?.map(output => {return {key: output[0], value: output[1]}})
        }
    }
}
