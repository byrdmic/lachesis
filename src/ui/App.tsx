import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { loadConfig, type ConfigLoadResult } from "../config/config.ts";
import { NewProjectFlow } from "./NewProject/index.tsx";
import { DebugLog } from "./components/index.ts";
import { debugLog } from "../debug/logger.ts";
import type { LachesisConfig } from "../config/types.ts";

type AppProps = {
  command: "new";
  debug?: boolean;
};

type AppState =
  | { phase: "loading" }
  | { phase: "config_created"; config: LachesisConfig; message: string }
  | { phase: "ready"; config: LachesisConfig }
  | { phase: "error"; error: string };

export function App({ command, debug = false }: AppProps) {
  const [state, setState] = useState<AppState>({ phase: "loading" });

  // Enable debug logging if flag is set
  useEffect(() => {
    debugLog.setEnabled(debug);
    if (debug) {
      debugLog.info("Debug mode enabled");
      debugLog.info("App starting", { command });
    }
  }, [debug, command]);

  useEffect(() => {
    const result = loadConfig();
    if (debug) {
      debugLog.debug("Config loaded", { status: result.status });
    }

    switch (result.status) {
      case "loaded":
        setState({ phase: "ready", config: result.config });
        break;
      case "created":
        setState({
          phase: "config_created",
          config: result.config,
          message: result.message,
        });
        // Auto-advance after showing message
        setTimeout(() => {
          setState({ phase: "ready", config: result.config });
        }, 2000);
        break;
      case "error":
        setState({ phase: "error", error: result.error });
        break;
    }
  }, []);

  // Wrapper component for debug layout
  const withDebugPanel = (content: React.ReactNode) => {
    if (!debug) return content;
    return (
      <Box flexDirection="column" height="100%">
        <Box flexDirection="column" flexGrow={1}>
          {content}
        </Box>
        <DebugLog maxLines={6} />
      </Box>
    );
  };

  if (state.phase === "loading") {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading Lachesis...</Text>
      </Box>
    );
  }

  if (state.phase === "error") {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {state.error}</Text>
      </Box>
    );
  }

  if (state.phase === "config_created") {
    return withDebugPanel(
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          First-time setup complete!
        </Text>
        <Text>{"\n"}</Text>
        <Text dimColor>{state.message}</Text>
        <Text>{"\n"}</Text>
        <Text color="cyan">Starting interview...</Text>
      </Box>
    );
  }

  // Ready state
  if (command === "new") {
    return withDebugPanel(<NewProjectFlow config={state.config} debug={debug} />);
  }

  return withDebugPanel(
    <Box>
      <Text color="red">Unknown command: {command}</Text>
    </Box>
  );
}
