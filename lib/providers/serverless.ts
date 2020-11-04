'use strict'
const serverless = require('serverless');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

export class ServerlessV1 {
	public stage: any;
	public input: any;
	public region: any;

    constructor(config: any) {
        this.stage = config.env;
        this.input = config.input;
        this.region = config.region;
    }

    async deploy() {
        process.argv.push('deploy');
        process.argv.push('-v');

        if(this.region) {
            process.argv.push('-r', this.region);
        }

        if(this.stage) {
            process.argv.push('-s', this.stage);
        }

        this.writeConfigFile();

        const sls = new serverless({});
        await sls.init();
        await sls.run(); 
        const outputs = await this.getStackOutput(sls);

        return {
            outputs: outputs
        }
    }

    writeConfigFile() {
        if(this.input) {
            let output = yaml.safeDump(this.input);

            let deployerDir = path.join(process.cwd(), '.deployer')
            if(!fs.existsSync(deployerDir)) {
                fs.mkdirSync(deployerDir);
            }

            fs.writeFileSync(path.join(process.cwd(), '.deployer', 'serverless.config.yaml'), output, 'utf-8');
        }
    }

    async getStackOutput(serverless: any) {
        const stackName = serverless.providers.aws.naming.getStackName();
        const stackOutputs = serverless.providers.aws
            .request('CloudFormation', 'describeStacks', { StackName: stackName })
            .then((result: any) => {
                return result.Stacks[0].Outputs
            });
        return stackOutputs.map((output: any) => {return {key: output.OutputKey, value: output.OutputValue}});
    }
}
