/**
 * React TypeScript Declaration File
 * 
 * This file provides basic type definitions for React to satisfy the TypeScript compiler.
 * In a real-world project, you would typically install the @types/react package.
 */

import * as React from 'react';

// This declaration file fixes compatibility issues between JSX.Element and React.ReactNode
// These types are essentially compatible but TypeScript has issues with their direct usage

declare global {
  namespace JSX {
    // Make JSX.Element extend React.ReactElement for better type compatibility
    interface Element extends React.ReactElement<any, any> {}
  }
}

// Augment React modules
declare module 'react' {
  // Make ReactNode accept Element (the built-in React 18 types have issues with this)
  interface ReactNode {
    _reactNodeBrand?: any;
  }

  // Define the core React namespace
  export = React;
  export as namespace React;

  namespace React {
    // Basic types for React components
    type ReactNode = 
      | React.ReactElement
      | string
      | number
      | boolean
      | null
      | undefined
      | React.ReactNodeArray;
    
    interface ReactNodeArray extends Array<ReactNode> {}
    
    interface ReactElement<P = any> {
      type: string | ComponentType<P>;
      props: P;
      key: string | null;
    }
    
    // Component types
    type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>;
    
    interface ComponentClass<P = {}, S = {}> {
      new(props: P): Component<P, S>;
      displayName?: string;
    }
    
    interface FunctionComponent<P = {}> {
      (props: P): ReactElement | null;
      displayName?: string;
    }
    
    // Component base class
    class Component<P = {}, S = {}> {
      constructor(props: P);
      readonly props: Readonly<P>;
      state: Readonly<S>;
      setState(state: S | ((prevState: S, props: P) => S), callback?: () => void): void;
      forceUpdate(callback?: () => void): void;
      render(): ReactNode;
    }
    
    // Hooks
    function useState<T>(initialState: T | (() => T)): [T, (newState: T | ((prevState: T) => T)) => void];
    function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
    function useContext<T>(context: Context<T>): T;
    function useReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S): [S, (action: A) => void];
    function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
    function useMemo<T>(factory: () => T, deps: readonly any[]): T;
    function useRef<T>(initialValue: T): { current: T };
    
    // Context API
    interface Context<T> {
      Provider: Provider<T>;
      Consumer: Consumer<T>;
      displayName?: string;
    }
    
    interface Provider<T> {
      props: {
        value: T;
        children?: ReactNode;
      };
    }
    
    interface Consumer<T> {
      props: {
        children: (value: T) => ReactNode;
      };
    }
    
    function createContext<T>(defaultValue: T): Context<T>;
    
    // Event types
    interface SyntheticEvent<T = Element> {
      bubbles: boolean;
      cancelable: boolean;
      currentTarget: T;
      defaultPrevented: boolean;
      eventPhase: number;
      isTrusted: boolean;
      nativeEvent: Event;
      preventDefault(): void;
      stopPropagation(): void;
      target: EventTarget;
      timeStamp: number;
      type: string;
    }
    
    interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
      target: EventTarget & {
        value: string;
        checked?: boolean;
        name?: string;
        type?: string;
      };
    }
  }
}

// JSX namespace for TypeScript to understand JSX syntax
declare namespace JSX {
  interface ElementAttributesProperty {
    props: {};
  }
  
  interface ElementChildrenAttribute {
    children: {};
  }
  
  interface IntrinsicElements {
    // HTML elements
    div: any;
    span: any;
    h1: any;
    h2: any;
    h3: any;
    p: any;
    a: any;
    button: any;
    input: any;
    select: any;
    option: any;
    label: any;
    form: any;
    ul: any;
    li: any;
    img: any;
    // Add more HTML elements as needed
  }
} 