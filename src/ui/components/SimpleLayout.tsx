import React, { useState, useEffect, createContext, useContext } from 'react'
import { Box, useStdout } from 'ink'

type SimpleLayoutContextValue = {
  terminalWidth: number
  terminalHeight: number
}

const SimpleLayoutContext = createContext<SimpleLayoutContextValue | null>(null)

export function useSimpleLayout(): SimpleLayoutContextValue {
  const context = useContext(SimpleLayoutContext)
  if (!context) {
    throw new Error('useSimpleLayout must be used within a SimpleLayout')
  }
  return context
}

type SimpleLayoutProps = {
  statusBar: React.ReactNode
  commandArea?: React.ReactNode
  children: React.ReactNode
}

/**
 * Simple layout component with status bar at bottom.
 *
 * Structure:
 * +--------------------------------------------------+
 * | Children (main content)                          |  <- Grows naturally
 * +--------------------------------------------------+
 * | Command Area (optional)                          |  <- Above status bar
 * +--------------------------------------------------+
 * | Status Bar                                       |  <- At bottom
 * +--------------------------------------------------+
 */
export function SimpleLayout({
  statusBar,
  commandArea,
  children,
}: SimpleLayoutProps) {
  const { stdout } = useStdout()
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns ?? 80)
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows ?? 24)

  useEffect(() => {
    const handleResize = () => {
      if (stdout) {
        setTerminalWidth(stdout.columns)
        setTerminalHeight(stdout.rows)
      }
    }
    stdout?.on('resize', handleResize)
    return () => {
      stdout?.off('resize', handleResize)
    }
  }, [stdout])

  return (
    <SimpleLayoutContext.Provider value={{ terminalWidth, terminalHeight }}>
      <Box flexDirection="column" width="100%">
        {/* Main content - grows naturally */}
        <Box flexDirection="column" width="100%">
          {children}
        </Box>

        {/* Command area - above status bar */}
        {commandArea && (
          <Box flexShrink={0} width="100%">
            {commandArea}
          </Box>
        )}

        {/* Status bar - at bottom */}
        <Box flexShrink={0} width="100%">
          {statusBar}
        </Box>
      </Box>
    </SimpleLayoutContext.Provider>
  )
}
