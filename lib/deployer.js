const minimist = require('minimist');
const parseYaml = require('./utils/parseYaml');
const ServerlessV1 = require('./providers/serverless');
const HardCoded = require('./providers/hardcoded');
const environmentService = require('./service/environmentService');

class Deployer {
    constructor() {
        this.args = minimist(process.argv);
        process.argv.forEach(arg => process.argv.pop(arg));
        this.file = this.args._[3];
        this.command = this.args._[2];
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
        if(this.component.provider === 'serverless-framework') {
            provider = new ServerlessV1(this.component);
        } else if(this.component.provider === 'hardcoded') {
            provider = new HardCoded(this.component);
        } else {
            console.error(`The provider ${this.component.provider} is not implemented!`);
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