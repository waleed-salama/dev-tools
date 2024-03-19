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

// Add the font to the body element for consistent typography in elements rendering in a portal
if (typeof document !== "undefined")
  document.body.classList.add("font-mono", font.variable, "antialiased");

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <div className={`font-mono antialiased ${font.variable}`}>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </ThemeProvider>
    </div>
  );
};

export default api.withTRPC(MyApp);
