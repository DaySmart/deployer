const parseYaml = require('./utils/parseYaml');
import { CDK } from './providers/cdk';
import { Serverless } from './providers/serverless';
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');
const snsClient = require('./service/snsClient');
const unflatten = require('flat').unflatten;

class Deployer {
	public file: any;
	public command: any;
    public component: any;
    public jobRunGuid?: string;
    public deploymentGuid?: string;

    constructor(command: any, file: string | undefined) {
        this.file = file;
        this.command = process.env.PROVIDER_METHOD || command;
        if(this.file) {
            this.component = this.parseComponentTemplate(this.file);
        } else {
            this.component = this.parseEnvironmentVariables();
            this.deploymentGuid = process.env.DEPLOYMENT_GUID;
            this.jobRunGuid = process.env.JOB_RUN_GUID;
        }
        
        console.log(this.component);
    }

    async run() {
        if(this.command === 'deploy') {
            await this.deploy();
        } else if(this.command === 'remove') {
            await this.remove();
        } else {
            this.publishResultToFrankenstack();
            throw `The command ${this.command} is not implemented`;
        }
    }

    async deploy() {
        let provider
        let providerType;
        if(this.component.provider instanceof String) {
           providerType = this.component.provider; 
        } else if(this.component.provider.name) {
            providerType = this.component.provider.name;
        } else if(this.component.provider.Name) {
            providerType = this.component.provider.Name
        }
        
        let deployResp: any = {};
        try {
            switch(providerType) {
                case 'serverless-framework':
                    provider = new Serverless(this.component);
                    break;
                case 'hardcoded':
                    provider = new HardCoded(this.component);
                    break;
                case 'dsicollection-dynamic-environment':
                    provider = new DsicollectionDynamicEnvironment(this.component);
                    break;
                case 'cdk':
                    provider = new CDK(this.component.name, this.component.env, this.component.provider.config, this.component.inputs, this.component.provider.account);
                    break;
                default:
                    throw(`The provider ${providerType} is not implemented!`);
            }

            deployResp = await provider.deploy();
        } catch(err) {
            throw err;
        } finally {
            await this.publishResultToFrankenstack(deployResp);
            if(deployResp.exception) {
                throw deployResp.exception;
            }
        }

        // Store the component in the environment service with it's outputs
        // if(deployResp.outputs) {
        //     await deployResp.outputs.forEach((output: any) => {
        //         environmentService.putComponentOutput(this.component.env, this.component.name, output.key, output.value)
        //     });
        // }
    }

    async publishResultToFrankenstack(result?: any) {
        if(this.jobRunGuid && this.deploymentGuid) {
            var status = 'Failed';
            var outputs = []
            if(result) {
                status = result.result ? 'Success' : 'Failed'
                outputs = result.outputs || [];
            }
            await snsClient.publishJobRunFinishedMessage({
                deploymentGuid: this.deploymentGuid,
                env: this.component.env,
                jobRunGuid: this.jobRunGuid,
                name: this.component.name,
                status: status,
                outputs: JSON.stringify(outputs)
            })
        }
    }

    async remove() {
        let provider
        let providerType;
        if(this.component.provider instanceof String) {
           providerType = this.component.provider; 
        } else if(this.component.provider.name) {
            providerType = this.component.provider.name;
        } else if(this.component.provider.Name) {
            providerType = this.component.provider.Name
        }
        
        let deployResp: any = {};
        try {
            switch(providerType) {
                case 'serverless-framework':
                    provider = new Serverless(this.component);
                    break;
                case 'hardcoded':
                    provider = new HardCoded(this.component);
                    break;
                case 'dsicollection-dynamic-environment':
                    provider = new DsicollectionDynamicEnvironment(this.component);
                    break;
                case 'cdk':
                    provider = new CDK(this.component.name, this.component.env, this.component.provider.config, this.component.inputs, this.component.provider.account);
                    break;
                default:
                    throw(`The provider ${providerType} is not implemented!`);
            }

            deployResp = await provider.remove();
        } catch(err) {
            throw err;
        } finally {
            await this.publishResultToFrankenstack(deployResp);
            if(deployResp.exception) {
                throw deployResp.exception;
            }
        }

    }

    parseEnvironmentVariables(): any {
        let provider
        try {
            const rawProvider = JSON.parse(process.env.COMPONENT_PROVIDER as string)
            console.log(rawProvider);
            provider = {
                name: rawProvider.Name,
                config: (rawProvider.Config) ? rawProvider.Config.reduce((obj: any, item: any) => {
                    return {
                        ...obj,
                        [item.Key]: item.Value
                    }
                }, {}) : undefined,
                account: (rawProvider.Account) ? rawProvider.Account : undefined
            }
        } catch(err) {
            provider = process.env.COMPONENT_PROVIDER
        }

        return {
            env: process.env.COMPONENT_ENVIRONMENT,
            name: process.env.COMPONENT_NAME,
            provider: provider,
            inputs: (process.env.COMPONENT_INPUTS) 
                ? unflatten(JSON.parse(process.env.COMPONENT_INPUTS).reduce((obj: any, item: any) => {
                    return {
                        ...obj,
                        [item.Key]: item.Value
                    }
                }, {}))
                : undefined
        }
    }

    parseComponentTemplate(file: string) {
        return parseYaml(file);
    }
}

module.exports = Deployer;