export const theme = {
  colors: {
    primary: '#7C5DFA',
    primaryLight: '#9277FF',
    secondary: '#1E2139',
    background: '#141625',
    surface: '#1E2139',
    text: '#DFE3FA',
    textSecondary: '#888EB0',
    success: '#33D69F',
    error: '#FF5252',
    border: '#252945',
  },
  shadows: {
    small: '0 2px 4px rgba(0, 0, 0, 0.1)',
    medium: '0 4px 6px rgba(0, 0, 0, 0.1)',
    large: '0 8px 16px rgba(0, 0, 0, 0.1)',
  },
  transitions: {
    default: '0.3s ease',
    fast: '0.15s ease',
    slow: '0.5s ease',
  },
  borderRadius: {
    small: '4px',
    medium: '8px',
    large: '12px',
    round: '50%',
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    h1: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    body: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    small: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
  },
} as const; 