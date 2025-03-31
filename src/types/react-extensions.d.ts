import React from 'react';

// Extend React.ReactNode to include JSX.Element types
declare module 'react' {
  interface ReactNodeArray extends Array<ReactNode> {}
  
  type ReactFragment = ReactNodeArray | {} | Iterable<ReactNode>;
  
  type ReactNode = 
    | React.ReactElement 
    | string 
    | number 
    | ReactFragment 
    | boolean 
    | null 
    | undefined
    | JSX.Element
    | JSX.Element[];
} 