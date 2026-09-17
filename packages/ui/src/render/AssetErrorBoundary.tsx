/* Proprietary / All Rights Reserved - Genesis OS */
import React from 'react';

interface Props { readonly children: React.ReactNode; readonly fallback?: React.ReactNode; }
interface State { readonly error: Error | null; }

export class AssetErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render(): React.ReactNode { return this.state.error ? (this.props.fallback ?? <div role="status">Asset fallback active.</div>) : this.props.children; }
}

export function LoadingPlaceholder({ label }: { readonly label: string }): React.ReactElement {
  return <div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#7d93ad', background: '#02050a' }}>{label}</div>;
}
