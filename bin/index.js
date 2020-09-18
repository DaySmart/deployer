#!/usr/bin/env node
const deployer = require('../lib/deployer');

const run = async () => {
    const deploy = new deployer()
    await deploy.run();
}

run();