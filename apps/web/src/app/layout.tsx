import type { ReactNode } from 'react';

// Pages must be rendered per request so every response carries its own CSP nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Software Factory' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
