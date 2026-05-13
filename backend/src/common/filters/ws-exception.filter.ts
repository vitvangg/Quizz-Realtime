import { ExceptionFilter, Catch } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

@Catch(WsException)
export class WsExceptionFilter implements ExceptionFilter {
  catch(exception: WsException, client: any) {
    const error = exception.getError();

    let errorData: { code: string; message: string } = {
      code: 'WS_ERROR',
      message: 'WebSocket error occurred',
    };

    if (typeof error === 'string') {
      errorData.message = error;
    } else if (typeof error === 'object' && error !== null) {
      errorData = {
        code: (error as any).code || 'WS_ERROR',
        message: (error as any).message || 'WebSocket error occurred',
      };
    }

    client.emit('error', errorData);
  }
}
