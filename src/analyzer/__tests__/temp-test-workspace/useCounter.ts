
      import { useState } from 'react';
      export function useCounter() {
        const [count, setCount] = useState(0);
        const increment = () => setCount(count + 1);
        return { count, increment };
      }
    