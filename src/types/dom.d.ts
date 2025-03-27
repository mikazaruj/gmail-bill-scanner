// Custom DOM type definitions for React 18
interface HTMLElement {
  // Add any additional properties or methods if needed
}

// This type augmentation helps React 18's createRoot method
declare module 'react-dom/client' {
  export function createRoot(
    container: HTMLElement | Document | DocumentFragment | Element | null,
    options?: any
  ): {
    render(children: React.ReactNode): void;
    unmount(): void;
  };
} 