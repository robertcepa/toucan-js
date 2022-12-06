import { Toucan } from 'toucan-js';
import { handler } from './handler';

type Env = {
  SENTRY_DSN: string;
};

export default {
  async fetch(request, env, context): Promise<Response> {
    const sentry = new Toucan({
      dsn: env.SENTRY_DSN,
      release: '1.0.0',
      context,
      request,
    });

    try {
      handler();
      return new Response('Hello!');
    } catch (e) {
      sentry.captureException(e);

      return new Response('Something went wrong! Team has been notified.', {
        status: 500,
      });
    }
  },
} as ExportedHandler<Env>;
