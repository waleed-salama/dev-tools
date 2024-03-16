import { type AppType } from "next/app";
import { Roboto_Mono as MainFont } from "next/font/google";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import Layout from "~/components/layout";
import { ThemeProvider } from "~/components/theme-provider";

const font = MainFont({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

if (typeof document !== "undefined")
  document.body.classList.add("font-mono", font.variable, "antialiased");

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ThemeProvider>
  );
};

export default api.withTRPC(MyApp);
