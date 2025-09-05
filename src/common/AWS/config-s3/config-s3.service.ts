import {
    S3Client,
    PutObjectCommand,
    PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { extname } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class ConfigS3Service {
    private s3: S3Client;
    private bucket: string;

    constructor() {
        this.s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
        });
        this.bucket = process.env.AWS_BUCKET_NAME!;
    }

    async uploadFile(base64: string, folder = 'menu-items'): Promise<string> {
        const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const type = base64.match(/^data:image\/(\w+);base64/)?.[1] || 'png';
        const filename = `${folder}/${uuid()}${extname(`.${type}`)}`;

        const uploadParams: PutObjectCommandInput = {
            Bucket: this.bucket,
            Key: filename,
            Body: buffer,
            ContentEncoding: 'base64',
            ContentType: `image/${type}`
        };

        await this.s3.send(new PutObjectCommand(uploadParams));

        return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
    }
}