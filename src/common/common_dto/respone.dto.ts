import { ApiProperty } from "@nestjs/swagger";
import { IResponse } from "../Interfaces/respone.interface";
import { IsDefined, IsString } from "class-validator";
import { HttpException, HttpStatus } from "@nestjs/common";
import { getErrorMessage } from "../exceptions/custom-validation.error";

export class ResponseCommon<T> implements IResponse<T> {
  constructor(code: number, isSuccess: boolean, message: string, data: T | null = null) {
    this.code = code;
    this.success = isSuccess;
    this.message = message;
    this.data = data;
  }

  code: number;
  message: string;
  data: T | null;
  errorMessage: any;
  success: boolean;
}




export class OutVerifyAccountDto {
  @ApiProperty()
  @IsDefined() @IsString()
  message: string;

  @ApiProperty()
  user: any;
}

export class ResponseException extends HttpException {
  constructor(
    error?: any,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    customMessage?: string,
  ) {
    super(
      {
        success: false,
        code: status,
        message: customMessage || getErrorMessage(error),
        errorMessage: getErrorMessage(error),
        data: null,
      },
      status,
    );
  }
}
