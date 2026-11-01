#!/usr/bin/env node
/**
 * MCP server for Studio Tracker.
 *
 * Speaks the Model Context Protocol over stdio and forwards everything to the
 * tracker's JSON API, so a coding agent can pick up a ticket, read the project
 * context, report back and log its time without a human relaying anything.
 *
 * It carries no permissions of its own: the bearer token acts as the person
 * who issued it, and the server enforces the same project scope it enforces
 * for that person in the browser.
 *
 *   claude mcp add studio-tracker \
 *     --env STUDIO_URL=http://localhost:3210 \
 *     --env STUDIO_TOKEN=stk_… \
 *     -- node ./mcp/studio-tracker.mjs
 *
 * No dependencies on purpose: the protocol here is a few JSON-RPC messages,
 * and a studio should be able to read this file end to end before trusting it
 * with a write token.
 */

import { createInterface } from "node:readline";

const BASE = (process.env.STUDIO_URL ?? "http://localhost:3210").replace(
  /\/+$/,
  "",
);
const TOKEN = process.env.STUDIO_TOKEN;

if (!TOKEN) {
  process.stderr.write(
    "STUDIO_TOKEN is not set. Create one at /tokens in the tracker.\n",
  );
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? data.message
        : `HTTP ${response.status}`;
    // A refusal is information, not a crash: the agent should read the reason
    // and decide what to do, exactly as a developer would.
    throw new Error(message);
  }

  return data;
}

const TOOLS = [
  {
    name: "whoami",
    description:
      "Who this token acts as, what it may do, and which projects it can see. Call this first.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("/api/v1/me"),
  },
  {
    name: "list_tickets",
    description:
      "List tickets. Filters: project (key like ACME), assignee ('me', 'none' or an email), status ('open', 'done' or a status name), q (text search).",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        assignee: { type: "string" },
        status: { type: "string" },
        q: { type: "string" },
        limit: { type: "number" },
      },
    },
    run: (args) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args ?? {})) {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      }
      return api(`/api/v1/tickets?${params}`);
    },
  },
  {
    name: "get_ticket",
    description:
      "One ticket in full: description, comments, logged time, and the transitions that are legal from its current status with the conditions each one carries.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "e.g. ACME-14" } },
      required: ["key"],
    },
    run: (args) => api(`/api/v1/tickets/${encodeURIComponent(args.key)}`),
  },
  {
    name: "project_context",
    description:
      "Everything worth knowing before touching a project, as markdown: brief, budget, crew, workflow, project docs and open tickets. Read this before writing code.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string", description: "e.g. ACME" } },
      required: ["project"],
    },
    run: (args) =>
      api(`/api/v1/projects/${encodeURIComponent(args.project)}/context?format=json`),
  },
  {
    name: "move_ticket",
    description:
      "Move a ticket to a named status. The workflow may refuse; the reason comes back as an error you should report rather than retry blindly.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        to: { type: "string", description: "Status name, e.g. 'Code review'" },
      },
      required: ["key", "to"],
    },
    run: (args) =>
      api(`/api/v1/tickets/${encodeURIComponent(args.key)}/transition`, {
        method: "POST",
        body: { to: args.to },
      }),
  },
  {
    name: "comment_ticket",
    description:
      "Post a comment on a ticket: what was done, what is blocked, a link to the PR. Comments from an agent token are signed with the token's name.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" }, body: { type: "string" } },
      required: ["key", "body"],
    },
    run: (args) =>
      api(`/api/v1/tickets/${encodeURIComponent(args.key)}/comments`, {
        method: "POST",
        body: { body: args.body },
      }),
  },
  {
    name: "log_time",
    description:
      "Log hours against a ticket. Time logged through an agent token is recorded as agent work and shows up separately in the budget and the client report.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        hours: { type: "number" },
        note: { type: "string" },
        spentOn: { type: "string", description: "YYYY-MM-DD, defaults to today" },
      },
      required: ["key", "hours"],
    },
    run: (args) =>
      api(`/api/v1/tickets/${encodeURIComponent(args.key)}/worklog`, {
        method: "POST",
        body: { hours: args.hours, note: args.note, spentOn: args.spentOn },
      }),
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

async function handle(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    return reply(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "studio-tracker", version: "1.0.0" },
    });
  }

  if (method === "notifications/initialized") return;

  if (method === "tools/list") {
    return reply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) {
      return reply(id, {
        content: [{ type: "text", text: `Unknown tool: ${params?.name}` }],
        isError: true,
      });
    }

    try {
      const result = await tool.run(params.arguments ?? {});
      const text =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return reply(id, { content: [{ type: "text", text }] });
    } catch (error) {
      return reply(id, {
        content: [{ type: "text", text: String(error.message ?? error) }],
        isError: true,
      });
    }
  }

  if (id !== undefined) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
}

const input = createInterface({ input: process.stdin });

input.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  handle(message).catch((error) => {
    process.stderr.write(`studio-tracker mcp: ${error.message}\n`);
  });
});
