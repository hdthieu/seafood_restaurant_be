import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from 'rxjs/operators';
import * as logSymbols from 'log-symbols';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly name = 'HTTP-Log'
    private logger = new Logger(this.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const now = Date.now();
        const ctx = context.switchToHttp();
        const request = ctx.getRequest<Request>();
        const userAgent = request.headers['user-agent'];
        let log = `
            *********************************************************************************
            *      API Request  | [${request.method} -${request.url}] | REQ-${now}
            *                   | [Agent] ${userAgent}`;
        return next
            .handle()
            .pipe(tap(() => {
                // this.logger.log(`[REQ-${now}][Data] ${JSON.stringify(request.body)}`);
                // this.logger.log(`============== <API Response> ============ | [REQ-${now}] | ${Date.now() - now} ms ${logSymbols.success}`);
                log += `
            *                   | [Data] ${JSON.stringify(request.body)}
            *      API Response | ${logSymbols.success} in ${Date.now() - now} ms 
            *********************************************************************************
                `;
                this.logger.log(log);
            }, () => {
                log += `
            *                   | [Data] ${JSON.stringify(request.body)}
            *      API Response | ${logSymbols.error} in ${Date.now() - now} ms 
            *********************************************************************************
                `;
                this.logger.log(log);
            }))
    }
}