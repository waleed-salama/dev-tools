import React from "react";
import Link from "next/link";
import Image from "next/image";

const MainNav = () => {
  return (
    <nav className="w-full bg-slate-200 dark:bg-slate-800">
      <div className="container flex h-16 items-center justify-between text-3xl font-bold">
        <Link href="/" className="tracking-tight">
          dev-tools
        </Link>
        <Link
          href="https://waleed.dev"
          className="flex items-baseline gap-2 text-sm"
        >
          by <Image src="/w-logo.svg" alt="waleed.dev" width={32} height={32} />
        </Link>
      </div>
    </nav>
  );
};

export default MainNav;
