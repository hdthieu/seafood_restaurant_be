import { IsBase64, IsIn, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CheckWithFaceDto {
  @IsString() @IsNotEmpty() scheduleId!: string;
  @IsIn(["IN","OUT"]) checkType!: "IN"|"OUT";

  @IsNumber() lat!: number;
  @IsNumber() lng!: number;
  @IsNumber() accuracy!: number;
  @IsString() netType!: string;

  @IsBase64() imageBase64!: string; // hoặc bỏ nếu bạn verify trước
  clientTs!: number;
}
