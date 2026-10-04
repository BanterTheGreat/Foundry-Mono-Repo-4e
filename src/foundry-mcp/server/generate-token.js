import { randomBytes } from "node:crypto";

// Explicit setup command; never run as part of the MCP protocol process.
console.log(randomBytes(32).toString("hex"));
