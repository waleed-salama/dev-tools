import React from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

interface CacheURLInputProps {
  onSubmit: (url: URL) => void;
}

const CacheURLInput = ({ onSubmit }: CacheURLInputProps) => {
  const [url, setUrl] = React.useState("");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    // validate the input is a valid url without any parameters or fragments or query strings
    // and then call the onSubmit function if all is set.
    e.preventDefault();
    try {
      const validUrl: URL = new URL(url);
      onSubmit(validUrl);
    } catch (error) {
      alert("Invalid URL");
    }
  };

  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      <Label htmlFor="url-input">URL</Label>
      <Input
        id="url-input"
        type="url"
        placeholder="https://waleed.dev"
        className="max-w-96"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
        }}
      />
      <Button type={"submit"}>Start</Button>
    </form>
  );
};

export default CacheURLInput;
