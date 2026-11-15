import type { Instrumentation } from 'next';

// The Node-only code lives in its own module and is loaded only on the Node runtime (Next's documented pattern),
// so it never reaches the edge bundle.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reportRequestError } = await import('./instrumentation-node');
    await reportRequestError(error, request, context.routePath);
  }
};
