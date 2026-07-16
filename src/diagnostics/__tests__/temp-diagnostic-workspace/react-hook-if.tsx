
      import React, { useState } from 'react';
      
      export function Dashboard(props: { isAdmin: boolean }) {
        if (props.isAdmin) {
          const [role, setRole] = useState('admin');
        }
        return <div>Dashboard</div>;
      }
    