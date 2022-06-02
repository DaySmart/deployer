const parseYaml = require('./utils/parseYaml');
import { CDK } from './providers/cdk';
import { Serverless } from './providers/serverless';
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');
const snsClient = require('./service/snsClient');
const unflatten = require('flat').unflatten;
const AWS = require('aws-sdk');

class Deployer {
	public file: any;
	public command: any;
    public component: any;
    public jobRunGuid?: string;
    public deploymentGuid?: string;
    private publish: boolean = true;

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
        try {
            await this.resolveSecrets()
        } catch(err) {
            console.error('Error on resolving secrets', err);
        }  
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
                    try {
                        const { createRequireFromPath } = require('module');
                        const requireUtil = createRequireFromPath(process.cwd() + '/node_modules');
                        const providerPackage = requireUtil(providerType);
                        const providerConfig = {
                            componentProvider: {
                                name: this.component.provider.name,
                                config: Object.entries(this.component.provider.config).map(config => {
                                    return {key: config[0], value: config[1]}
                                }),
                                account: this.component.provider.account
                            },
                            environment: this.component.env,
                            componentName: this.component.name,
                            deploymentGuid: this.deploymentGuid,
                            jobRunGuid: this.jobRunGuid,
                            jobRunFinishedTopicArn: process.env.JOB_RUN_FINISHED_TOPIC_ARN,
                            inputs: Object.entries(this.component.inputs).map(input => {
                                return {key: input[0], value: input[1]}
                            })
                        }
                        const providerClass = Object.keys(providerPackage)[0];
                        provider = new providerPackage[providerClass](providerConfig);
                        this.publish = false;
                    } catch(err) {
                        console.error(err);
                        throw(`The provider ${providerType} is not implemented!`);
                    }
            }

            deployResp = await provider.deploy();
        } catch(err) {
            throw err;
        } finally {
            if(this.publish) {
                await this.publishResultToFrankenstack(deployResp);
            } else {
                await provider.sendResponse();
            }
            if(deployResp && deployResp.exception) {
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
                if (result.result) {
                    if (this.command === 'remove') {
                        status = 'Deleted';
                    } else {
                        status = 'Success';
                    }
                }
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

    async resolveSecrets(): Promise<void> {
        const ssm = new AWS.SSM();
        if(!this.component.inputs) {
            return;
        }
        for(var key of Object.keys(this.component.inputs)) {
            if(this.component.inputs[key].startsWith('ssm:')) {
                console.log(`Resolving secret value for: ${this.component.inputs[key]}`)
                const paramName = this.component.inputs[key].replace('ssm:', '');
                const param = await ssm.getParameter({
                    Name: paramName,
                    WithDecryption: true
                }).promise();
                if(param.Parameter && param.Parameter.Value) {
                    this.component.inputs[key] = param.Parameter.Value; 
                } else {
                    const result = {status: false}
                    await this.publishResultToFrankenstack(result);
                    throw `Failed to resolve secret value for paramater: ${paramName}`;
                }
            }
        }
    }
}

module.exports = Deployer;