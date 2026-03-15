import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowDown, FiLock, FiUnlock } from 'react-icons/fi';

interface AgentTerminalProps {
  agentId: string;
  /** Whether the agent process is still running */
  isRunning: boolean;
}

/**
 * Live terminal view for an agent, rendering node-pty output via xterm.js.
 * Supports auto-scroll, text selection, copy, web links, search, and fit-to-container.
 */
export function AgentTerminal({ agentId, isRunning }: AgentTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isRunningRef = useRef(isRunning);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Keep isRunning ref in sync
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0f172a', // slate-900
        foreground: '#f8fafc', // slate-50
        cursor: '#60a5fa', // blue-400
        cursorAccent: '#0f172a',
        selectionBackground: '#334155', // slate-700
        selectionForeground: '#f8fafc',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      convertEol: true,
    });

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank');
    });
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    // Open terminal in the DOM
    term.open(terminalRef.current);

    // Fit to container
    try {
      fitAddon.fit();
    } catch {
      // Ignore fit errors during initial render
    }

    // Store refs
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Track scroll position for auto-scroll toggle
    term.onScroll(() => {
      const buffer = term.buffer.active;
      const atBottom = buffer.viewportY >= buffer.baseY;
      setIsAtBottom(atBottom);
    });

    // Handle user input - send to agent's pty via ref to avoid stale closure
    term.onData((data) => {
      if (isRunningRef.current) {
        window.electronAPI.agentWrite(agentId, data);
      }
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        // Notify main process of terminal resize
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          window.electronAPI.agentResize(agentId, cols, rows);
        }
      } catch {
        // Ignore resize errors
      }
    });

    resizeObserver.observe(terminalRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [agentId]);

  // Load existing output buffer and subscribe to live output
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;

    // Load existing buffered output
    const loadExistingOutput = async () => {
      try {
        const result = await window.electronAPI.agentOutput(agentId);
        if (result.data && result.data.length > 0) {
          for (const line of result.data) {
            term.write(line);
          }
          // Scroll to bottom after loading history
          if (autoScroll) {
            term.scrollToBottom();
          }
        }
      } catch (err) {
        console.error('Failed to load agent output:', err);
      }
    };

    loadExistingOutput();

    // Subscribe to live terminal output
    const handleOutput = (data: { agentId: string; data: string }) => {
      if (data.agentId === agentId && xtermRef.current) {
        xtermRef.current.write(data.data);
        if (autoScroll) {
          xtermRef.current.scrollToBottom();
        }
      }
    };

    window.electronAPI.onAgentOutput(handleOutput);

    return () => {
      window.electronAPI.removeAllListeners('agent:output');
    };
  }, [agentId, autoScroll]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.scrollToBottom();
      setAutoScroll(true);
    }
  }, []);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
    if (!autoScroll && xtermRef.current) {
      xtermRef.current.scrollToBottom();
    }
  }, [autoScroll]);

  return (
    <div className="flex flex-col h-full">
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}
          />
          <span className="text-xs text-slate-400">{isRunning ? 'Live' : 'Session ended'}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Auto-scroll toggle */}
          <button
            type="button"
            onClick={toggleAutoScroll}
            className={`rounded p-1 text-xs transition-colors ${
              autoScroll
                ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
            }`}
            title={
              autoScroll ? 'Auto-scroll ON (click to disable)' : 'Auto-scroll OFF (click to enable)'
            }
          >
            {autoScroll ? <FiUnlock className="h-3.5 w-3.5" /> : <FiLock className="h-3.5 w-3.5" />}
          </button>

          {/* Scroll to bottom button */}
          {!isAtBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="rounded p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              title="Scroll to bottom"
            >
              <FiArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        style={{ padding: '4px' }}
        data-testid="agent-terminal"
      />
    </div>
  );
}
