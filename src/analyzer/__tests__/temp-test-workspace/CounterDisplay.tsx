
      import React from 'react';
      import { useCounter } from './useCounter';

      export default function CounterDisplay() {
        const { count, increment } = useCounter();
        return (
          <div>
            <span>{count}</span>
            <button onClick={increment}>Add</button>
          </div>
        );
      }
    