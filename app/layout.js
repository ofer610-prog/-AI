import './globals.css';
import NotificationBell from '@/components/NotificationBell';
import AppNav from '@/components/AppNav';
import LawyerSidebar from '@/components/LawyerSidebar';
import GoogleExpenseConnect from '@/components/GoogleExpenseConnect';
import FormFocusKeeper from '@/components/FormFocusKeeper';

export const metadata = {
  title: 'ספרי משרד | מערכת משרד עו"ד',
  description: 'מערכת ניהול חשבונות, גבייה, וייעוץ עסקי למשרד עו"ד',
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="text-slate-800 antialiased">
        <FormFocusKeeper />
        <AppNav />
        {children}
        <LawyerSidebar />
        <NotificationBell />
        <GoogleExpenseConnect />
      </body>
    </html>
  );
}
