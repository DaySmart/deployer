"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const client = new aws_sdk_1.SNS();
module.exports = {
    async publishJobRunFinishedMessage(jobRunFinishedResult) {
        const params = {
            Message: JSON.stringify(jobRunFinishedResult),
            TopicArn: process.env.JOB_RUN_FINISHED_TOPIC_ARN
        };
        await client.publish(params).promise();
    }
};
