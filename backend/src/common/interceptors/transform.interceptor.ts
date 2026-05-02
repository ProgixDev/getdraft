import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;

        // 204 No Content must not have a body.
        if (statusCode === 204 || data === undefined) {
          return undefined;
        }

        // Don't wrap pre-formatted responses (paginated, redirects, etc.).
        if (data && (data.statusCode || data.cards || data.checkoutUrl)) {
          return data;
        }

        return { statusCode, data };
      }),
    );
  }
}
