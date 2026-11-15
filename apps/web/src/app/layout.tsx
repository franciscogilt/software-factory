import type { ReactNode } from 'react';

export const metadata = { title: 'Software Factory' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
