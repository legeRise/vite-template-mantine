import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Studio } from './studio/Studio';

const router = createBrowserRouter([
  // All flow steps live in the Studio container which manages the step state.
  {
    path: '/',
    element: <Studio />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
