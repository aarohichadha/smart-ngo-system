type PipelineLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

const PIPELINE_LOG_ENDPOINT = import.meta.env.VITE_PIPELINE_LOG_SERVER_URL || 'http://localhost:8787/log';
const PIPELINE_PREFIXES = ['[RunAgents]', '[Orchestrator]', '[Matching]'];
let installed = false;

const shouldForward = (args: unknown[]) => {
  const first = args[0];
  if (typeof first !== 'string') {
    return false;
  }
  return PIPELINE_PREFIXES.some((prefix) => first.startsWith(prefix));
};

const sendToServer = (level: PipelineLogLevel, args: unknown[]) => {
  if (!shouldForward(args)) return;

  const [message, ...rest] = args;
  const details = rest.length > 0
    ? {
        args: rest.map((item) => {
          if (item instanceof Error) {
            return { name: item.name, message: item.message, stack: item.stack };
          }
          return item;
        }),
      }
    : undefined;

  void fetch(PIPELINE_LOG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scope: 'PIPELINE',
      level,
      message: String(message),
      details,
    }),
  }).catch(() => {
    // Intentionally ignore network failures so debugging never breaks the app.
  });
};

export const installPipelineConsoleForwarder = (): void => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    sendToServer('log', args);
  };

  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    sendToServer('info', args);
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    sendToServer('warn', args);
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    sendToServer('error', args);
  };

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    sendToServer('debug', args);
  };
};
