import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Anything that is not an HttpException is a bug or a dependency failing.
    // The client gets a bare 500, so the cause has to reach the logs: this
    // filter replaces Nest's default one, and without this line such errors
    // were returned to the app and recorded nowhere.
    if (!(exception instanceof HttpException)) {
      const request = ctx.getRequest();
      this.logger.error(
        `${request?.method ?? ''} ${request?.url ?? ''} failed: ${
          exception instanceof Error
            ? (exception.stack ?? exception.message)
            : String(exception)
        }`,
      );
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      message:
        typeof message === 'string'
          ? message
          : (message as any)?.message || 'Internal server error',
      error:
        typeof message === 'object' && (message as any)?.error
          ? (message as any).error
          : undefined,
      timestamp: new Date().toISOString(),
    };

    response.status(status).send(errorResponse);
  }
}
