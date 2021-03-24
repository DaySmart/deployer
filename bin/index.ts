#!/usr/bin/env node
const deployer = require('../lib/deployer');
const minimist = require('minimist');

// process.env.JOB_RUN_FINISHED_TOPIC_ARN = "arn:aws:sns:us-east-1:022393549274:frankenstack-prod-job-run-finished";
// process.env.COMPONENT_ENVIRONMENT = "dev";
// process.env.COMPONENT_PROVIDER = '{"Name":"cdk","Config":[{"Key":"constructPackage","Value":"@daysmart/cdk-environment-resources"},{"Key":"account","Value":"022393549274"},{"Key":"region","Value":"us-east-1"}]}';
// process.env.CDK_DEFAULT_REGION = "us-east-1";
// process.env.COMPONENT_NAME = "ecs-compute";
// process.env.DEPLOYMENT_GUID = "f353c1d8-ebd7-4a09-ad61-857fa94922a4";
// process.env.CDK_DEFAULT_ACCOUNT	= "022393549274";
// process.env.COMPONENT_INPUTS = '[{"Key":"vpcId","Value":"vpc-0470e96bf61191dd6"},{"Key":"stage","Value":"dev"},{"Key":"project","Value":"dsicollection"},{"Key":"instanceKeyName","Value":"DaySmart"}]';
// process.env.JOB_RUN_GUID = "605dbccf-bea5-4f1c-bcc4-29b0434bc693";

const run = async () => {
    const args = minimist(process.argv);
    // process.argv.forEach(arg => delete process.argv[process.argv.indexOf(arg)]);
    if(process.argv.length > 2) {
        process.argv = process.argv.slice(0, 2);
    }
    
    const file = (args._.length > 3) ? args._[3] : undefined;
    const command = (args._.length > 2) ? args._[2] : 'deploy';
    const deploy = new deployer(command, file);
    await deploy.run();
}

run();