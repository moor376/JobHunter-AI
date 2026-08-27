/**
 * HTTP Timeout and Cancellation Utility for Job Source Adapters.
 * Enforces a hard maximum timeout ceiling of 10 seconds (10,000ms)
 * across all external HTTP requests.
 */

export const DEFAULT_ADAPTER_TIMEOUT_MS = 10_000;
export const MAX_ADAPTER_TIMEOUT_MS = 10_000;

export interface TimeoutControllerOptions {
  timeoutMs?: number;
  parentSignal?: AbortSignal;
}

export interface TimeoutControllerResult {
  controller: AbortController;
  signal: AbortSignal;
  effectiveTimeoutMs: number;
  cleanup: () => void;
}

/**
 * Resolves the effective timeout in milliseconds, enforcing a strict 10-second ceiling.
 */
export function resolveTimeoutMs(requestedTimeoutMs?: number): number {
  if (
    typeof requestedTimeoutMs === "number" &&
    Number.isFinite(requestedTimeoutMs) &&
    requestedTimeoutMs > 0
  ) {
    return Math.min(requestedTimeoutMs, MAX_ADAPTER_TIMEOUT_MS);
  }
  return DEFAULT_ADAPTER_TIMEOUT_MS;
}

/**
 * Creates an AbortController with an automatic timeout and optional parent signal linking.
 * Always call `cleanup()` in a `finally` block to release the timer.
 */
export function createTimeoutController(
  options: TimeoutControllerOptions = {},
): TimeoutControllerResult {
  const effectiveTimeoutMs = resolveTimeoutMs(options.timeoutMs);
  const controller = new AbortController();

  let timedOut = false;
  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new Error(
        `HTTP request timed out after ${effectiveTimeoutMs}ms (hard maximum limit: ${MAX_ADAPTER_TIMEOUT_MS}ms)`,
      ),
    );
  }, effectiveTimeoutMs);

  if (typeof timerId === "object" && typeof timerId.unref === "function") {
    timerId.unref();
  }

  let onParentAbort: (() => void) | undefined;
  if (options.parentSignal) {
    if (options.parentSignal.aborted) {
      clearTimeout(timerId);
      controller.abort(options.parentSignal.reason);
    } else {
      onParentAbort = () => {
        clearTimeout(timerId);
        controller.abort(options.parentSignal?.reason);
      };
      options.parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timerId);
    if (options.parentSignal && onParentAbort) {
      options.parentSignal.removeEventListener("abort", onParentAbort);
    }
  };

  return {
    controller,
    signal: controller.signal,
    effectiveTimeoutMs,
    cleanup,
  };
}

/**
 * Determines whether an error was caused by a timeout or abortion.
 */
export function isTimeoutError(err: unknown, controller?: AbortController): boolean {
  if (controller?.signal?.aborted) {
    return true;
  }
  if (err && typeof err === "object") {
    const errorObj = err as any;
    if (
      errorObj.name === "TimeoutError" ||
      errorObj.name === "AbortError" ||
      errorObj.code === 20 ||
      errorObj.code === "ABORT_ERR"
    ) {
      return true;
    }
    if (typeof errorObj.message === "string") {
      const msg = errorObj.message.toLowerCase();
      if (
        msg.includes("timed out") ||
        msg.includes("timeout") ||
        msg.includes("aborted") ||
        msg.includes("abort")
      ) {
        return true;
      }
    }
    if (errorObj.cause && isTimeoutError(errorObj.cause)) {
      return true;
    }
  }
  return false;
}
