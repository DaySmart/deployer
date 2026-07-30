#!/usr/bin/env node
"use strict";
const deployer = require('../lib/deployer');
const minimist = require('minimist');
const run = async () => {
    const args = minimist(process.argv);
    // process.argv.forEach(arg => delete process.argv[process.argv.indexOf(arg)]);
    if (process.argv.length > 2) {
        process.argv = process.argv.slice(0, 2);
    }
    const file = (args._.length > 3) ? args._[3] : undefined;
    const command = (args._.length > 2) ? args._[2] : 'deploy';
    const deploy = new deployer(command, file);
    await deploy.run();
};
run();
