import { IsUUID } from "class-validator";

export class PostReceiptDto {
    @IsUUID()
    id: string;
}