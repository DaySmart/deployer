const parseYaml = require('./utils/parseYaml');
const ServerlessV1 = require('./providers/serverless');
const HardCoded = require('./providers/hardcoded');
const DsicollectionDynamicEnvironment = require('./providers/dsicollectionDynamicEnvironment');
const environmentService = require('./service/environmentService');

class Deployer {
    constructor(command, file) {
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
        switch(this.component.provider) {
            case 'serverless-framework':
                provider = new ServerlessV1(this.component);
                break;
            case 'hardcoded':
                provider = new HardCoded(this.component);
                break;
            case 'dsicollection-dynamic-environment':
                provider = new DsicollectionDynamicEnvironment(this.component);
                break;
            default:
                throw(`The provider ${this.component.provider} is not implemented!`);
        }

        const deployResp = await provider.deploy();

        // Store the component in the environment service with it's outputs
        if(deployResp.outputs) {
            await deployResp.outputs.forEach(output => {
                environmentService.putComponentOutput(this.component.env, this.component.name, output.key, output.value)
            });
        }
    }

    async destroy() {

    }

    parseComponentTemplate(file) {
        return parseYaml(file);
    }
}

module.exports = Deployer;