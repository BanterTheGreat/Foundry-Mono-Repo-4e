import { WebCharacterImporter } from "@modern4e/shared";
import { available, encode, failure, type Character, type Result } from "./contracts";
export type ExchangeFile = { name: string; json: string };

/** Cancellation is available null, distinct from read, codec and storage failures. */
export class BrowserFileExchange {
  receive(): Promise<Result<ExchangeFile | null>> {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.hidden = true;
      document.body.append(input);
      const finish = (result: Result<ExchangeFile | null>) => {
        input.remove();
        resolve(result);
      };
      input.addEventListener("cancel", () => finish(available(null)), { once: true });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          finish(available(null));
          return;
        }
        try {
          finish(available({ name: file.name, json: await file.text() }));
        } catch (error) {
          finish(failure("exchange.read", error));
        }
      }, { once: true });
      try {
        input.click();
      } catch (error) {
        finish(failure("exchange.select", error));
      }
    });
  }

  /** File selection enters the shared decoder/coordinator, with no implicit commit. */
  async inspectSelection(importer: WebCharacterImporter): Promise<Result<unknown>> {
    const selected = await this.receive();
    if (selected.type === "unavailable" || selected.value === null) {
      return selected;
    }
    return JSON.parse(await importer.inspect(selected.value.json));
  }

  /** Success means download dispatched; browsers cannot confirm the user's disk write. */
  async deliver(file: ExchangeFile): Promise<Result<null>> {
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }));
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name.replace(/[\\/]/g, "_");
      document.body.append(anchor);
      anchor.click();
      return available(null);
    } catch (error) {
      return failure("exchange.download", error);
    } finally {
      anchor?.remove();
      if (url) {
        const downloadUrl = url;
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  }
  async exportCharacter(document: Character, name = "character.json"): Promise<Result<null>> {
    const encoded = encode(document);
    if (encoded.type === "unavailable") {
      return encoded;
    }
    return this.deliver({ name, json: encoded.value });
  }
}
