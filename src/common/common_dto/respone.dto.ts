import { ApiProperty } from "@nestjs/swagger";
import { IResponse } from "../Interfaces/respone.interface";
import { IsDefined, IsString } from "class-validator";
import { HttpException, HttpStatus } from "@nestjs/common";
import { getErrorMessage } from "../exceptions/custom-validation.error";

export class ResponseCommon<T> extends HttpException implements IResponse<T> {
  constructor(
    code: number,
    isSuccess: boolean,
    message: string,
    data: T | null = null,
    errorMessage?: any,
  ) {
    // payload trả về cho client
    const responseBody = {
      success: isSuccess,
      code,
      message,
      data,
      errorMessage,
    };

    // gọi HttpException để Nest/Swagger hiểu đúng
    super(responseBody, (code as HttpStatus) ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // vẫn giữ các field nếu bạn có chỗ khác dùng tới instance
    this.code = code;
    this.success = isSuccess;
    this.message = message;
    this.data = data;
    this.errorMessage = errorMessage;
  }

  code: number;
  message: string;
  data: T | null;
  errorMessage: any;
  success: boolean;
}

// Tiện: helper static để dùng gọn
export const Resp = {
  badRequest: (msg: string, data: any = null) =>
    new ResponseCommon(HttpStatus.BAD_REQUEST, false, msg, data),
  notFound: (msg: string, data: any = null) =>
    new ResponseCommon(HttpStatus.NOT_FOUND, false, msg, data),
  unauthorized: (msg: string, data: any = null) =>
    new ResponseCommon(HttpStatus.UNAUTHORIZED, false, msg, data),
  internal: (msg = "INTERNAL_SERVER_ERROR", data: any = null, err?: any) =>
    new ResponseCommon(HttpStatus.INTERNAL_SERVER_ERROR, false, msg, data, err),
};

// DTO khác giữ nguyên
export class OutVerifyAccountDto {
  @ApiProperty()
  @IsDefined() @IsString()
  message: string;

  @ApiProperty()
  user: any;
}

// Vẫn có thể dùng ResponseException nếu muốn
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