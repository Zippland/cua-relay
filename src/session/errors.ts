export class SessionExecutorClosedError extends Error {
  readonly code = "SESSION_EXECUTOR_CLOSED";

  constructor() {
    super("Computer Use session executor is closed");
    this.name = "SessionExecutorClosedError";
  }
}

export class InvalidSessionRequestError extends Error {
  readonly code = "INVALID_SESSION_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "InvalidSessionRequestError";
  }
}

export class FreshStateRequiredError extends Error {
  readonly code = "FRESH_STATE_REQUIRED";

  constructor(app: string) {
    super(`No fresh state for ${app}. Call get_app_state for the same app immediately before retrying.`);
    this.name = "FreshStateRequiredError";
  }
}

export class AppMismatchError extends Error {
  readonly code = "APP_MISMATCH";
  readonly expectedApp: string;
  readonly receivedApp: string;

  constructor(expectedApp: string, receivedApp: string) {
    super(
      `Fresh state belongs to ${expectedApp}, not ${receivedApp}. Call get_app_state for the target app before retrying.`,
    );
    this.name = "AppMismatchError";
    this.expectedApp = expectedApp;
    this.receivedApp = receivedApp;
  }
}

export class StateExpiredError extends Error {
  readonly code = "STATE_EXPIRED";
  readonly app: string;

  constructor(app: string) {
    super(`Fresh state for ${app} expired. Call get_app_state again before retrying.`);
    this.name = "StateExpiredError";
    this.app = app;
  }
}

export class SessionCleanupError extends Error {
  readonly code = "SESSION_CLEANUP_FAILED";

  constructor(cause: unknown) {
    super("Official Computer Use session cleanup failed", { cause });
    this.name = "SessionCleanupError";
  }
}
