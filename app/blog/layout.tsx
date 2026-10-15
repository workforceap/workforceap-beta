import { Plus_Jakarta_Sans } from 'next/font/google';
import './public-blog.css';

const headingFont = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-public-blog-heading' });

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className={headingFont.variable}>{children}</div>;
}
