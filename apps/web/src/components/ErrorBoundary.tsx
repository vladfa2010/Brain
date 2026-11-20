import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'Inter, sans-serif' }}>
          <h2>Что-то сломалось</h2>
          <pre style={{ fontSize: 12, color: '#a8431f', whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
