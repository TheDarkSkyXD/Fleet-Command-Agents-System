import log from 'electron-log';

/**
 * Claude CLI stream-json event types.
 * The CLI outputs newline-delimited JSON when invoked with --output-format stream-json.
 */

export interface StreamJsonUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Base event interface shared by all stream-json events */
export interface StreamJsonEventBase {
  type: string;
  timestamp?: string;
  session_id?: string;
}

/** System/init event at the start of a session */
export interface SystemEvent extends StreamJsonEventBase {
  type: 'system';
  subtype?: string;
  message?: string;
}

/** Assistant text message event */
export interface AssistantMessageEvent extends StreamJsonEventBase {
  type: 'assistant';
  message?: string;
  content?: unknown;
  usage?: StreamJsonUsage;
}

/** Tool use request from the assistant */
export interface ToolUseEvent extends StreamJsonEventBase {
  type: 'tool_use';
  name: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}

/** Tool result returned after execution */
export interface ToolResultEvent extends StreamJsonEventBase {
  type: 'tool_result';
  name: string;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  duration_ms?: number;
}

/** Content block start (streaming API format) */
export interface ContentBlockStartEvent extends StreamJsonEventBase {
  type: 'content_block_start';
  index?: number;
  content_block?: {
    type: string;
    name?: string;
    id?: string;
    input?: Record<string, unknown>;
    text?: string;
  };
}

/** Content block delta (streaming incremental update) */
export interface ContentBlockDeltaEvent extends StreamJsonEventBase {
  type: 'content_block_delta';
  index?: number;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
}

/** Content block stop (end of a content block) */
export interface ContentBlockStopEvent extends StreamJsonEventBase {
  type: 'content_block_stop';
  index?: number;
  content_block?: {
    type: string;
    name?: string;
  };
  duration_ms?: number;
}

/** Message start event */
export interface MessageStartEvent extends StreamJsonEventBase {
  type: 'message_start';
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: StreamJsonUsage;
  };
}

/** Message delta event (usage updates, stop reason) */
export interface MessageDeltaEvent extends StreamJsonEventBase {
  type: 'message_delta';
  delta?: {
    stop_reason?: string;
  };
  usage?: StreamJsonUsage;
}

/** Message stop event */
export interface MessageStopEvent extends StreamJsonEventBase {
  type: 'message_stop';
}

/** Final result event with aggregated usage */
export interface ResultEvent extends StreamJsonEventBase {
  type: 'result';
  subtype?: string;
  result?: string;
  is_error?: boolean;
  usage?: StreamJsonUsage;
  duration_ms?: number;
  num_turns?: number;
}

/** Error event */
export interface ErrorEvent extends StreamJsonEventBase {
  type: 'error';
  error?: {
    type?: string;
    message?: string;
  };
}

/** Union type of all recognized stream-json events */
export type StreamJsonEvent =
  | SystemEvent
  | AssistantMessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ResultEvent
  | ErrorEvent;

/** Callback invoked for each successfully parsed event */
export type StreamJsonEventHandler = (event: StreamJsonEvent) => void;

/**
 * StreamJsonParser handles parsing of newline-delimited JSON output from Claude CLI.
 *
 * It buffers incoming data (which may arrive in arbitrary chunks from node-pty),
 * extracts complete lines, attempts to parse each as JSON, and dispatches typed
 * events via the registered handler callback.
 *
 * Malformed lines (non-JSON terminal output, ANSI escape sequences, partial lines)
 * are silently ignored — they never crash the parser.
 */
export class StreamJsonParser {
  private lineBuffer = '';
  private handler: StreamJsonEventHandler | null = null;
  private parsedCount = 0;
  private errorCount = 0;

  /**
   * Register an event handler. Only one handler is supported at a time.
   */
  onEvent(handler: StreamJsonEventHandler): void {
    this.handler = handler;
  }

  /**
   * Feed raw data from the pty stream into the parser.
   * Data may contain multiple lines, partial lines, or non-JSON content.
   */
  feed(data: string): StreamJsonEvent[] {
    const events: StreamJsonEvent[] = [];

    // Accumulate data into line buffer
    this.lineBuffer += data;

    // Split on newlines and process complete lines
    const lines = this.lineBuffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const event = this.parseLine(line);
      if (event) {
        events.push(event);
        this.parsedCount++;

        // Dispatch to handler if registered
        if (this.handler) {
          try {
            this.handler(event);
          } catch (err) {
            log.warn('[StreamJsonParser] Handler threw error:', err);
          }
        }
      }
    }

    return events;
  }

  /**
   * Attempt to parse a single line as a stream-json event.
   * Returns null for non-JSON lines (expected for terminal output).
   */
  private parseLine(line: string): StreamJsonEvent | null {
    const trimmed = this.stripAnsi(line).trim();

    // Skip empty lines and lines that clearly aren't JSON
    if (!trimmed || !trimmed.startsWith('{')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);

      // Validate it has a recognizable structure (at minimum an object)
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      // Return as typed event — the type field determines the variant
      return parsed as StreamJsonEvent;
    } catch {
      // Not valid JSON — this is normal for ANSI-decorated or partial output
      this.errorCount++;
      return null;
    }
  }

  /**
   * Strip ANSI escape sequences from a string.
   * PTY output often contains color codes that wrap JSON lines.
   */
  private stripAnsi(str: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI stripping
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
  }

  /**
   * Extract token usage from an event if present.
   * Works with result events, message_delta events, and assistant events.
   */
  static extractUsage(event: StreamJsonEvent): StreamJsonUsage | null {
    if ('usage' in event && event.usage) {
      return event.usage;
    }
    if (event.type === 'message_start' && event.message?.usage) {
      return event.message.usage;
    }
    return null;
  }

  /**
   * Get parser statistics for diagnostics.
   */
  getStats(): { parsedCount: number; errorCount: number; bufferLength: number } {
    return {
      parsedCount: this.parsedCount,
      errorCount: this.errorCount,
      bufferLength: this.lineBuffer.length,
    };
  }

  /**
   * Reset the parser state (e.g., between sessions).
   */
  reset(): void {
    this.lineBuffer = '';
    this.parsedCount = 0;
    this.errorCount = 0;
  }
}
