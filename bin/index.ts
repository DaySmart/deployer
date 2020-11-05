#!/usr/bin/env node
const deployer = require('../lib/deployer');
const minimist = require('minimist');

const run = async () => {
    const args = minimist(process.argv);
    process.argv.forEach(arg => delete process.argv[process.argv.indexOf(arg)]);
    const file = args._[3];
    const command = args._[2];
    const deploy = new deployer(command, file);
    await deploy.run();
}

run();