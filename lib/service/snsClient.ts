import { SNS } from 'aws-sdk';

const client = new SNS();

module.exports = {
    async publishJobRunFinishedMessage(jobRunFinishedResult: any) {
        const params: SNS.PublishInput = {
            Message: JSON.stringify(jobRunFinishedResult),
            TopicArn: process.env.JOB_RUN_FINISHED_TOPIC_ARN
        }
        
        await client.publish(params).promise();       
    }
}