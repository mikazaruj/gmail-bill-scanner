/**
 * Custom React type definitions to fix type compatibility issues
 * between our components.
 */

// Add a global declaration for Element to make it compatible with ReactNode
declare global {
  namespace JSX {
    interface Element extends React.ReactElement<any, any> { }
  }
}

export {}; 