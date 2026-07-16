
      import React from 'react';
      
      export function ListUsers() {
        const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
        return (
          <ul>
            {users.map(u => (
              <li>{u.name}</li>
            ))}
          </ul>
        );
      }
    