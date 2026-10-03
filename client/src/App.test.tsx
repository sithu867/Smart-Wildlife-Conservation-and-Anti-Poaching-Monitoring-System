import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders the application foundation', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByText('Smart wildlife conservation')).toBeInTheDocument();
});

test('renders ranger and manager route pages', async () => {
  render(
    <MemoryRouter initialEntries={['/manager/analytics']}>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByText('Analytics')).toBeInTheDocument();
});
