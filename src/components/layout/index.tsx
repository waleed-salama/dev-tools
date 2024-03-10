import React from "react";
import MainNav from "./main-nav";
import Footer from "./footer";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-slate-100 text-base leading-6 text-slate-950 dark:bg-slate-900 dark:text-slate-50">
      <MainNav />
      <main className="w-screen grow">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
