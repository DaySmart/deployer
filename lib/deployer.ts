const parseYaml = require('./utils/parseYaml');
import { CDK } from './providers/cdk';
import { ServerlessV1 } from './providers/serverless';
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');

class Deployer {
	public file: any;
	public command: any;
	public component: any;

    constructor(command: any, file: string) {
        this.file = file;
        this.command = command;
        this.component = this.parseComponentTemplate(this.file);
        console.log(this.component);
    }

    async run() {
        if(this.command === 'deploy') {
            await this.deploy();
        } else if(this.command === 'destroy') {
            await this.destroy();
        } else {
            console.error(`The command ${this.command} is not implemented`);
        }
    }

    async deploy() {
        let provider
        let providerType;
        if(this.component.provider instanceof String) {
           providerType = this.component.provider; 
        } else {
            providerType = this.component.provider.name;
        }
        switch(providerType) {
            case 'serverless-framework':
                provider = new ServerlessV1(this.component);
                break;
            case 'hardcoded':
                provider = new HardCoded(this.component);
                break;
            case 'dsicollection-dynamic-environment':
                provider = new DsicollectionDynamicEnvironment(this.component);
                break;
            case 'cdk':
                provider = new CDK(this.component.name, this.component.env, this.component.provider.config, this.component.input);
                break;
            default:
                throw(`The provider ${providerType} is not implemented!`);
        }

        const deployResp = await provider.deploy();

        // Store the component in the environment service with it's outputs
        if(deployResp.outputs) {
            await deployResp.outputs.forEach((output: any) => {
                environmentService.putComponentOutput(this.component.env, this.component.name, output.key, output.value)
            });
        }
    }

    async destroy() {

    }

    parseComponentTemplate(file: string) {
        return parseYaml(file);
    }
}

module.exports = Deployer;