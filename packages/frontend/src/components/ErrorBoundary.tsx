import React from 'react';

/**
 * Granica błędów aplikacji: wyjątek w jednym laboratorium nie może wywalić
 * całej platformy na czarny ekran. Użytkownik dostaje czytelny komunikat
 * i powrót do listy laboratoriów; szczegóły idą do konsoli (monitoring).
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Genesis OS] błąd interfejsu:', error, info.componentStack);
  }

  private reset = () => {
    window.location.hash = '';
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen" role="alert">
        <div className="error-icon" aria-hidden="true">
          ⚠️
        </div>
        <h1>Coś poszło nie tak</h1>
        <p>
          Ta symulacja napotkała nieoczekiwany błąd. Twoje pozostałe laboratoria działają — wróć do listy
          i spróbuj ponownie.
        </p>
        <p className="error-detail">{this.state.error.message}</p>
        <button className="chip-btn" onClick={this.reset}>
          ← Wróć do laboratoriów
        </button>
      </div>
    );
  }
}
