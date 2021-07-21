'use strict'
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const resolve = require('ncjsm/resolve/sync');
import { SSM } from 'aws-sdk';

export interface AWSAccount {
    accountId: string;
    credentials: string;
}

export class Serverless {
	public stage: any;
	public input: any;
	public region: any;
    public account: AWSAccount | undefined;

    constructor(config: any) {
        this.stage = config.env || config.Env;
        this.input = config.inputs || config.Inputs;
        this.region = config.region || 'us-east-1';
        this.account = config.provider.account;
    }

    async deploy() {
        this.writeConfigFile();

        if(this.account) {
            const credentialsParam = this.account.credentials;
            if(!credentialsParam) {
                throw "AWS Account is missing credentials parameter";
            }

            const ssm = new SSM();
            const param = await ssm.getParameter({
                Name: credentialsParam.replace('ssm:', ''),
                WithDecryption: true
            }).promise();

            if(param.Parameter && param.Parameter.Value) {
                const credentials = JSON.parse(param.Parameter.Value);
                process.env.AWS_ACCESS_KEY_ID = credentials.AWS_ACCESS_KEY_ID;
                process.env.AWS_SECRET_ACCESS_KEY = credentials.AWS_SECRET_ACCESS_KEY;
            } else {
                throw "Failed to read value from AWS account parameter";
            }
        }

        const serverlessPath = resolve(process.cwd(), 'serverless').realPath;
        const serverlessVersion = require(path.resolve(serverlessPath, '../../package.json')).version;
        const serverless = require(serverlessPath);
        let sls;
        if(serverlessVersion[0] === "2") {
            const commands = ['deploy'];
            let options = Object.create(null);
            options['verbose'] = true;
            options['region'] = this.region;
            options['stage'] = this.stage;

            const configPath = path.join(process.cwd(), 'serverless.yml');

            const readConfiguration = require(path.resolve(serverlessPath, '../configuration/read'));
            const configuration = await readConfiguration(configPath);

            const resolveVariablesMeta = require(path.resolve(serverlessPath, '../configuration/variables/resolve-meta'));
            const resolveVariables = require(path.resolve(serverlessPath, '../configuration/variables/resolve'));
            const variableSources = {
                env: { ...require(path.resolve(serverlessPath, '../configuration/variables/sources/env')), isIncomplete: true },
                file: require(path.resolve(serverlessPath, '../configuration/variables/sources/file')),
                opt: require(path.resolve(serverlessPath, '../configuration/variables/sources/opt')),
                self: require(path.resolve(serverlessPath, '../configuration/variables/sources/self')),
                strToBool: require(path.resolve(serverlessPath, '../configuration/variables/sources/str-to-bool')),
            };
            const variablesMeta = resolveVariablesMeta(configuration);
            await resolveVariables({
                servicePath: process.cwd(),
                configuration,
                variablesMeta,
                sources: variableSources,
                options,
            });

            sls = new serverless({
                configuration,
                configurationPath: configPath,
                commands,
                options,
            });
        } else {
            process.argv.push('deploy');
            process.argv.push('-v');

            if(this.region) {
                process.argv.push('-r', this.region);
            }

            if(this.stage) {
                process.argv.push('-s', this.stage);
            }
            sls = new serverless({});
        }

        let success = true;
        await sls.init();
        try {
            await sls.run();
        } catch(err) {
            console.error(err);
            success = false
        }
        const outputs = await this.getStackOutput(sls);

        return {
            result: success,
            outputs: outputs
        }
    }

    writeConfigFile() {
        if(this.input) {
            let output = yaml.dump(this.input);

            let deployerDir = path.join(process.cwd(), '.deployer')
            if(!fs.existsSync(deployerDir)) {
                fs.mkdirSync(deployerDir);
            }

            fs.writeFileSync(path.join(process.cwd(), '.deployer', 'serverless.config.yaml'), output, 'utf-8');
        }
    }

    async getStackOutput(serverless: any) {
        const stackName = serverless.providers.aws.naming.getStackName();
        let stackOutputs;
        if(serverless.getVersion()[0] === '2') {
            console.log("outputting v2");
            const result = await serverless.providers.aws
                .request('CloudFormation', 'describeStacks', { StackName: stackName })
            stackOutputs = result.Stacks[0].Outputs;

        } else {
            stackOutputs = serverless.providers.aws
                .request('CloudFormation', 'describeStacks', { StackName: stackName })
                .then((result: any) => {
                    return result.Stacks[0].Outputs
                });
        }
        return stackOutputs.map((output: any) => {return {Key: output.OutputKey, Value: output.OutputValue}});
    }
}
