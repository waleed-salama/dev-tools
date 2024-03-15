import React from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { type CacheValidatorInstanceProps } from "./cache-validator-instance";

interface CacheURLInputProps {
  onSubmit: (props: CacheValidatorInstanceProps) => void;
}

const CacheURLInput = ({ onSubmit }: CacheURLInputProps) => {
  const [url, setUrl] = React.useState("");
  const [formats, setFormats] = React.useState<string[]>(["avif", "webp"]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    // validate the input is a valid url without any parameters or fragments or query strings
    // and then call the onSubmit function if all is set.
    e.preventDefault();
    try {
      const validUrl: URL = new URL(url);
      onSubmit({ url: validUrl, formats });
    } catch (error) {
      alert("Invalid URL");
    }
  };

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
        <Label className="font-bold">Image Formats</Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          aria-label="Image Formats"
          value={formats}
          onValueChange={(value) => setFormats(value)}
        >
          <ToggleGroupItem value="avif">AVIF</ToggleGroupItem>
          <ToggleGroupItem value="webp">WebP</ToggleGroupItem>
          <ToggleGroupItem value="png">PNG</ToggleGroupItem>
          <ToggleGroupItem value="jpeg">JPEG</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Button className="self-end" type={"submit"}>
        Start
      </Button>
    </form>
  );
};

export default CacheURLInput;
