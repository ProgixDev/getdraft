import React from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  StatusBar,
  SafeAreaView,
} from "react-native";

// ---------------------------------------------------------------------------
// Global JS-error handler (module scope, installed once at import time).
// React Error Boundaries only catch errors thrown during render / lifecycle /
// hook calls — async or event-handler errors slip past. This handler captures
// those, stashes them on globalThis, and notifies any mounted ErrorBoundary
// so a release APK still shows the message on screen with no debugger needed.
// ---------------------------------------------------------------------------
type GlobalErrorListener = (msg: string) => void;
const listeners = new Set<GlobalErrorListener>();
let lastGlobalErrorMsg: string | null = null;

const _eu: any = (global as any).ErrorUtils;
if (_eu?.getGlobalHandler && _eu?.setGlobalHandler) {
  const _prev = _eu.getGlobalHandler();
  _eu.setGlobalHandler((e: any, isFatal: boolean) => {
    const msg = `${e?.message || String(e)}\n${e?.stack || ""}`.trim();
    lastGlobalErrorMsg = msg;
    (globalThis as any).__LAST_ERROR__ = msg;
    for (const l of listeners) {
      try {
        l(msg);
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
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = {
    error: null,
    info: null,
    globalError: lastGlobalErrorMsg,
  };
  private unsubscribe?: () => void;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info });
  }

  componentDidMount() {
    const listener: GlobalErrorListener = (msg) =>
      this.setState({ globalError: msg });
    listeners.add(listener);
    this.unsubscribe = () => listeners.delete(listener);
    // Pick up anything that landed before this boundary mounted.
    if (lastGlobalErrorMsg && lastGlobalErrorMsg !== this.state.globalError) {
      this.setState({ globalError: lastGlobalErrorMsg });
    }
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { error, info, globalError } = this.state;
    const hasRenderError = !!error;
    const hasGlobalError = !!globalError;

    if (!hasRenderError && !hasGlobalError) {
      return this.props.children as React.ReactElement;
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
});

export default ErrorBoundary;
