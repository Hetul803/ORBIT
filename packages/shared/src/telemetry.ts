interface PrivateTelemetryEvent {
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: unknown;
  message?: unknown;
  logentry?: unknown;
  server_name?: unknown;
  tags?: Record<string, unknown>;
  transaction?: string;
  exception?: {
    values?: {
      value?: string;
      stacktrace?: { frames?: { vars?: unknown }[] };
    }[];
  };
  spans?: { data?: unknown; description?: string }[];
}

/** Sentry v11 defaults are permissive; collect no user, payload, model or queue data. */
export const privateTelemetryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  stackFrameVariables: false,
  frameContextLines: 0,
};

/** Retain source locations and correlation IDs, never arbitrary request/error context. */
export const scrubTelemetryEvent = <T extends PrivateTelemetryEvent>(event: T): T => {
  delete event.user;
  delete event.request;
  delete event.extra;
  delete event.contexts;
  delete event.breadcrumbs;
  delete event.message;
  delete event.logentry;
  delete event.server_name;
  if (event.transaction !== undefined) event.transaction = 'ORBIT operation';
  for (const key of Object.keys(event.tags ?? {})) {
    if (!['requestId', 'job', 'release', 'environment', 'service'].includes(key))
      delete event.tags?.[key];
  }
  for (const exception of event.exception?.values ?? []) {
    exception.value = 'Error details omitted; use source location and request ID.';
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  for (const span of event.spans ?? []) {
    delete span.data;
    delete span.description;
  }
  return event;
};
