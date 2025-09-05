// src/s3/config-s3.service.ts
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ConfigS3Service {
    private readonly s3: S3Client;
    private readonly bucket: string;
    private readonly region: string;

    constructor() {
        this.region = process.env.AWS_REGION!;
        this.bucket = process.env.AWS_BUCKET_NAME!;

        this.s3 = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
        });
    }

    private extFromMime(mime?: string) {
        if (!mime) return '.bin';
        const map: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'image/svg+xml': '.svg',
        };
        return map[mime] ?? '.bin';
    }

    private makeKey(folder: string, ext: string) {
        const clean = (folder || 'uploads').replace(/^\/+|\/+$/g, '');
        const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
        return `${clean}/${uuid()}${dotExt}`;
    }

    /** Upload ảnh từ file (memoryStorage -> buffer). Trả về key S3. */
    async uploadBuffer(buffer: Buffer, mime?: string, folder = 'menu-items'): Promise<string> {
        const Key = this.makeKey(folder, this.extFromMime(mime));
        const put: PutObjectCommandInput = {
            Bucket: this.bucket,
            Key,
            Body: buffer,
            ContentType: mime,
            // KHÔNG set ACL — tránh AccessControlListNotSupported
            CacheControl: 'public, max-age=31536000, immutable',
        };
        await this.s3.send(new PutObjectCommand(put));
        return Key; // trả về key; nếu cần URL, ghép sau
    }

    /** (tuỳ chọn) Tạo URL public S3 theo region/bucket nếu object public/qua CDN */
    makeS3Url(key: string) {
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
}
