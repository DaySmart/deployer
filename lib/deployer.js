"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parseYaml = require('./utils/parseYaml');
const cdk_1 = require("./providers/cdk");
const serverless_1 = require("./providers/serverless");
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');
const snsClient = require('./service/snsClient');
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
        if (this.command === 'deploy') {
            await this.deploy();
        }
        else if (this.command === 'destroy') {
            await this.destroy();
        }
        else {
            console.error(`The command ${this.command} is not implemented`);
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
        switch (providerType) {
            case 'serverless-framework':
                provider = new serverless_1.ServerlessV1(this.component);
                break;
            case 'hardcoded':
                provider = new HardCoded(this.component);
                break;
            case 'dsicollection-dynamic-environment':
                provider = new DsicollectionDynamicEnvironment(this.component);
                break;
            case 'cdk':
                provider = new cdk_1.CDK(this.component.name, this.component.env, this.component.provider.config, this.component.inputs);
                break;
            default:
                throw (`The provider ${providerType} is not implemented!`);
        }
        const deployResp = await provider.deploy();
        if (this.jobRunGuid && this.deploymentGuid) {
            await snsClient.publishJobRunFinishedMessage({
                deploymentGuid: this.deploymentGuid,
                env: this.component.env,
                jobRunGuid: this.jobRunGuid,
                name: this.component.name,
                status: deployResp.result ? 'Success' : 'Failed',
                outputs: JSON.stringify(deployResp.outputs)
            });
        }
        if (deployResp.exception) {
            throw deployResp.exception;
        }
        // Store the component in the environment service with it's outputs
        // if(deployResp.outputs) {
        //     await deployResp.outputs.forEach((output: any) => {
        //         environmentService.putComponentOutput(this.component.env, this.component.name, output.key, output.value)
        //     });
        // }
    }
    async destroy() {
    }
    parseEnvironmentVariables() {
        let provider;
        try {
            const rawProvider = JSON.parse(process.env.COMPONENT_PROVIDER);
            console.log(rawProvider);
            provider = {
                name: rawProvider.Name,
                config: (rawProvider.Config) ? rawProvider.Config.reduce((obj, item) => {
                    return Object.assign(Object.assign({}, obj), { [item.Key]: item.Value });
                }, {}) : undefined
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
                ? JSON.parse(process.env.COMPONENT_INPUTS).reduce((obj, item) => {
                    return Object.assign(Object.assign({}, obj), { [item.Key]: item.Value });
                }, {})
                : undefined
        };
    }
    parseComponentTemplate(file) {
        return parseYaml(file);
    }
}
module.exports = Deployer;
