
          import { Page } from './Page'; // Circular dependency loop!
          export function helper() {
            console.log('helper');
          }
        