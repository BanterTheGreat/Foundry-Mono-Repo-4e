import { available, canonical, decode, encode, failure, summary, type Character, type Result, type Summary } from "./contracts";

export type SaveReceipt = { characterId: string; recoveryId: string | null };
export type RecoverySummary = { recoveryId: string; character: Summary };
export type SaveMode = "CREATE" | "REPLACE_WITH_RECOVERY";
type Recovery = { recoveryId: string; document: Character };
type Save = { document: Character; mode: SaveMode; expected?: Character | null };

/** Both object stores participate in one readwrite transaction for replacement. */
export class IndexedDbCharacterStore {
  constructor(readonly databaseName = "modern4e-characters", private readonly factory: IDBFactory = indexedDB) {}

  /** Shared CharacterStore operations, with plain detached JSON DTOs. */
  list(): Promise<Result<Summary[]>> {
    return this.operation("list") as Promise<Result<Summary[]>>;
  }
  load(id: string): Promise<Result<Character>> {
    return this.operation("load", id) as Promise<Result<Character>>;
  }
  save(document: Character, mode: SaveMode, expected: Character | null = null): Promise<Result<SaveReceipt>> {
    return this.operation("save", { document, mode, expected }) as Promise<Result<SaveReceipt>>;
  }
  delete(id: string): Promise<Result<boolean>> {
    return this.operation("delete", id) as Promise<Result<boolean>>;
  }
  listRecovery(characterId: string): Promise<Result<RecoverySummary[]>> {
    return this.operation("listRecovery", characterId) as Promise<Result<RecoverySummary[]>>;
  }
  loadRecovery(recoveryId: string): Promise<Result<Character>> {
    return this.operation("loadRecovery", recoveryId) as Promise<Result<Character>>;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let abandoned = false;
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("characters", { keyPath: "id" });
        request.result.createObjectStore("recovery", { keyPath: "recoveryId" });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(new DOMException("Close other tabs using an older database version.", "InvalidStateError"));
      };
      request.onsuccess = () => {
        if (abandoned) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  /** Resolves only on transaction completion, never on an individual request's success. */
  async operation(operation: string, payload: unknown = null): Promise<Result<unknown>> {
    let db: IDBDatabase | undefined;
    try {
      let save: Save | undefined;
      if (operation === "save") {
        save = payload as Save;
        const checked = encode(save.document);
        if (checked.type === "unavailable") {
          return checked;
        }
        save = { ...save, document: (decode(checked.value) as { value: Character }).value };
        if (save.expected) {
          const expected = encode(save.expected);
          if (expected.type === "unavailable") {
            return expected;
          }
          save.expected = (decode(expected.value) as { value: Character }).value;
        }
      }
      db = await this.open();
      const database = db;
      return await new Promise<Result<unknown>>((resolve) => {
        const writing = operation === "save" || operation === "delete";
        const tx = database.transaction(["characters", "recovery"], writing ? "readwrite" : "readonly", writing ? { durability: "strict" } : undefined);
        let result: Result<unknown> = failure("store.database", "Transaction did not produce a result.");
        const characters = tx.objectStore("characters");
        const recovery = tx.objectStore("recovery");
        const abort = (code: string, message: string) => {
          result = failure(code, message);
          tx.abort();
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => resolve(tx.error ? failure(tx.error.name === "QuotaExceededError" ? "store.quota" : "store.database", tx.error) : result.type === "unavailable" ? result : failure("store.database", "Transaction aborted before commit."));
        const read = (request: IDBRequest, use: (value: any) => void) => {
          request.onsuccess = () => {
            try {
              use(request.result);
            } catch (error) {
              result = failure(error instanceof DOMException && error.name === "QuotaExceededError" ? "store.quota" : "store.database", error);
              tx.abort();
            }
          };
        };
        switch (operation) {
          case "list":
            read(characters.getAll(), docs => { result = available(docs.map(summary)); });
            break;
          case "load":
            read(characters.get(payload as string), doc => { result = doc ? available(doc) : failure("store.missing", "Character not found."); });
            break;
          case "delete":
            read(characters.get(payload as string), doc => {
              characters.delete(payload as string);
              result = available(Boolean(doc));
            });
            break;
          case "listRecovery":
            read(recovery.getAll(), (copies: Recovery[]) => { result = available(copies.filter(copy => copy.document.id === payload).map(copy => ({ recoveryId: copy.recoveryId, character: summary(copy.document) }))); });
            break;
          case "loadRecovery":
            read(recovery.get(payload as string), copy => { result = copy ? available(copy.document) : failure("store.recoveryMissing", "Recovery copy not found."); });
            break;
          case "save": {
            const input = save!;
            read(characters.get(input.document.id), prior => {
              if (input.mode === "CREATE") {
                if (prior) {
                  abort("store.exists", "Character ID already exists.");
                  return;
                }
                characters.add(input.document);
                result = available({ characterId: input.document.id, recoveryId: null });
              } else if (input.mode === "REPLACE_WITH_RECOVERY") {
                if (!prior || !input.expected || canonical(prior) !== canonical(input.expected)) {
                  abort("store.conflict", "Character changed since the replacement preview.");
                  return;
                }
                const recoveryId = crypto.randomUUID();
                recovery.add({ recoveryId, document: prior });
                characters.put(input.document);
                result = available({ characterId: input.document.id, recoveryId });
              } else {
                abort("store.mode", "Unknown save mode.");
              }
            });
            break;
          }
          default:
            abort("store.operation", "Unknown store operation.");
        }
      });
    } catch (error) {
      return failure(error instanceof DOMException && error.name === "QuotaExceededError" ? "store.quota" : "store.database", error);
    } finally {
      db?.close();
    }
  }

  /** Wire protocol consumed by the generated Kotlin/JS shared importer. */
  readonly call = async (operation: string, json: string): Promise<string> => JSON.stringify(await this.operation(operation, JSON.parse(json)));
}
