import { IsBase64, IsNotEmpty } from "class-validator";
export class FaceImageDto {
  @IsBase64()
  @IsNotEmpty()
  imageBase64!: string;
}
