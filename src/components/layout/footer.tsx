import React from "react";
import ThemeSwitcher from "../theme-provider/theme-switcher";

const Footer = () => {
  return (
    <footer className="items-apart flex w-full bg-slate-200 dark:bg-slate-800">
      <div className="container flex h-16 items-center justify-between text-sm">
        ©{new Date().getFullYear()} Waleed Salama. All rights reserved.
        <ThemeSwitcher />
      </div>
    </footer>
  );
};

export default Footer;
