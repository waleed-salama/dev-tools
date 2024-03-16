import cloudProviders, { type CloudProvider } from "~/lib/cloudProviders";

const processHeaders = (
  headers: Headers,
  preferredProvider: CloudProvider | null,
) => {
  // First, it checks if preferred provider header is present and if it is, it checks if it is in the cached, uncached, or other array.
  // If it is not present, it iterates over cloudProviders to find a matching cache header, then compare its values to the cached and uncached arrays.
  // Note that multiple providers may match the same header, so all must be checked against the value found in the response.
  let cloudProvider: CloudProvider | null = null;
  let cacheResult: "" | "ERROR" | "OTHER" | "CACHED" | "UNCACHED" = "";
  let cacheStatus: string | null = null;
  const contentType = headers.get("content-type");

  // Check with preferredProvider first
  if (preferredProvider) {
    if (headers.has(preferredProvider.cacheHeader)) {
      cacheStatus = headers.get(preferredProvider.cacheHeader) ?? "";
      if (preferredProvider.cached.includes(cacheStatus)) {
        cacheResult = "CACHED";
        cloudProvider = preferredProvider;
      } else if (preferredProvider.uncached.includes(cacheStatus)) {
        cacheResult = "UNCACHED";
        cloudProvider = preferredProvider;
      } else if (preferredProvider.other.includes(cacheStatus)) {
        cacheResult = "OTHER";
        cloudProvider = preferredProvider;
      }
    }
  }

  // If still not matched, check all providers except preferredProvider
  if (!cloudProvider) {
    for (const provider of cloudProviders) {
      if (provider.name === preferredProvider?.name) continue;
      if (headers.has(provider.cacheHeader)) {
        cacheStatus = headers.get(provider.cacheHeader) ?? "";
        if (provider.cached.includes(cacheStatus)) {
          cacheResult = "CACHED";
          cloudProvider = provider;
          break;
        } else if (provider.uncached.includes(cacheStatus)) {
          cacheResult = "UNCACHED";
          cloudProvider = provider;
          break;
        } else if (provider.other.includes(cacheStatus)) {
          cacheResult = "OTHER";
          cloudProvider = provider;
          break;
        }
      }
    }
  }
  const logLevel: "VERBOSE" | "INFO" | "SUCCESS" | "WARNING" | "ERROR" =
    cacheResult === "CACHED"
      ? "SUCCESS"
      : cacheResult === "UNCACHED"
        ? "WARNING"
        : cacheResult === "OTHER"
          ? "WARNING"
          : "WARNING";
  return { cacheResult, cacheStatus, cloudProvider, contentType, logLevel };
};

export default processHeaders;
