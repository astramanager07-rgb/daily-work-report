export const metadata = { title: 'Daily Work Report' };
import './globals.css';
import { Inter } from 'next/font/google';
import Navbar from '@/components/Navbar';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        <Navbar />
        <main className="container mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}