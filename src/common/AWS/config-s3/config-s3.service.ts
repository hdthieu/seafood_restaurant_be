// src/s3/config-s3.service.ts
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

// Lưu lại Date methods gốc trước khi bị override trong main.ts
const OriginalDateToISOString = Date.prototype.toISOString;
const OriginalDateToJSON = Date.prototype.toJSON;

@Injectable()
export class ConfigS3Service {
    private readonly s3: S3Client;
    private readonly bucket: string;
    private readonly region: string;
    private readonly logger = new Logger(ConfigS3Service.name);

    constructor() {
        this.region = process.env.S3_REGION!;
        this.bucket = process.env.AWS_BUCKET_NAME!;

        // CRITICAL FIX: Tạm thời restore Date methods gốc
        // Vì main.ts override Date.prototype.toISOString làm AWS signature sai
        const customToISOString = Date.prototype.toISOString;
        const customToJSON = Date.prototype.toJSON;

        Date.prototype.toISOString = OriginalDateToISOString;
        Date.prototype.toJSON = OriginalDateToJSON;

        this.s3 = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
            },
        });

        // Khôi phục lại custom Date methods sau khi tạo S3Client
        Date.prototype.toISOString = customToISOString;
        Date.prototype.toJSON = customToJSON;

        this.logger.log(`S3 Client initialized successfully`);
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

        // CRITICAL: Restore Date methods gốc khi gọi AWS API
        // Vì main.ts override Date.prototype.toISOString làm signature sai
        const customToISOString = Date.prototype.toISOString;
        const customToJSON = Date.prototype.toJSON;

        try {
            Date.prototype.toISOString = OriginalDateToISOString;
            Date.prototype.toJSON = OriginalDateToJSON;

            await this.s3.send(new PutObjectCommand(put));
            return Key;
        } finally {
            // Luôn khôi phục lại custom methods
            Date.prototype.toISOString = customToISOString;
            Date.prototype.toJSON = customToJSON;
        }
    }

    /** (tuỳ chọn) Tạo URL public S3 theo region/bucket nếu object public/qua CDN */
    makeS3Url(key: string) {
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
}
