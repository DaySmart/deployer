'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Serverless = void 0;
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const resolve = require('ncjsm/resolve/sync');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const aws_sdk_1 = require("aws-sdk");
class Serverless {
    constructor(config) {
        this.stage = config.env || config.Env;
        this.input = config.inputs || config.Inputs;
        this.region = (config.provider.config) ? config.provider.config.region || 'us-east-1' : 'us-east-1';
        this.account = config.provider.account;
    }
    async deploy() {
        return await this.executeServerless('deploy');
    }
    writeConfigFile() {
        if (this.input) {
            let output = yaml.dump(this.input);
            let deployerDir = path.join(process.cwd(), '.deployer');
            if (!fs.existsSync(deployerDir)) {
                fs.mkdirSync(deployerDir);
            }
            fs.writeFileSync(path.join(process.cwd(), '.deployer', 'serverless.config.yaml'), output, 'utf-8');
        }
    }
    async getStackOutput(serverless) {
        const stackName = serverless.providers.aws.naming.getStackName();
        let stackOutputs;
        if (serverless.getVersion()[0] === '2' || serverless.getVersion()[0] === '3') {
            console.log("outputting v2");
            const result = await serverless.providers.aws
                .request('CloudFormation', 'describeStacks', { StackName: stackName });
            stackOutputs = result.Stacks[0].Outputs;
        }
        else {
            stackOutputs = serverless.providers.aws
                .request('CloudFormation', 'describeStacks', { StackName: stackName })
                .then((result) => {
                return result.Stacks[0].Outputs;
            });
        }
        return stackOutputs.map((output) => { return { Key: output.OutputKey, Value: output.OutputValue }; });
    }
    async remove() {
        return await this.executeServerless('remove');
    }
    async executeServerless(command) {
        this.writeConfigFile();
        const serverlessPath = resolve(process.cwd(), 'serverless').realPath;
        const serverlessVersion = require(path.resolve(serverlessPath, '../../package.json')).version;
        const serverless = require(serverlessPath);
        let sls;
        if (this.account) {
            const credentialsParam = this.account.credentials;
            if (!credentialsParam) {
                throw "AWS Account is missing credentials parameter";
            }
            const ssm = new aws_sdk_1.SSM();
            const param = await ssm.getParameter({
                Name: credentialsParam.replace('ssm:', ''),
                WithDecryption: true
            }).promise();
            if (param.Parameter && param.Parameter.Value) {
                const credentials = JSON.parse(param.Parameter.Value);
                let stageArg = "";
                if (serverlessVersion[0] === "2" || serverlessVersion[0] === "1") {
                    stageArg = `--stage ${this.stage} `;
                }
                try {
                    const { stdout, stderr } = await exec(`npx serverless config credentials --provider aws -o --profile frank ${stageArg}--key ${credentials.AWS_ACCESS_KEY_ID} --secret ${credentials.AWS_SECRET_ACCESS_KEY}`);
                    console.log('stdout', stdout);
                    console.log('stderr', stderr);
                }
                catch (err) {
                    console.error(err);
                }
            }
            else {
                throw "Failed to read value from AWS account parameter";
            }
        }
        if (serverlessVersion[0] === "2") {
            const commands = [command];
            let options = Object.create(null);
            options['verbose'] = true;
            options['region'] = this.region;
            options['stage'] = this.stage;
            if (this.account) {
                options['aws-profile'] = 'frank';
            }
            const configPath = path.join(process.cwd(), 'serverless.yml');
            const readConfiguration = require(path.resolve(serverlessPath, '../configuration/read'));
            const configuration = await readConfiguration(configPath);
            const resolveVariablesMeta = require(path.resolve(serverlessPath, '../configuration/variables/resolve-meta'));
            const resolveVariables = require(path.resolve(serverlessPath, '../configuration/variables/resolve'));
            const variableSources = {
                env: Object.assign(Object.assign({}, require(path.resolve(serverlessPath, '../configuration/variables/sources/env'))), { isIncomplete: true }),
                file: require(path.resolve(serverlessPath, '../configuration/variables/sources/file')),
                opt: require(path.resolve(serverlessPath, '../configuration/variables/sources/opt')),
                self: require(path.resolve(serverlessPath, '../configuration/variables/sources/self')),
                strToBool: require(path.resolve(serverlessPath, '../configuration/variables/sources/str-to-bool')),
            };
            const variablesMeta = resolveVariablesMeta(configuration);
            let serviceDir = process.cwd();
            await resolveVariables({
                servicePath: process.cwd(),
                serviceDir: serviceDir,
                configuration,
                variablesMeta,
                sources: variableSources,
                options,
            });
            sls = new serverless({
                configuration,
                configurationPath: configPath,
                serviceDir,
                configurationFileName: configuration && configPath.slice(serviceDir.length + 1),
                isConfigurationResolved: false,
                hasResolvedCommandsExternally: true,
                isTelemetryReportedExternally: false,
                commands,
                options,
            });
        }
        else if (serverlessVersion[0] === "3") {
            const commands = [command];
            let options = Object.create(null);
            options['verbose'] = true;
            options['region'] = this.region;
            options['stage'] = this.stage;
            if (this.account) {
                options['aws-profile'] = 'frank';
            }
            const configPath = path.join(process.cwd(), 'serverless.yml');
            const readConfiguration = require(path.join(serverlessPath, '../configuration/read'));
            let configuration = await readConfiguration(configPath);
            const serviceDir = process.cwd();
            try {
                console.log('before', configuration);
                const resolveVariablesMeta = require(path.resolve(serverlessPath, '../configuration/variables/resolve-meta'));
                const variablesMeta = resolveVariablesMeta(configuration);
                console.log('varmeta', variablesMeta);
                const filterSupportedOptions = require(path.resolve(serverlessPath, '../cli/filter-supported-options'));
                const resolveProviderName = require(path.resolve(serverlessPath, '../configuration/resolve-provider-name'));
                const providerName = resolveProviderName(configuration);
                const resolveInput = require(path.resolve(serverlessPath, '../cli/resolve-input'));
                let c, opt, commands, isHelpRequest, commandSchema;
                ({ c, commands, opt, isHelpRequest, commandSchema } = resolveInput(require(path.resolve(serverlessPath, '../cli/commands-schema/aws-service'))));
                const variableSourcesInConfig = new Set();
                const resolverConfiguration = {
                    serviceDir,
                    configuration,
                    variablesMeta,
                    sources: {
                        env: require(path.resolve(serverlessPath, '../configuration/variables/sources/env')),
                        file: require(path.resolve(serverlessPath, '../configuration/variables/sources/file')),
                        opt: require(path.resolve(serverlessPath, '../configuration/variables/sources/opt')),
                        self: require(path.resolve(serverlessPath, '../configuration/variables/sources/self')),
                        strToBool: require(path.resolve(serverlessPath, '../configuration/variables/sources/str-to-bool')),
                        sls: require(path.resolve(serverlessPath, '../configuration/variables/sources/instance-dependent/get-sls'))(),
                    },
                    options: filterSupportedOptions(options, { commandSchema, providerName }),
                    // fulfilledSources: new Set(['file', 'self', 'strToBool']),
                    fulfilledSources: new Set([])
                    // propertyPathsToResolve: new Set(['provider\0name', 'provider\0stage', 'useDotenv']),
                    // variableSourcesInConfig,
                };
                const resolveVariables = require(path.resolve(serverlessPath, '../configuration/variables/resolve'));
                let count = 0;
                while (variablesMeta.size > 0 || count > 10) {
                    console.log('resolve vars', count, variablesMeta.size);
                    await resolveVariables(resolverConfiguration);
                    count++;
                }
                console.log('after', configuration);
            }
            catch (err) {
                console.error(err);
            }
            sls = new serverless({
                configuration,
                serviceDir,
                configurationFilename: 'serverless.yml',
                isConfigurationResolved: false,
                commands,
                options
            });
        }
        else {
            process.argv.push(command);
            process.argv.push('-v');
            if (this.region) {
                process.argv.push('-r', this.region);
            }
            if (this.stage) {
                process.argv.push('-s', this.stage);
            }
            if (this.account) {
                process.argv.push('--aws-profile', 'frank');
            }
            sls = new serverless({});
        }
        let success = true;
        await sls.init();
        try {
            await sls.run();
        }
        catch (err) {
            console.error(err);
            success = false;
        }
        let outputs;
        if (command === 'remove') {
            outputs = [];
        }
        else {
            outputs = await this.getStackOutput(sls);
        }
        return {
            result: success,
            outputs: outputs
        };
    }
}
exports.Serverless = Serverless;
