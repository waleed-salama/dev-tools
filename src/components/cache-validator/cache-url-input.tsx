import React from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { type CacheValidatorInstanceProps } from "./cache-validator-instance";
import cloudProviders, { type CloudProvider } from "~/lib/cloudProviders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface CacheURLInputProps {
  onSubmit: (props: CacheValidatorInstanceProps) => void;
}

const providerReducer = (state: CloudProvider, action: string) => {
  const provider = cloudProviders.find((provider) => provider.name === action);
  if (provider) {
    return provider;
  }
  return state;
};

const CacheURLInput = ({ onSubmit }: CacheURLInputProps) => {
  const [url, setUrl] = React.useState("https://");
  const [formats, setFormats] = React.useState<string[]>(["avif", "webp"]);
  const [cloudProvider, setCloudProvider] = React.useReducer(
    providerReducer,
    cloudProviders[1]!,
  );

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    // validate the input is a valid url without any parameters or fragments or query strings
    // and then call the onSubmit function if all is set.
    e.preventDefault();
    try {
      const validUrl: URL = new URL(url);
      onSubmit({ url: validUrl, formats, cloudProvider });
      setUrl("https://");
    } catch (error) {
      alert("Invalid URL");
    }
  };

  React.useEffect(() => {
    // on each change of the url, check the cloud provider and set the cache header
    try {
      const validUrl: URL = new URL(url);
      const checkCacheHeader = async (url: string) => {
        try {
          const response = await fetch(`/api/check-provider?url=${url}`);
          if (response.status === 200) {
            const provider = await response.text();
            setCloudProvider(provider);
          }
        } catch (error) {}
      };
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      checkCacheHeader(validUrl.href);
    } catch (error) {}
  }, [url]);

  return (
    <form
      className="flex flex-col gap-4 rounded bg-slate-300 p-2 dark:bg-slate-700 sm:p-4"
      onSubmit={submit}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="url-input" className="font-bold">
          URL
        </Label>
        <Input
          id="url-input"
          type="url"
          placeholder="https://waleed.dev"
          className="md:w-96"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-nowrap font-bold">Image Formats</Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          aria-label="Image Formats"
          value={formats}
          onValueChange={(value) => setFormats(value)}
          className="flex grow gap-2"
        >
          <ToggleGroupItem className="grow" value="avif">
            AVIF
          </ToggleGroupItem>
          <ToggleGroupItem className="grow" value="webp">
            WebP
          </ToggleGroupItem>
          <ToggleGroupItem className="grow" value="png">
            PNG
          </ToggleGroupItem>
          <ToggleGroupItem className="grow" value="jpeg">
            JPEG
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-nowrap font-bold">Cloud Provider</Label>
        <Select value={cloudProvider.name} onValueChange={setCloudProvider}>
          <SelectTrigger className="grow">
            <SelectValue placeholder="Select a provider to set cache header" />
          </SelectTrigger>
          <SelectContent>
            {cloudProviders.map((provider) => (
              <SelectItem
                key={provider.name}
                value={provider.name}
                className="font-mono"
              >
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button className="self-end" type={"submit"}>
        Start
      </Button>
    </form>
  );
};

export default CacheURLInput;
