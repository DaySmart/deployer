"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parseYaml = require('./utils/parseYaml');
const cdk_1 = require("./providers/cdk");
const serverless_1 = require("./providers/serverless");
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');
const snsClient = require('./service/snsClient');
const unflatten = require('flat').unflatten;
const AWS = require('aws-sdk');
class Deployer {
    constructor(command, file) {
        this.file = file;
        this.command = command;
        if (this.file) {
            this.component = this.parseComponentTemplate(this.file);
        }
        else {
            this.component = this.parseEnvironmentVariables();
            this.deploymentGuid = process.env.DEPLOYMENT_GUID;
            this.jobRunGuid = process.env.JOB_RUN_GUID;
        }
        console.log(this.component);
    }
    async run() {
        try {
            await this.resolveSecrets();
        }
        catch (err) {
            console.error('Error on resolving secrets', err);
        }
        if (this.command === 'deploy') {
            await this.deploy();
        }
        else if (this.command === 'destroy') {
            await this.destroy();
        }
        else {
            this.publishResultToFrankenstack();
            throw `The command ${this.command} is not implemented`;
        }
    }
    async deploy() {
        let provider;
        let providerType;
        if (this.component.provider instanceof String) {
            providerType = this.component.provider;
        }
        else if (this.component.provider.name) {
            providerType = this.component.provider.name;
        }
        else if (this.component.provider.Name) {
            providerType = this.component.provider.Name;
        }
        let deployResp = {};
        try {
            switch (providerType) {
                case 'serverless-framework':
                    provider = new serverless_1.Serverless(this.component);
                    break;
                case 'hardcoded':
                    provider = new HardCoded(this.component);
                    break;
                case 'dsicollection-dynamic-environment':
                    provider = new DsicollectionDynamicEnvironment(this.component);
                    break;
                case 'cdk':
                    provider = new cdk_1.CDK(this.component.name, this.component.env, this.component.provider.config, this.component.inputs, this.component.provider.account);
                    break;
                default:
                    throw (`The provider ${providerType} is not implemented!`);
            }
            deployResp = await provider.deploy();
        }
        catch (err) {
            throw err;
        }
        finally {
            await this.publishResultToFrankenstack(deployResp);
            if (deployResp.exception) {
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
    async publishResultToFrankenstack(result) {
        if (this.jobRunGuid && this.deploymentGuid) {
            var status = 'Failed';
            var outputs = [];
            if (result) {
                status = result.result ? 'Success' : 'Failed';
                outputs = result.outputs || [];
            }
            await snsClient.publishJobRunFinishedMessage({
                deploymentGuid: this.deploymentGuid,
                env: this.component.env,
                jobRunGuid: this.jobRunGuid,
                name: this.component.name,
                status: status,
                outputs: JSON.stringify(outputs)
            });
        }
    }
    async destroy() {
    }
    parseEnvironmentVariables() {
        console.log('env', process.env);
        let provider;
        try {
            const rawProvider = JSON.parse(process.env.COMPONENT_PROVIDER);
            console.log(rawProvider);
            provider = {
                name: rawProvider.Name,
                config: (rawProvider.Config) ? rawProvider.Config.reduce((obj, item) => {
                    return Object.assign(Object.assign({}, obj), { [item.Key]: item.Value });
                }, {}) : undefined,
                account: (rawProvider.Account) ? rawProvider.Account : undefined
            };
        }
        catch (err) {
            provider = process.env.COMPONENT_PROVIDER;
        }
        return {
            env: process.env.COMPONENT_ENVIRONMENT,
            name: process.env.COMPONENT_NAME,
            provider: provider,
            inputs: (process.env.COMPONENT_INPUTS)
                ? unflatten(JSON.parse(process.env.COMPONENT_INPUTS).reduce((obj, item) => {
                    return Object.assign(Object.assign({}, obj), { [item.Key]: item.Value });
                }, {}))
                : undefined
        };
    }
    parseComponentTemplate(file) {
        return parseYaml(file);
    }
    async resolveSecrets() {
        const ssm = new AWS.SSM();
        if (!this.component.inputs) {
            return;
        }
        for (var key of Object.keys(this.component.inputs)) {
            if (this.component.inputs[key].startsWith('ssm:')) {
                console.log(`Resolving secret value for: ${this.component.inputs[key]}`);
                const paramName = this.component.inputs[key].replace('ssm:', '');
                const param = await ssm.getParameter({
                    Name: paramName,
                    WithDecryption: true
                }).promise();
                if (param.Parameter && param.Parameter.Value) {
                    this.component.inputs[key] = param.Parameter.Value;
                }
                else {
                    const result = { status: false };
                    await this.publishResultToFrankenstack(result);
                    throw `Failed to resolve secret value for paramater: ${paramName}`;
                }
            }
        }
    }
}
module.exports = Deployer;
