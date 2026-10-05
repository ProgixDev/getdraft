import React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
  StatusBar,
  SafeAreaView,
} from "react-native";
import * as Updates from "expo-updates";

// ---------------------------------------------------------------------------
// Global JS-error handler (module scope, installed once at import time).
// React Error Boundaries only catch errors thrown during render / lifecycle /
// hook calls — async or event-handler errors slip past. This handler captures
// those, stashes them on globalThis, and notifies any mounted ErrorBoundary.
// ---------------------------------------------------------------------------
type GlobalErrorListener = (msg: string, isFatal: boolean) => void;
const listeners = new Set<GlobalErrorListener>();
let lastGlobalErrorMsg: string | null = null;
let lastGlobalErrorFatal = false;

const _eu: any = (globalThis as any).ErrorUtils;
if (_eu?.getGlobalHandler && _eu?.setGlobalHandler) {
  const _prev = _eu.getGlobalHandler();
  _eu.setGlobalHandler((e: any, isFatal: boolean) => {
    const msg = `${e?.message || String(e)}\n${e?.stack || ""}`.trim();
    lastGlobalErrorMsg = msg;
    lastGlobalErrorFatal = !!isFatal;
    (globalThis as any).__LAST_ERROR__ = msg;
    for (const l of listeners) {
      try {
        l(msg, !!isFatal);
      } catch {
        /* never let a listener mask the original error */
      }
    }
    if (typeof _prev === "function") _prev(e, isFatal);
  });
}

interface State {
  error: Error | null;
  info: { componentStack?: string } | null;
  globalError: string | null;
  globalFatal: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = {
    error: null,
    info: null,
    globalError: lastGlobalErrorMsg,
    globalFatal: lastGlobalErrorFatal,
  };
  private unsubscribe?: () => void;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info });
  }

  componentDidMount() {
    const listener: GlobalErrorListener = (msg, isFatal) =>
      this.setState({ globalError: msg, globalFatal: isFatal });
    listeners.add(listener);
    this.unsubscribe = () => listeners.delete(listener);
    // Pick up anything that landed before this boundary mounted.
    if (lastGlobalErrorMsg && lastGlobalErrorMsg !== this.state.globalError) {
      this.setState({
        globalError: lastGlobalErrorMsg,
        globalFatal: lastGlobalErrorFatal,
      });
    }
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  /** Clear the error and render the app again from the top. */
  private retry = () => {
    lastGlobalErrorMsg = null;
    lastGlobalErrorFatal = false;
    this.setState({
      error: null,
      info: null,
      globalError: null,
      globalFatal: false,
    });
  };

  /** Reload the JS bundle; falls back to a plain retry where that is not possible. */
  private restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.retry();
    }
  };

  render() {
    const { error, info, globalError, globalFatal } = this.state;
    const hasRenderError = !!error;
    const hasGlobalError = !!globalError;

    if (!hasRenderError && !hasGlobalError) {
      return this.props.children as React.ReactElement;
    }

    // Release builds: people get a way back into the app, never a stack
    // trace. A non-fatal error from a callback or a promise does not take the
    // screen over at all -- the app is still usable, and replacing it with an
    // error page for a failed background request was the worse outcome.
    if (!__DEV__) {
      if (!hasRenderError && !globalFatal) {
        return this.props.children as React.ReactElement;
      }
      return (
        <SafeAreaView style={styles.root}>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
          <View style={styles.fallback}>
            <Text style={styles.fallbackTitle}>Something went wrong</Text>
            <Text style={styles.fallbackText}>
              GetDraft hit an unexpected problem. Try again, and if it keeps
              happening, restart the app.
            </Text>
            <Pressable
              onPress={this.retry}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={this.restart}
              hitSlop={12}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Restart the app"
            >
              <Text style={styles.secondaryButtonText}>Restart the app</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const title = hasRenderError ? "App error (debug)" : "Global error (debug)";
    const message = error?.message ? String(error.message) : "";
    const stack = (error?.stack || "").slice(0, 3000);
    const compStack = (info?.componentStack || "").slice(0, 3000);
    const globalMsg = (globalError || "").slice(0, 3000);

    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {message ? (
            <>
              <Text style={styles.label}>message</Text>
              <Text style={styles.body} selectable>
                {message}
              </Text>
            </>
          ) : null}
          {stack ? (
            <>
              <Text style={styles.label}>stack</Text>
              <Text style={styles.body} selectable>
                {stack}
              </Text>
            </>
          ) : null}
          {compStack ? (
            <>
              <Text style={styles.label}>component stack</Text>
              <Text style={styles.body} selectable>
                {compStack}
              </Text>
            </>
          ) : null}
          {globalMsg ? (
            <>
              <Text style={styles.label}>last global error</Text>
              <Text style={styles.body} selectable>
                {globalMsg}
              </Text>
            </>
          ) : null}
          <Pressable
            onPress={this.retry}
            style={styles.debugRetry}
            accessibilityRole="button"
          >
            <Text style={styles.debugRetryText}>Dismiss and retry</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  content: {
    padding: 20,
    paddingTop: 32,
    paddingBottom: 64,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FF6B6B",
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    color: "#FFD24D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    color: "#FFFFFF",
    fontFamily: "monospace",
    lineHeight: 18,
  },
  debugRetry: {
    marginTop: 28,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  debugRetryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
  },
  fallbackText: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginBottom: 28,
  },
  primaryButton: {
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A0A0A",
  },
  secondaryButton: {
    marginTop: 18,
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
  },
  pressed: {
    opacity: 0.7,
  },
});

export default ErrorBoundary;
