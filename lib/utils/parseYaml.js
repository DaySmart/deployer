"use strict";
const fs = require('fs');
const yaml = require('js-yaml');
const resolve = require('json-refs').resolveRefs;
module.exports = (file) => {
    const doc = yaml.load(fs.readFileSync(file, 'utf-8'));
    return doc;
};
