import React from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "/public/w-logo.svg";

const MainNav = () => {
  return (
    <nav className="w-full bg-slate-200 dark:bg-slate-800">
      <div className="container flex h-16 items-center justify-between text-3xl font-bold">
        <Link href="/" className="tracking-tight">
          dev-tools
        </Link>
        <Link
          href="https://waleed.dev"
          className="flex items-baseline gap-1 text-sm"
        >
          {/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */}
          by <Image src={logo} alt="waleed.dev" width={32} />
        </Link>
      </div>
    </nav>
  );
};

export default MainNav;
