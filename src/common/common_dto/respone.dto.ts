import { HttpException, HttpStatus } from "@nestjs/common";

// src/common/common_dto/respone.dto.ts
export class ResponseCommon<T, M = any> {
  constructor(
    public code: number,
    public success: boolean,
    public message: string,
    public data: T | null = null,
    public meta?: M,  
    public errorMessage?: any,
  ) { }
}

export class ResponseException extends HttpException {
  constructor(error?: any, status: number = 500, customMessage?: string) {
    super(
      {
        success: false,
        code: status,
        message: customMessage || (error?.message ?? 'INTERNAL_SERVER_ERROR'),
        errorMessage: error,
        data: null,
      },
      status as HttpStatus,
    );
  }
}
