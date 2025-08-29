import { HttpException } from "@nestjs/common";
import { ValidationError } from "class-validator";

export class CustomValidationError extends Error {
    errors: ValidationError[];
    constructor(errors: ValidationError[]) {
        super();
        this.errors = errors;
    }
}

export function getErrorMessage(e: any): string {
    if (e instanceof HttpException) {
      return e.message;
    } else if (e instanceof Error) {
      return e.message;
    } else {
      return JSON.stringify(e);
    }
}