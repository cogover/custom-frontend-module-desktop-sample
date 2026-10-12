import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Desktop } from './desktop/Desktop';
import { applyStoredTheme } from './hooks/useTheme';
import './fonts.css';
import './tailwind.css';
import './styles.css';

export function bootstrap(container: HTMLElement | null = document.getElementById('root')): Root {
  if (!container) throw new Error('Không tìm thấy phần tử #root để hiển thị ứng dụng.');
  applyStoredTheme();
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Desktop />
    </StrictMode>,
  );
  return root;
}

export const appRoot = bootstrap();
